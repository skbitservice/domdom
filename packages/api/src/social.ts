import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Follow / block API.
 *
 * The database decides request status: a BEFORE INSERT trigger sets
 * status='accepted' for public accounts and 'pending' for private ones, and
 * a UPDATE guard ensures only the recipient of a request can accept or
 * decline it. The client never picks the status itself.
 */

export type FollowStatus = 'pending' | 'accepted' | 'blocked';

export interface FollowRow {
  id: string;
  follower_id: string;
  following_id: string;
  status: FollowStatus;
  created_at: string;
}

/** Minimal profile shape used by lists and suggestions. */
export interface ProfileLite {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_private: boolean;
}

export interface Relationship {
  /** Row where I follow the target (pending = request sent). */
  outgoing: FollowRow | null;
  /** Row where the target follows me (pending = request for me to decide). */
  incoming: FollowRow | null;
}

const PROFILE_LITE =
  'id, username, full_name, avatar_url, is_verified, is_private';

/** Id of the signed-in user, or a clear error when there is no session. */
export async function getCurrentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to do that.');
  return data.user.id;
}

/** Best-effort notification write — never breaks the main action. */
async function notify(
  client: SupabaseClient,
  row: { recipient_id: string; actor_id: string; type: 'follow' | 'follow_request' },
): Promise<void> {
  const { error } = await client.from('notifications').insert(row);
  if (error) {
    console.warn('notification insert skipped:', error.message);
  }
}

export async function getRelationship(
  client: SupabaseClient,
  myId: string,
  targetId: string,
): Promise<Relationship> {
  const [out, inc] = await Promise.all([
    client
      .from('follows')
      .select('*')
      .eq('follower_id', myId)
      .eq('following_id', targetId)
      .maybeSingle(),
    client
      .from('follows')
      .select('*')
      .eq('follower_id', targetId)
      .eq('following_id', myId)
      .maybeSingle(),
  ]);
  if (out.error) throw out.error;
  if (inc.error) throw inc.error;
  return { outgoing: out.data, incoming: inc.data };
}

/**
 * Follow (or request to follow) a user. Returns the row with the
 * DB-decided status; idempotent when a relationship already exists.
 */
export async function followUser(
  client: SupabaseClient,
  targetId: string,
): Promise<FollowRow | null> {
  const myId = await getCurrentUserId(client);

  const { data, error } = await client
    .from('follows')
    .insert({ follower_id: myId, following_id: targetId })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return null; // already following / requested
    throw error;
  }

  await notify(client, {
    recipient_id: targetId,
    actor_id: myId,
    type: data.status === 'pending' ? 'follow_request' : 'follow',
  });
  return data;
}

/** Unfollow / cancel a pending request, and withdraw the notification. */
export async function unfollowUser(client: SupabaseClient, targetId: string): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('follows')
    .delete()
    .eq('follower_id', myId)
    .eq('following_id', targetId);
  if (error) throw error;
  // Notification cleanup happens in the database: the
  // follows_cleanup_notifications trigger (SECURITY DEFINER) removes the
  // 'follow' / 'follow_request' row when the follow row is deleted.
}

/** Accept a pending follow request addressed to me. */
export async function acceptFollowRequest(
  client: SupabaseClient,
  followerId: string,
): Promise<FollowRow> {
  const myId = await getCurrentUserId(client);

  const { data, error } = await client
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('following_id', myId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('This follow request no longer exists.');

  const { error: upgradeError } = await client
    .from('notifications')
    .update({ type: 'follow' })
    .eq('actor_id', followerId)
    .eq('recipient_id', myId)
    .eq('type', 'follow_request');
  if (upgradeError) console.warn('notification upgrade skipped:', upgradeError.message);

  return data;
}

/** Decline a pending follow request addressed to me. */
export async function declineFollowRequest(
  client: SupabaseClient,
  followerId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', myId)
    .eq('status', 'pending');
  if (error) throw error;
  // Notification cleanup: follows_cleanup_notifications trigger in the DB.
}

/** Accepted followers of a profile (public data, newest first). */
export async function getFollowers(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileLite[]> {
  const { data, error } = await client
    .from('follows')
    .select(`created_at, profile:profiles!follows_follower_id_fkey(${PROFILE_LITE})`)
    .eq('following_id', userId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const profile = row.profile as unknown as ProfileLite | null;
    return profile ? [profile] : [];
  });
}

/** Accounts a profile follows (public data, newest first). */
export async function getFollowing(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileLite[]> {
  const { data, error } = await client
    .from('follows')
    .select(`created_at, profile:profiles!follows_following_id_fkey(${PROFILE_LITE})`)
    .eq('follower_id', userId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const profile = row.profile as unknown as ProfileLite | null;
    return profile ? [profile] : [];
  });
}

/** Pending requests waiting for my decision, with the requester's profile. */
export async function getIncomingRequests(
  client: SupabaseClient,
): Promise<ProfileLite[]> {
  const myId = await getCurrentUserId(client);
  const { data, error } = await client
    .from('follows')
    .select(`created_at, profile:profiles!follows_follower_id_fkey(${PROFILE_LITE})`)
    .eq('following_id', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const profile = row.profile as unknown as ProfileLite | null;
    return profile ? [profile] : [];
  });
}

/**
 * Block a user: inserts the block, removes all follow relationships in both
 * directions and withdraws related notifications.
 */
export async function blockUser(client: SupabaseClient, targetId: string): Promise<void> {
  const myId = await getCurrentUserId(client);
  if (myId === targetId) throw new Error('You cannot block yourself.');

  const { error: blockError } = await client
    .from('blocked_users')
    .insert({ blocker_id: myId, blocked_id: targetId });
  if (blockError && blockError.code !== '23505') throw blockError;

  for (const [follower, following] of [
    [myId, targetId],
    [targetId, myId],
  ] as const) {
    const { error } = await client
      .from('follows')
      .delete()
      .eq('follower_id', follower)
      .eq('following_id', following);
    if (error) throw error;
  }
  // Both follow rows are gone, so the follows_cleanup_notifications trigger
  // has already withdrawn every 'follow' / 'follow_request' notification
  // between the two accounts — no separate client-side cleanup needed.
}

export async function unblockUser(client: SupabaseClient, targetId: string): Promise<void> {
  const myId = await getCurrentUserId(client);
  const { error } = await client
    .from('blocked_users')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', targetId);
  if (error) throw error;
}

/** True when I already blocked this user (used for the Unblock button). */
export async function hasBlocked(
  client: SupabaseClient,
  targetId: string,
): Promise<boolean> {
  const myId = await getCurrentUserId(client);
  const { data, error } = await client
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', myId)
    .eq('blocked_id', targetId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
