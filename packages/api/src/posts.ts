import type { SupabaseClient } from '@supabase/supabase-js';
import { getFollowing } from './social';
import { getCollabContentIds } from './collaborations';
import type { ShareType } from '@domdom/types';
import { checkMediaSignature } from '@domdom/utils';

/**
 * Posts, likes and comments API.
 *
 * Visibility is enforced entirely by RLS (migration 00003): private profiles,
 * follower-only posts and blocked users are filtered server-side — this layer
 * never re-implements those rules, it just asks for rows and gets the ones the
 * caller is allowed to see.
 */

/** Plan-mandated upload limits for post images. */
export const MAX_POST_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_POST_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const POST_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const MAX_CAPTION_LENGTH = 2200;
export const MAX_MEDIA_PER_POST = 10;

export interface PostRow {
  id: string;
  user_id: string;
  caption: string | null;
  location: string | null;
  visibility: 'public' | 'followers' | 'private';
  is_draft: boolean;
  is_archived: boolean;
  comments_disabled: boolean;
  hide_like_count: boolean;
  share_count: number;
  created_at: string;
  updated_at: string;
}

export interface PostMediaRow {
  id: string;
  post_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
}

export interface PostAuthor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_private: boolean;
}

/** Post + embedded author, media and engagement counts, as fetched. */
interface PostWithEmbeds extends PostRow {
  author: PostAuthor | null;
  media: PostMediaRow[];
  likes: { count: number }[];
  comments: { count: number }[];
  hashtags: { hashtag: string }[];
  saved_by_me: { id: string }[];
}

/** Normalised shape the UI consumes. */
export interface FeedPost {
  post: PostRow;
  author: PostAuthor | null;
  media: PostMediaRow[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  hashtags: string[];
  savedByMe: boolean;
}

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  author: PostAuthor | null;
}

const POST_SELECT = [
  'id', 'user_id', 'caption', 'location', 'visibility', 'is_draft', 'is_archived',
  'comments_disabled', 'hide_like_count', 'share_count', 'created_at', 'updated_at',
  'author:profiles!posts_user_id_fkey(id, username, full_name, avatar_url, is_verified, is_private)',
  'media:post_media(id, post_id, media_url, media_type, thumbnail_url, width, height, sort_order)',
  'likes(count)',
  'comments(count)',
  'hashtags:post_hashtags(hashtag)',
  'saved_by_me:saved_posts!saved_posts_post_id_fkey(id)',
].join(', ');

const COMMENT_SELECT = [
  'id', 'post_id', 'user_id', 'parent_id', 'content', 'created_at', 'updated_at',
  'author:profiles!comments_user_id_fkey(id, username, full_name, avatar_url, is_verified, is_private)',
].join(', ');

async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to do that.');
  return data.user.id;
}

/** Which of these posts has the viewer liked? (empty for logged-out viewers) */
async function likedPostIds(
  client: SupabaseClient,
  viewerId: string | null,
  postIds: string[],
): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();
  const { data, error } = await client
    .from('likes')
    .select('post_id')
    .eq('user_id', viewerId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id));
}

async function assemble(
  client: SupabaseClient,
  rows: PostWithEmbeds[],
  viewerId: string | null,
): Promise<FeedPost[]> {
  const liked = await likedPostIds(client, viewerId, rows.map((r) => r.id));
  return rows.map((row) => ({
    post: {
      id: row.id,
      user_id: row.user_id,
      caption: row.caption,
      location: row.location,
      visibility: row.visibility,
      is_draft: row.is_draft,
      is_archived: row.is_archived,
      comments_disabled: row.comments_disabled,
      hide_like_count: row.hide_like_count,
      share_count: row.share_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    author: row.author,
    media: [...row.media].sort((a, b) => a.sort_order - b.sort_order),
    likeCount: row.likes?.[0]?.count ?? 0,
    commentCount: row.comments?.[0]?.count ?? 0,
    likedByMe: liked.has(row.id),
    hashtags: (row.hashtags ?? []).map((h) => h.hashtag),
    savedByMe: viewerId !== null && (row.saved_by_me ?? []).length > 0,
  }));
}

/**
 * Create a post: validate + upload media to storage, insert the post and
 * its media rows. Supports multiple photos/videos, hashtags, mentions,
 * privacy settings, and draft mode. If any later step fails, earlier
 * artefacts are rolled back best-effort.
 */
export async function createPost(
  client: SupabaseClient,
  input: {
    caption: string;
    files: File[];
    location?: string;
    visibility?: 'public' | 'followers' | 'private';
    isDraft?: boolean;
  },
): Promise<FeedPost> {
  const caption = input.caption.trim();
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(`Captions are limited to ${MAX_CAPTION_LENGTH} characters.`);
  }
  if (input.files.length === 0) {
    throw new Error('Choose at least one photo or video.');
  }
  if (input.files.length > MAX_MEDIA_PER_POST) {
    throw new Error(`You can upload up to ${MAX_MEDIA_PER_POST} photos/videos per post.`);
  }

  // Validate all files first
  for (const file of input.files) {
    const isImage = (POST_IMAGE_TYPES as readonly string[]).includes(file.type);
    const isVideo = (POST_VIDEO_TYPES as readonly string[]).includes(file.type);
    if (!isImage && !isVideo) {
      throw new Error('Please choose JPEG, PNG, WebP images or MP4, WebM videos.');
    }
    if (isImage && file.size > MAX_POST_IMAGE_BYTES) {
      throw new Error('Images must be 8 MB or smaller.');
    }
    if (isVideo && file.size > MAX_POST_VIDEO_BYTES) {
      throw new Error('Videos must be 100 MB or smaller.');
    }
    // Defense in depth: verify file magic bytes match declared type (security rule 4)
    const signatureError = await checkMediaSignature(file, file.type);
    if (signatureError) throw new Error(signatureError);
  }

  const myId = await currentUserId(client);

  // Upload all media files
  const uploadedMedia: { path: string; publicUrl: string; mediaType: 'image' | 'video' }[] = [];
  for (const file of input.files) {
    const isImage = (POST_IMAGE_TYPES as readonly string[]).includes(file.type);
    const extension = file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
      : file.type === 'video/mp4' ? 'mp4'
      : file.type === 'video/webm' ? 'webm'
      : 'jpg';
    const path = `${myId}/${crypto.randomUUID()}.${extension}`;

    const upload = await client.storage
      .from('post-media')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      // Roll back already uploaded files
      for (const media of uploadedMedia) {
        await client.storage.from('post-media').remove([media.path]).catch(() => undefined);
      }
      throw new Error(`Upload failed: ${upload.error.message}`);
    }

    const { data: { publicUrl } } = client.storage.from('post-media').getPublicUrl(path);
    uploadedMedia.push({ path, publicUrl, mediaType: isImage ? 'image' : 'video' });
  }

  // Insert the post
  const { data: post, error: postError } = await client
    .from('posts')
    .insert({
      user_id: myId,
      caption: caption || null,
      location: input.location?.trim() || null,
      visibility: input.visibility || 'public',
      is_draft: input.isDraft || false,
    })
    .select('id')
    .single();

  if (postError) {
    for (const media of uploadedMedia) {
      await client.storage.from('post-media').remove([media.path]).catch(() => undefined);
    }
    throw postError;
  }

  // Insert media rows
  const mediaRows = uploadedMedia.map((media, index) => ({
    post_id: post.id,
    media_url: media.publicUrl,
    media_type: media.mediaType,
    sort_order: index,
  }));

  const { error: mediaError } = await client.from('post_media').insert(mediaRows);
  if (mediaError) {
    await client.from('posts').delete().eq('id', post.id);
    for (const media of uploadedMedia) {
      await client.storage.from('post-media').remove([media.path]).catch(() => undefined);
    }
    throw mediaError;
  }

  // Extract and store hashtags
  const hashtags = extractHashtags(caption);
  if (hashtags.length > 0) {
    const hashtagRows = hashtags.map((tag) => ({ post_id: post.id, hashtag: tag }));
    await client.from('post_hashtags').insert(hashtagRows);
  }

  // Extract and store mentions
  const mentions = extractMentions(caption);
  if (mentions.length > 0) {
    const { data: mentionedUsers } = await client
      .from('profiles')
      .select('id, username')
      .in('username', mentions);

    if (mentionedUsers && mentionedUsers.length > 0) {
      const mentionRows = mentionedUsers.map((user) => ({
        post_id: post.id,
        mentioned_user_id: user.id,
      }));
      await client.from('post_mentions').insert(mentionRows);

      // Send mention notifications
      for (const user of mentionedUsers) {
        if (user.id !== myId) {
          await client
            .from('notifications')
            .insert({
              recipient_id: user.id,
              actor_id: myId,
              type: 'mention',
              post_id: post.id,
            });
        }
      }
    }
  }

  const created = await getPost(client, post.id, myId);
  if (!created) throw new Error('The post was created but could not be loaded back.');
  return created;
}

/** The home feed: your own posts + posts from accounts you follow + posts
 *  from collaborations you accepted (same content id, shared engagement). */
export async function getFeed(
  client: SupabaseClient,
  viewerId: string,
  limit = 20,
): Promise<FeedPost[]> {
  const following = await getFollowing(client, viewerId);
  const userIds = [viewerId, ...following.map((p) => p.id)];
  const collabIds = await getCollabContentIds(client, 'post', viewerId);

  let query = client
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (collabIds.length > 0) {
    query = query.or(`user_id.in.(${userIds.join(',')}),id.in.(${collabIds.join(',')})`);
  } else {
    query = query.in('user_id', userIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assemble(client, (data ?? []) as unknown as PostWithEmbeds[], viewerId);
}

/**
 * One profile's posts (RLS decides which are visible to the caller) — plus
 * posts from collaborations this user ACCEPTED. Pending invitations never
 * appear here, so invited content stays off the profile until accepted.
 */
export async function getUserPosts(
  client: SupabaseClient,
  userId: string,
  viewerId: string | null,
  limit = 12,
): Promise<FeedPost[]> {
  const collabIds = await getCollabContentIds(client, 'post', userId);

  let query = client
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (collabIds.length > 0) {
    query = query.or(`user_id.eq.${userId},id.in.(${collabIds.join(',')})`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assemble(client, (data ?? []) as unknown as PostWithEmbeds[], viewerId);
}

/**
 * Explore: the newest posts across the platform. RLS on `posts` decides what
 * the viewer may see (private profiles, follower-only posts and blocked users
 * are already filtered server-side), so this is deliberately a plain
 * newest-first query — no visibility rules are re-implemented here.
 */
export async function getExplorePosts(
  client: SupabaseClient,
  viewerId: string | null,
  limit = 30,
): Promise<FeedPost[]> {
  const { data, error } = await client
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return assemble(client, (data ?? []) as unknown as PostWithEmbeds[], viewerId);
}

/** A single post. Returns null when it does not exist or RLS hides it. */
export async function getPost(
  client: SupabaseClient,
  postId: string,
  viewerId: string | null,
): Promise<FeedPost | null> {
  const { data, error } = await client
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await assemble(client, [data as unknown as PostWithEmbeds], viewerId);
  return post ?? null;
}

/** Like (liked=true) or unlike (liked=false) a post. Idempotent. */
export async function setLiked(
  client: SupabaseClient,
  postId: string,
  liked: boolean,
): Promise<void> {
  const myId = await currentUserId(client);
  if (liked) {
    const { error } = await client
      .from('likes')
      .insert({ user_id: myId, post_id: postId });
    if (error && error.code !== '23505') {
      if (error.code === '42501') {
        throw new Error("You can't like this post.");
      }
      throw error;
    }
    if (!error || error.code === '23505') {
      await notifyPostOwnerOfLike(client, postId, myId);
    }
  } else {
    const { error } = await client
      .from('likes')
      .delete()
      .eq('user_id', myId)
      .eq('post_id', postId);
    if (error) throw error;
    // The 'like' notification is withdrawn by the
    // posts_cleanup_like_notification trigger (SECURITY DEFINER, migration
    // 00016) — the liker can never delete it directly: notifications are only
    // SELECTable by their recipient, and a DELETE must pass the SELECT policy.
  }
}

/**
 * Best-effort `like` notification — never breaks the like itself.
 * Self-likes are skipped (the `notifications_no_self` check would reject
 * them), and unliking cleans the row up again via the DB trigger.
 */
async function notifyPostOwnerOfLike(
  client: SupabaseClient,
  postId: string,
  actorId: string,
): Promise<void> {
  const { data: post, error: postError } = await client
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .maybeSingle();
  if (postError || !post || post.user_id === actorId) return;

  const { error } = await client
    .from('notifications')
    .insert({ recipient_id: post.user_id, actor_id: actorId, type: 'like', post_id: postId });
  if (error) console.warn('notification insert skipped:', error.message);
}

export async function listComments(
  client: SupabaseClient,
  postId: string,
  limit = 100,
): Promise<CommentRow[]> {
  const { data, error } = await client
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CommentRow[];
}

export async function addComment(
  client: SupabaseClient,
  postId: string,
  content: string,
): Promise<CommentRow> {
  const myId = await currentUserId(client);
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Write something first.');
  if (trimmed.length > 1000) throw new Error('Comments are limited to 1000 characters.');

  const { data, error } = await client
    .from('comments')
    .insert({ post_id: postId, user_id: myId, content: trimmed })
    .select(COMMENT_SELECT)
    .single();
  if (error) {
    if (error.code === '42501') throw new Error("You can't comment on this post.");
    throw error;
  }
  await notifyPostOwnerOfComment(client, postId, myId);
  return data as unknown as CommentRow;
}

/**
 * Best-effort `comment` notification — never breaks the comment itself.
 * Self-comments are skipped (the `notifications_no_self` check would reject
 * them), and deleting the comment cleans the row up again via the DB trigger
 * (migration 00017).
 */
async function notifyPostOwnerOfComment(
  client: SupabaseClient,
  postId: string,
  actorId: string,
): Promise<void> {
  const { data: post, error: postError } = await client
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .maybeSingle();
  if (postError || !post || post.user_id === actorId) return;

  const { error } = await client
    .from('notifications')
    .insert({ recipient_id: post.user_id, actor_id: actorId, type: 'comment', post_id: postId });
  if (error) console.warn('notification insert skipped:', error.message);
}

/** Removes your own comment (RLS also restricts the delete to own rows). */
export async function deleteComment(client: SupabaseClient, commentId: string): Promise<void> {
  const { error } = await client.from('comments').delete().eq('id', commentId);
  if (error) throw error;
  // The 'comment' notification is withdrawn by the
  // comments_cleanup_notification trigger (SECURITY DEFINER, migration
  // 00017) — the comment author can never delete it directly.
}

/** Extract the storage path from a public object URL. */
function pathFromPublicUrl(url: string): string | null {
  const marker = '/object/public/post-media/';
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

/**
 * Delete a post: rows first (media cascades), then its storage objects
 * best-effort. Only ever called on posts the viewer owns — RLS enforces that.
 */
export async function deletePost(client: SupabaseClient, postId: string): Promise<void> {
  const { data: media, error: mediaError } = await client
    .from('post_media')
    .select('media_url')
    .eq('post_id', postId);
  if (mediaError) throw mediaError;

  const { error } = await client.from('posts').delete().eq('id', postId);
  if (error) throw error;

  const paths = (media ?? [])
    .map((row) => pathFromPublicUrl(row.media_url))
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    const { error: removeError } = await client.storage.from('post-media').remove(paths);
    if (removeError) console.warn('storage cleanup skipped:', removeError.message);
  }
}

// ===========================================================================
// Post management
// ===========================================================================

/** Edit a post's caption and/or location. */
export async function editPost(
  client: SupabaseClient,
  postId: string,
  updates: { caption?: string; location?: string },
): Promise<FeedPost> {
  const myId = await currentUserId(client);
  const { data, error } = await client
    .from('posts')
    .update({
      ...(updates.caption !== undefined && { caption: updates.caption.trim() || null }),
      ...(updates.location !== undefined && { location: updates.location.trim() || null }),
    })
    .eq('id', postId)
    .select('id')
    .single();
  if (error) throw error;

  // Update hashtags if caption changed
  if (updates.caption !== undefined) {
    await client.from('post_hashtags').delete().eq('post_id', postId);
    const hashtags = extractHashtags(updates.caption);
    if (hashtags.length > 0) {
      await client.from('post_hashtags').insert(
        hashtags.map((tag) => ({ post_id: postId, hashtag: tag })),
      );
    }
  }

  const updated = await getPost(client, postId, myId);
  if (!updated) throw new Error('The post was updated but could not be loaded back.');
  return updated;
}

/** Archive a post (hidden from feeds but not deleted). */
export async function archivePost(client: SupabaseClient, postId: string): Promise<void> {
  const { error } = await client
    .from('posts')
    .update({ is_archived: true })
    .eq('id', postId);
  if (error) throw error;
}

/** Restore an archived post. */
export async function restorePost(client: SupabaseClient, postId: string): Promise<void> {
  const { error } = await client
    .from('posts')
    .update({ is_archived: false })
    .eq('id', postId);
  if (error) throw error;
}

/** Enable or disable comments on a post. */
export async function setCommentsDisabled(
  client: SupabaseClient,
  postId: string,
  disabled: boolean,
): Promise<void> {
  const { error } = await client
    .from('posts')
    .update({ comments_disabled: disabled })
    .eq('id', postId);
  if (error) throw error;
}

/** Show or hide the like count on a post. */
export async function setHideLikeCount(
  client: SupabaseClient,
  postId: string,
  hide: boolean,
): Promise<void> {
  const { error } = await client
    .from('posts')
    .update({ hide_like_count: hide })
    .eq('id', postId);
  if (error) throw error;
}

// ===========================================================================
// Save / Bookmark
// ===========================================================================

/** Save (bookmark) a post. */
export async function savePost(client: SupabaseClient, postId: string): Promise<void> {
  const myId = await currentUserId(client);
  const { error } = await client
    .from('saved_posts')
    .insert({ user_id: myId, post_id: postId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Unsave (unbookmark) a post. */
export async function unsavePost(client: SupabaseClient, postId: string): Promise<void> {
  const myId = await currentUserId(client);
  const { error } = await client
    .from('saved_posts')
    .delete()
    .eq('user_id', myId)
    .eq('post_id', postId);
  if (error) throw error;
}

/** Get all posts saved by the current user. */
export async function getSavedPosts(
  client: SupabaseClient,
  viewerId: string,
  limit = 50,
): Promise<FeedPost[]> {
  const { data: saved, error: savedError } = await client
    .from('saved_posts')
    .select('post_id')
    .eq('user_id', viewerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (savedError) throw savedError;

  const postIds = (saved ?? []).map((s) => s.post_id);
  if (postIds.length === 0) return [];

  const { data, error } = await client
    .from('posts')
    .select(POST_SELECT)
    .in('id', postIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return assemble(client, (data ?? []) as unknown as PostWithEmbeds[], viewerId);
}

// ===========================================================================
// Shares
// ===========================================================================

/** Record a share event and notify the post owner. */
export async function sharePost(
  client: SupabaseClient,
  postId: string,
  shareType: ShareType,
  recipientId?: string,
): Promise<void> {
  const myId = await currentUserId(client);
  const { error } = await client
    .from('shares')
    .insert({
      post_id: postId,
      user_id: myId,
      share_type: shareType,
      recipient_id: recipientId || null,
    });
  if (error) throw error;

  // Notify the post owner (except for copy_link/external shares)
  if (shareType === 'dm' || shareType === 'story') {
    const { data: post } = await client
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .maybeSingle();
    if (post && post.user_id !== myId) {
      await client
        .from('notifications')
        .insert({
          recipient_id: post.user_id,
          actor_id: myId,
          type: 'share',
          post_id: postId,
        });
    }
  }
}

/** Get share count for a post. */
export async function getShareCount(client: SupabaseClient, postId: string): Promise<number> {
  const { count, error } = await client
    .from('shares')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (error) throw error;
  return count ?? 0;
}

// ===========================================================================
// Comment likes
// ===========================================================================

/** Like or unlike a comment. */
export async function setCommentLiked(
  client: SupabaseClient,
  commentId: string,
  liked: boolean,
): Promise<void> {
  const myId = await currentUserId(client);
  if (liked) {
    const { error } = await client
      .from('comment_likes')
      .insert({ user_id: myId, comment_id: commentId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await client
      .from('comment_likes')
      .delete()
      .eq('user_id', myId)
      .eq('comment_id', commentId);
    if (error) throw error;
  }
}

/** Get like count and whether the current user liked a comment. */
export async function getCommentLikeStatus(
  client: SupabaseClient,
  commentId: string,
  viewerId: string | null,
): Promise<{ count: number; likedByMe: boolean }> {
  const { count, error } = await client
    .from('comment_likes')
    .select('id', { count: 'exact', head: true })
    .eq('comment_id', commentId);
  if (error) throw error;

  let likedByMe = false;
  if (viewerId) {
    const { data } = await client
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', viewerId)
      .maybeSingle();
    likedByMe = !!data;
  }

  return { count: count ?? 0, likedByMe };
}

// ===========================================================================
// Comment replies
// ===========================================================================

/** Add a reply to a comment (threaded). */
export async function addReply(
  client: SupabaseClient,
  postId: string,
  parentCommentId: string,
  content: string,
): Promise<CommentRow> {
  const myId = await currentUserId(client);
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Write something first.');
  if (trimmed.length > 1000) throw new Error('Comments are limited to 1000 characters.');

  const { data, error } = await client
    .from('comments')
    .insert({ post_id: postId, user_id: myId, parent_id: parentCommentId, content: trimmed })
    .select(COMMENT_SELECT)
    .single();
  if (error) {
    if (error.code === '42501') throw new Error("You can't comment on this post.");
    throw error;
  }

  // Notify the parent comment author
  const { data: parentComment } = await client
    .from('comments')
    .select('user_id')
    .eq('id', parentCommentId)
    .maybeSingle();
  if (parentComment && parentComment.user_id !== myId) {
    await client
      .from('notifications')
      .insert({
        recipient_id: parentComment.user_id,
        actor_id: myId,
        type: 'comment',
        post_id: postId,
        comment_id: (data as any)?.id,
      });
  }

  // Extract mentions from reply
  const mentions = extractMentions(trimmed);
  if (mentions.length > 0) {
    const { data: mentionedUsers } = await client
      .from('profiles')
      .select('id, username')
      .in('username', mentions);
    if (mentionedUsers && mentionedUsers.length > 0) {
      for (const user of mentionedUsers) {
        if (user.id !== myId) {
          await client.from('notifications').insert({
            recipient_id: user.id,
            actor_id: myId,
            type: 'mention',
            post_id: postId,
            comment_id: (data as any)?.id,
          });
        }
      }
    }
  }

  return data as unknown as CommentRow;
}

// ===========================================================================
// Who liked a post
// ===========================================================================

/** Get the list of users who liked a post. */
export async function getPostLikers(
  client: SupabaseClient,
  postId: string,
  limit = 50,
): Promise<PostAuthor[]> {
  const { data, error } = await client
    .from('likes')
    .select('user_id, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const userIds = (data ?? []).map((row) => row.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, is_private')
    .in('id', userIds);
  if (profileError) throw profileError;

  return (profiles ?? []) as unknown as PostAuthor[];
}

// ===========================================================================
// Pagination
// ===========================================================================

/** Get a page of feed posts with cursor-based pagination. */
export async function getFeedPage(
  client: SupabaseClient,
  viewerId: string,
  options: { limit?: number; before?: string } = {},
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { limit = 20, before } = options;
  const following = await getFollowing(client, viewerId);
  const userIds = [viewerId, ...following.map((p) => p.id)];

  let query = client
    .from('posts')
    .select(POST_SELECT)
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // fetch one extra to determine if there's a next page

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as PostWithEmbeds[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const posts = await assemble(client, pageRows, viewerId);

  const nextCursor = hasMore && pageRows.length > 0
    ? pageRows[pageRows.length - 1]?.created_at ?? null
    : null;

  return { posts, nextCursor };
}

/** Get a page of explore posts with cursor-based pagination. */
export async function getExplorePage(
  client: SupabaseClient,
  viewerId: string | null,
  options: { limit?: number; before?: string } = {},
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { limit = 30, before } = options;

  let query = client
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as PostWithEmbeds[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const posts = await assemble(client, pageRows, viewerId);

  const nextCursor = hasMore && pageRows.length > 0
    ? pageRows[pageRows.length - 1]?.created_at ?? null
    : null;

  return { posts, nextCursor };
}

/** Extract hashtags from text (client-side helper) */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#([A-Za-z0-9_]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].filter((t) => t.length <= 100);
}

/** Extract mentions from text (client-side helper) */
function extractMentions(text: string): string[] {
  const matches = text.match(/@([A-Za-z0-9_.]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].filter((t) => t.length <= 30);
}