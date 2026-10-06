import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaKind, Story, StoryViewer } from '@domdom/types';

/**
 * Stories API (24-hour media).
 *
 * Visibility is decided entirely by RLS (migration 00004): a story is visible
 * to its author forever (soft expiry) and to everyone else only while
 * `expires_at > now()`, only when the account is public or the viewer follows
 * it, and never across a block. This module therefore only ever asks for
 * stories it is allowed to see — it does not re-implement those rules.
 */

export interface StoryAuthor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

/** All active stories of one account, plus whether I already saw them. */
export interface StoryGroup {
  author: StoryAuthor;
  stories: Story[];
  /** True when every story in the group has been seen by me. */
  viewed: boolean;
}

export interface NewStory {
  media_url: string;
  media_type: MediaKind;
  caption?: string | null;
}

const AUTHOR_FIELDS = 'id, username, full_name, avatar_url, is_verified';
const STORY_SELECT = `id, user_id, media_url, media_type, caption, expires_at, created_at,
  author:profiles!stories_user_id_fkey(${AUTHOR_FIELDS})`;

/** Keeps the `in (...)` list (and the URL it produces) bounded. */
const MAX_FEED_IDS = 2000;

type StoryWithAuthor = Story & { author: StoryAuthor | null };

async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to do that.');
  return data.user.id;
}

/**
 * Active stories from me + the accounts I follow, grouped by author
 * (my own group first, then newest activity first).
 *
 * The `story_views` rows the viewer generated are folded in so the bar can
 * dim rings that have already been watched.
 */
export async function getStoryFeed(client: SupabaseClient): Promise<StoryGroup[]> {
  const myId = await currentUserId(client);

  const { data: follows, error: followsError } = await client
    .from('follows')
    .select('following_id')
    .eq('follower_id', myId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(MAX_FEED_IDS - 1);
  if (followsError) throw followsError;

  // Always includes me: my own ring must appear even when I follow nobody.
  const audience = [myId, ...(follows ?? []).map((row) => row.following_id)];

  const { data: rows, error: storiesError } = await client
    .from('stories')
    .select(STORY_SELECT)
    .in('user_id', audience)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (storiesError) throw storiesError;

  // Views are fetched *scoped to these stories*: an unfiltered read would hit
  // PostgREST's default row cap once a heavy viewer has thousands of rows.
  const activeIds = (rows ?? []).map((row) => row.id);
  const seen = new Set<string>();
  if (activeIds.length > 0) {
    // RLS: a viewer can only read their own view rows.
    const { data: views, error: viewsError } = await client
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', myId)
      .in('story_id', activeIds);
    if (viewsError) throw viewsError;
    for (const row of views ?? []) seen.add(row.story_id);
  }

  const byAuthor = new Map<string, StoryGroup>();
  for (const row of (rows ?? []) as unknown as StoryWithAuthor[]) {
    if (!row.author) continue;
    const group = byAuthor.get(row.author.id) ?? {
      author: row.author,
      stories: [],
      viewed: true,
    };
    group.stories.push({
      id: row.id,
      user_id: row.user_id,
      media_url: row.media_url,
      media_type: row.media_type,
      caption: row.caption,
      expires_at: row.expires_at,
      created_at: row.created_at,
    });
    if (!seen.has(row.id)) group.viewed = false;
    byAuthor.set(row.author.id, group);
  }

  const groups = [...byAuthor.values()];
  groups.sort((a, b) => {
    if (a.author.id === myId) return -1;
    if (b.author.id === myId) return 1;
    const newestA = a.stories[a.stories.length - 1]?.created_at ?? '';
    const newestB = b.stories[b.stories.length - 1]?.created_at ?? '';
    return newestB.localeCompare(newestA);
  });
  return groups;
}

const STORY_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/**
 * Upload to `story-media/{userId}/{timestamp}-{random}.{ext}` — the storage
 * policy only allows the caller's own folder as the first path segment.
 * A unique name per upload (unlike avatars) because a story must not
 * overwrite the previous one. Returns a cache-busted public URL.
 *
 * The caller must validate type, size and magic bytes first
 * (`validateStoryFile` + `checkMediaSignature`).
 */
export async function uploadStoryMedia(
  client: SupabaseClient,
  userId: string,
  file: Blob & { name: string; type: string },
): Promise<string> {
  const extension = STORY_MIME_EXTENSION[file.type] ?? 'bin';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/${unique}.${extension}`;

  const { error } = await client.storage
    .from('story-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data } = client.storage.from('story-media').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Insert the story row (RLS: `user_id` must equal the caller). */
export async function createStory(
  client: SupabaseClient,
  input: NewStory,
): Promise<Story> {
  const myId = await currentUserId(client);
  const caption = input.caption?.trim() ? input.caption.trim() : null;

  const { data, error } = await client
    .from('stories')
    .insert({
      user_id: myId,
      media_url: input.media_url,
      media_type: input.media_type,
      caption,
    })
    .select('id, user_id, media_url, media_type, caption, expires_at, created_at')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Record that I watched a story. Duplicate views collapse on the
 * `(story_id, viewer_id)` unique constraint, and an author watching their own
 * story is never counted — the insert is best effort by design.
 */
export async function recordStoryView(
  client: SupabaseClient,
  story: Pick<Story, 'id' | 'user_id'>,
  myId: string,
): Promise<void> {
  if (story.user_id === myId) return;

  const { error } = await client
    .from('story_views')
    .insert({ story_id: story.id, viewer_id: myId });
  if (error && error.code !== '23505') {
    // Never block playback on bookkeeping.
    console.warn('story view not recorded:', error.message);
  }
}

/**
 * Who watched my story (RLS: only the story's owner can read the full list;
 * a viewer only ever sees their own rows). Empty when nobody watched yet.
 */
export async function getStoryViewers(
  client: SupabaseClient,
  storyId: string,
): Promise<StoryViewer[]> {
  const { data, error } = await client
    .from('story_views')
    .select(
      `viewed_at,
       viewer:profiles!story_views_viewer_id_fkey(id, username, avatar_url, is_verified)`,
    )
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const viewer = row.viewer as unknown as Omit<StoryViewer, 'viewed_at'> | null;
    return viewer ? [{ ...viewer, viewed_at: row.viewed_at }] : [];
  });
}

/** Best-effort: pull the storage path out of a public URL. */
export function storyStoragePath(url: string): string | null {
  const marker = '/object/';
  const start = url.indexOf(marker);
  if (start === -1) return null;

  const rest = url.slice(start + marker.length);
  const query = rest.indexOf('?');
  const clean = query === -1 ? rest : rest.slice(0, query);
  const segments = clean.split('/').filter(Boolean);
  // `{public|sign}/story-media/{...path}` — drop visibility + bucket names.
  if (segments[0] === 'public' || segments[0] === 'sign') segments.shift();
  if (segments[0] === 'story-media') segments.shift();
  if (segments.length === 0) return null;

  try {
    return decodeURIComponent(segments.join('/'));
  } catch {
    return segments.join('/');
  }
}

/**
 * Delete my story row, then drop the file so the 1 GB free tier is not
 * filled with orphaned media. Storage cleanup is best effort: losing it
 * costs a little space, failing the user's action would cost the feature.
 */
export async function deleteStory(client: SupabaseClient, story: Story): Promise<void> {
  const { error } = await client.from('stories').delete().eq('id', story.id);
  if (error) throw error;

  const path = storyStoragePath(story.media_url);
  if (path) {
    const { error: storageError } = await client.storage.from('story-media').remove([path]);
    if (storageError) console.warn('story file not removed:', storageError.message);
  }
}

/**
 * Link a post to a story so the story can show a preview card of the post.
 * The story owner can then share any post to their story.
 */
export async function sharePostToStory(
  client: SupabaseClient,
  storyId: string,
  postId: string,
): Promise<void> {
  const { error } = await client
    .from('story_post_links')
    .insert({ story_id: storyId, post_id: postId });
  if (error) throw error;
}

/** Get the post linked to a story (if any). */
export async function getStoryPost(
  client: SupabaseClient,
  storyId: string,
): Promise<{ postId: string; mediaUrl: string | null } | null> {
  const { data, error } = await client
    .from('story_post_links')
    .select(`
      post_id,
      post:posts!story_post_links_post_id_fkey(
        media:post_media(media_url)
      )
    `)
    .eq('story_id', storyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const post = data.post as unknown as { media: Array<{ media_url: string }> } | null;
  return {
    postId: data.post_id,
    mediaUrl: post?.media?.[0]?.media_url ?? null,
  };
}
