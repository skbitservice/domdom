import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reel, ReelAuthor } from '@domdom/types';
import { getCurrentUserId } from './social';
import { getCollabContentIds } from './collaborations';

/**
 * Reels API — short vertical video (Step 6).
 *
 * Storage: the client uploads to the public `reel-media` bucket (50 MB,
 * MP4/MOV/WEBM — enforced by the bucket itself) and only then writes the
 * `reels` row, which RLS ties to `auth.uid()`. Engagement reads rely on the
 * public like/comment policies; writes are own-row only.
 */

const AUTHOR_COLUMNS = 'id, username, avatar_url, is_verified';

const REEL_COLUMNS =
  'id, user_id, video_url, thumbnail_url, caption, audio_name, duration, views_count, created_at, updated_at';

const REEL_WITH_AUTHOR = `
  ${REEL_COLUMNS},
  author:profiles!reels_user_id_fkey(${AUTHOR_COLUMNS}),
  likes:reel_likes(count),
  comments:reel_comments(count)
`;

/** One reel of the feed, denormalised for the player UI. */
export interface ReelFeedItem {
  reel: Reel;
  author: ReelAuthor;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

export interface ReelCommentItem {
  id: string;
  reel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: ReelAuthor;
}

interface ReelRow extends Reel {
  author: ReelAuthor | ReelAuthor[] | null;
  likes?: { count: number }[];
  comments?: { count: number }[];
}

const VIDEO_MIME_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function resolveAuthor(author: ReelRow['author']): ReelAuthor {
  const value = Array.isArray(author) ? author[0] : author;
  if (!value) throw new Error('This reel has no readable author.');
  return value;
}

function toFeedItem(row: ReelRow, likedIds: Set<string>): ReelFeedItem {
  const { author, likes, comments, ...reel } = row;
  return {
    reel,
    author: resolveAuthor(author),
    likes_count: likes?.[0]?.count ?? 0,
    comments_count: comments?.[0]?.count ?? 0,
    liked_by_me: likedIds.has(reel.id),
  };
}

/** Path inside the bucket derived from a public object URL. */
function storagePath(publicUrl: string | null, bucket: string): string | null {
  if (!publicUrl) return null;
  const marker = `/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length).split('?')[0] ?? '');
}

/**
 * Newest reels first, paginated with `before` = `created_at` of the last
 * item you already have. Private accounts and blocked users are filtered by
 * the `reels` SELECT policy, so this never has to re-implement visibility.
 */
export async function getReelsFeed(
  client: SupabaseClient,
  options: { limit?: number; before?: string } = {},
): Promise<ReelFeedItem[]> {
  const { limit = 8, before } = options;

  let query = client
    .from('reels')
    .select(REEL_WITH_AUTHOR)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReelRow[];
  if (rows.length === 0) return [];

  // Which of these did I already like? One query for the whole page.
  let myId: string | null = null;
  try {
    myId = await getCurrentUserId(client);
  } catch {
    // Not signed in — likedIds stays empty
  }
  const likedIds = new Set<string>();
  if (myId) {
    const { data: likes, error: likesError } = await client
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', myId)
      .in(
        'reel_id',
        rows.map((row) => row.id),
      );
    if (likesError) throw likesError;
    for (const like of likes ?? []) likedIds.add(like.reel_id);
  }

  return rows.map((row) => toFeedItem(row, likedIds));
}

/**
 * One profile's reels, newest first — plus reels from collaborations this user
 * ACCEPTED (same reel id, so views / likes / comments / shares are shared).
 * Pending invitations never appear here. RLS still decides visibility.
 */
export async function getUserReels(
  client: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<ReelFeedItem[]> {
  const collabIds = await getCollabContentIds(client, 'reel', userId);

  let query = client
    .from('reels')
    .select(REEL_WITH_AUTHOR)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (collabIds.length > 0) {
    query = query.or(`user_id.eq.${userId},id.in.(${collabIds.join(',')})`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReelRow[];
  if (rows.length === 0) return [];

  let myId: string | null = null;
  try {
    myId = await getCurrentUserId(client);
  } catch {
    // Not signed in — likedIds stays empty
  }
  const likedIds = new Set<string>();
  if (myId) {
    const { data: likes, error: likesError } = await client
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', myId)
      .in(
        'reel_id',
        rows.map((row) => row.id),
      );
    if (likesError) throw likesError;
    for (const like of likes ?? []) likedIds.add(like.reel_id);
  }

  return rows.map((row) => toFeedItem(row, likedIds));
}

export interface CreateReelInput {
  /** Raw video file (already validated with `validateVideoFile` + `hasVideoSignature`). */
  video: Blob & { name: string; type: string };
  /** Optional poster frame, captured from the video before upload. */
  thumbnail?: Blob | null;
  caption?: string | null;
  /** Original sound credit — free tier has no audio library to pick from. */
  audioName?: string | null;
  /** Duration in seconds as read from the video element. */
  duration?: number | null;
}

/**
 * Upload the media, then insert the row. The upload happens first so a
 * `reels` row can never point at a file that does not exist; if the insert
 * fails the freshly uploaded objects are removed again (leaked files would
 * eat the 1 GB free storage tier).
 */
export async function createReel(client: SupabaseClient, input: CreateReelInput): Promise<Reel> {
  const myId = await getCurrentUserId(client);

  const extension = VIDEO_MIME_EXTENSION[input.video.type];
  if (!extension) throw new Error('Only MP4, MOV or WEBM videos are allowed.');

  const base = `${myId}/${crypto.randomUUID()}`;
  const videoPath = `${base}.${extension}`;
  const thumbnailPath = `${base}.jpg`;

  const { error: uploadError } = await client.storage.from('reel-media').upload(videoPath, input.video, {
    contentType: input.video.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  let thumbnailUrl: string | null = null;
  if (input.thumbnail) {
    const { error } = await client.storage.from('reel-media').upload(thumbnailPath, input.thumbnail, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) {
      console.warn('reel thumbnail skipped:', error.message);
    } else {
      thumbnailUrl = client.storage.from('reel-media').getPublicUrl(thumbnailPath).data.publicUrl;
    }
  }

  const duration =
    typeof input.duration === 'number' && Number.isFinite(input.duration)
      ? Math.max(0, Math.round(input.duration))
      : null;

  const { data, error } = await client
    .from('reels')
    .insert({
      user_id: myId,
      video_url: client.storage.from('reel-media').getPublicUrl(videoPath).data.publicUrl,
      thumbnail_url: thumbnailUrl,
      caption: input.caption?.trim() || null,
      audio_name: input.audioName?.trim() || null,
      duration,
    })
    .select('*')
    .single();

  if (error) {
    const leftovers = [videoPath, ...(thumbnailUrl ? [thumbnailPath] : [])];
    await client.storage.from('reel-media').remove(leftovers).catch(() => undefined);
    throw error;
  }

  return data;
}

/** Delete a reel and best-effort remove its media (row first — storage may lag). */
export async function deleteReel(client: SupabaseClient, reel: Reel): Promise<void> {
  const { error } = await client.from('reels').delete().eq('id', reel.id);
  if (error) throw error;

  const paths = [storagePath(reel.video_url, 'reel-media'), storagePath(reel.thumbnail_url, 'reel-media')].filter(
    (path): path is string => path !== null,
  );
  if (paths.length === 0) return;

  const { error: removeError } = await client.storage.from('reel-media').remove(paths);
  if (removeError) console.warn('reel file cleanup skipped:', removeError.message);
}

/** Like or unlike a reel; both directions are idempotent (unique constraint). */
export async function setReelLike(client: SupabaseClient, reelId: string, liked: boolean): Promise<void> {
  const myId = await getCurrentUserId(client);

  if (liked) {
    const { error } = await client.from('reel_likes').insert({ reel_id: reelId, user_id: myId });
    if (error) {
      if (error.code !== '23505') throw error; // already liked
      return;
    }
    await notifyReelOwner(client, reelId, myId);
    return;
  }

  const { error } = await client
    .from('reel_likes')
    .delete()
    .eq('reel_id', reelId)
    .eq('user_id', myId);
  if (error) throw error;
  // The 'reel_like' notification is withdrawn by the
  // reels_cleanup_like_notification trigger (SECURITY DEFINER, migration
  // 00014) — the liker can never delete it directly: notifications are only
  // SELECTable by their recipient, and a DELETE must pass the SELECT policy.
}

/**
 * Best-effort `reel_like` notification — never breaks the like itself.
 * Self-likes are skipped (the `notifications_no_self` check would reject
 * them), and unliking cleans the row up again via the DB trigger.
 */
async function notifyReelOwner(
  client: SupabaseClient,
  reelId: string,
  actorId: string,
): Promise<void> {
  const { data: reel, error: reelError } = await client
    .from('reels')
    .select('user_id')
    .eq('id', reelId)
    .maybeSingle();
  if (reelError || !reel || reel.user_id === actorId) return;

  const { error } = await client
    .from('notifications')
    .insert({ recipient_id: reel.user_id, actor_id: actorId, type: 'reel_like', reel_id: reelId });
  if (error) console.warn('notification insert skipped:', error.message);
}

/** Comments on a reel, oldest first (readable by anyone who can see the reel). */
export async function getReelComments(client: SupabaseClient, reelId: string): Promise<ReelCommentItem[]> {
  const { data, error } = await client
    .from('reel_comments')
    .select(`id, reel_id, user_id, content, created_at, author:profiles!reel_comments_user_id_fkey(${AUTHOR_COLUMNS})`)
    .eq('reel_id', reelId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const author = resolveAuthor((row as unknown as { author: ReelAuthor | ReelAuthor[] | null }).author);
    return [{ ...(row as unknown as Omit<ReelCommentItem, 'author'>), author }];
  });
}

export async function addReelComment(
  client: SupabaseClient,
  reelId: string,
  content: string,
): Promise<ReelCommentItem> {
  const trimmed = content.trim();
  if (trimmed.length < 1) throw new Error('Write something first.');
  if (trimmed.length > 500) throw new Error('Comments can be at most 500 characters.');

  const myId = await getCurrentUserId(client);
  const { data, error } = await client
    .from('reel_comments')
    .insert({ reel_id: reelId, user_id: myId, content: trimmed })
    .select(`id, reel_id, user_id, content, created_at, author:profiles!reel_comments_user_id_fkey(${AUTHOR_COLUMNS})`)
    .single();
  if (error) throw error;

  const row = data as unknown as Omit<ReelCommentItem, 'author'> & {
    author: ReelAuthor | ReelAuthor[] | null;
  };
  return { ...row, author: resolveAuthor(row.author) };
}

/** Removes your own comment (RLS also restricts the delete to own rows). */
export async function deleteReelComment(client: SupabaseClient, commentId: string): Promise<void> {
  const { error } = await client.from('reel_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/**
 * Records one view through the SECURITY DEFINER function from migration
 * 00011 (the UPDATE policy would reject a viewer otherwise). Best effort:
 * if the migration has not been applied yet the counter simply stays put.
 */
export async function countReelView(client: SupabaseClient, reelId: string): Promise<void> {
  const { error } = await client.rpc('increment_reel_view', { p_reel_id: reelId });
  if (error) console.warn('reel view skipped:', error.message);
}
