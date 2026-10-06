import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LiveStream,
  LiveStreamWithHost,
  LiveStreamAnalytics,
  LiveComment,
  LiveCommentWithUser,
  LiveReaction,
  LiveReactionType,
  LiveGuest,
  LiveGuestWithProfile,
  LiveStreamEvents,
  LiveStreamChannel,
} from '@domdom/types';
import { getCurrentUserId } from './social';

/**
 * LIVE API — Instagram-style live streaming.
 *
 * Division of labour with the database:
 * - Stream creation generates a unique stream_key (secret, host-only).
 * - Viewer count is maintained by triggers on live_viewers.
 * - Comments and reactions are delivered via Supabase Realtime.
 * - Guest management is handled by the host with RLS enforcement.
 * - Analytics are computed from the live_stream_analytics view.
 *
 * Nothing here filters by user id to "be safe" — RLS is the authority.
 */

const HOST_PROFILE = 'id, username, full_name, avatar_url, is_verified';
const USER_PROFILE = 'id, username, full_name, avatar_url, is_verified';

// ===========================================================================
// Stream management
// ===========================================================================

/** Start a new LIVE stream. Returns the stream with its secret key. */
export async function startLiveStream(
  client: SupabaseClient,
  title: string,
  description?: string,
): Promise<LiveStream> {
  const myId = await getCurrentUserId(client);
  const streamKey = crypto.randomUUID().replace(/-/g, '');

  const { data, error } = await client
    .from('live_streams')
    .insert({
      host_id: myId,
      title: title.trim() || 'LIVE',
      description: description?.trim() || null,
      stream_key: streamKey,
      stream_status: 'live',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as LiveStream;
}

/** Update stream title/description while live. */
export async function updateLiveStream(
  client: SupabaseClient,
  streamId: string,
  updates: { title?: string; description?: string },
): Promise<LiveStream> {
  const { data, error } = await client
    .from('live_streams')
    .update({
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      ...(updates.description !== undefined && { description: updates.description.trim() || null }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', streamId)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as LiveStream;
}

/** End a LIVE stream. */
export async function endLiveStream(client: SupabaseClient, streamId: string): Promise<void> {
  const { error } = await client
    .from('live_streams')
    .update({
      stream_status: 'ended',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', streamId);

  if (error) throw error;
}

/** Get a live stream by ID (with host profile). */
export async function getLiveStream(
  client: SupabaseClient,
  streamId: string,
): Promise<LiveStreamWithHost | null> {
  const { data, error } = await client
    .from('live_streams')
    .select(`*, host:profiles!live_streams_host_id_fkey(${HOST_PROFILE})`)
    .eq('id', streamId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as LiveStreamWithHost | null;
}

/** Get a live stream by its secret key (for stream verification). */
export async function getLiveStreamByKey(
  client: SupabaseClient,
  streamKey: string,
): Promise<LiveStream | null> {
  const { data, error } = await client
    .from('live_streams')
    .select('*')
    .eq('stream_key', streamKey)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as LiveStream | null;
}

/** List currently live streams (newest first). */
export async function getLiveStreams(
  client: SupabaseClient,
  limit = 20,
): Promise<LiveStreamWithHost[]> {
  const { data, error } = await client
    .from('live_streams')
    .select(`*, host:profiles!live_streams_host_id_fkey(${HOST_PROFILE})`)
    .eq('stream_status', 'live')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as LiveStreamWithHost[];
}

/** List a user's past live streams (newest first). */
export async function getUserLiveStreams(
  client: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<LiveStreamWithHost[]> {
  const { data, error } = await client
    .from('live_streams')
    .select(`*, host:profiles!live_streams_host_id_fkey(${HOST_PROFILE})`)
    .eq('host_id', userId)
    .eq('stream_status', 'ended')
    .order('ended_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as LiveStreamWithHost[];
}

// ===========================================================================
// Viewer management
// ===========================================================================

/** Join a live stream. Returns the viewer row. */
export async function joinLiveStream(
  client: SupabaseClient,
  streamId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  // Check if blocked by host
  const { data: blocked } = await client
    .from('live_blocked_viewers')
    .select('id')
    .eq('live_id', streamId)
    .eq('viewer_id', myId)
    .maybeSingle();

  if (blocked) throw new Error('You have been blocked from this live stream.');

  const { error } = await client
    .from('live_viewers')
    .insert({
      live_id: streamId,
      user_id: myId,
      joined_at: new Date().toISOString(),
    });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Leave a live stream. */
export async function leaveLiveStream(
  client: SupabaseClient,
  streamId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_viewers')
    .update({ left_at: new Date().toISOString() })
    .eq('live_id', streamId)
    .eq('user_id', myId)
    .is('left_at', null);

  if (error) throw error;
}

/** Get current viewer count for a stream. */
export async function getViewerCount(
  client: SupabaseClient,
  streamId: string,
): Promise<number> {
  const { data, error } = await client
    .from('live_streams')
    .select('viewer_count')
    .eq('id', streamId)
    .single();

  if (error) throw error;
  return data?.viewer_count ?? 0;
}

/** Get list of current viewers (active only). */
export async function getLiveViewers(
  client: SupabaseClient,
  streamId: string,
  limit = 50,
): Promise<Array<{ user_id: string; joined_at: string }>> {
  const { data, error } = await client
    .from('live_viewers')
    .select('user_id, joined_at')
    .eq('live_id', streamId)
    .is('left_at', null)
    .order('joined_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Array<{ user_id: string; joined_at: string }>;
}

// ===========================================================================
// Comments
// ===========================================================================

/** Send a comment to a live stream. */
export async function sendLiveComment(
  client: SupabaseClient,
  streamId: string,
  message: string,
): Promise<LiveComment> {
  const myId = await getCurrentUserId(client);
  const content = message.trim();
  if (!content) throw new Error('Type a comment first.');
  if (content.length > 500) throw new Error('Comments can be at most 500 characters.');

  const { data, error } = await client
    .from('live_comments')
    .insert({
      live_id: streamId,
      user_id: myId,
      message: content,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as LiveComment;
}

/** Get comment history (newest first). */
export async function getLiveComments(
  client: SupabaseClient,
  streamId: string,
  options: { before?: string; limit?: number } = {},
): Promise<LiveCommentWithUser[]> {
  let query = client
    .from('live_comments')
    .select(`*, user:profiles!live_comments_user_id_fkey(${USER_PROFILE})`)
    .eq('live_id', streamId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.before) query = query.lt('created_at', options.before);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as LiveCommentWithUser[];
}

/** Delete a comment (own comment or host can delete any). */
export async function deleteLiveComment(
  client: SupabaseClient,
  commentId: string,
): Promise<void> {
  const { error } = await client
    .from('live_comments')
    .update({ is_deleted: true, message: '' })
    .eq('id', commentId);

  if (error) throw error;
}

/** Pin/unpin a comment (host only). */
export async function pinLiveComment(
  client: SupabaseClient,
  commentId: string,
  isPinned: boolean,
): Promise<void> {
  const { error } = await client
    .from('live_comments')
    .update({ is_pinned: isPinned })
    .eq('id', commentId);

  if (error) throw error;
}

// ===========================================================================
// Reactions
// ===========================================================================

/** Send a reaction to a live stream. */
export async function sendLiveReaction(
  client: SupabaseClient,
  streamId: string,
  reactionType: LiveReactionType,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_reactions')
    .insert({
      live_id: streamId,
      user_id: myId,
      reaction_type: reactionType,
    });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Remove a reaction. */
export async function removeLiveReaction(
  client: SupabaseClient,
  streamId: string,
  reactionType: LiveReactionType,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_reactions')
    .delete()
    .eq('live_id', streamId)
    .eq('user_id', myId)
    .eq('reaction_type', reactionType);

  if (error) throw error;
}

/** Get reaction counts for a stream. */
export async function getLiveReactionCounts(
  client: SupabaseClient,
  streamId: string,
): Promise<Record<LiveReactionType, number>> {
  const { data, error } = await client
    .from('live_reactions')
    .select('reaction_type')
    .eq('live_id', streamId);

  if (error) throw error;

  const counts: Record<LiveReactionType, number> = {
    heart: 0,
    laugh: 0,
    clap: 0,
    fire: 0,
    cry: 0,
    surprise: 0,
  };

  for (const row of (data ?? []) as Array<{ reaction_type: LiveReactionType }>) {
    counts[row.reaction_type]++;
  }

  return counts;
}

// ===========================================================================
// Guest management
// ===========================================================================

/** Invite a guest to co-host. */
export async function inviteLiveGuest(
  client: SupabaseClient,
  streamId: string,
  guestId: string,
): Promise<LiveGuest> {
  const myId = await getCurrentUserId(client);

  const { data, error } = await client
    .from('live_guests')
    .insert({
      live_id: streamId,
      host_id: myId,
      guest_id: guestId,
      status: 'invited',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as LiveGuest;
}

/** Guest accepts/declines invitation. */
export async function respondToGuestInvite(
  client: SupabaseClient,
  guestId: string,
  accept: boolean,
): Promise<LiveGuest> {
  const myId = await getCurrentUserId(client);

  const { data, error } = await client
    .from('live_guests')
    .update({
      status: accept ? 'accepted' : 'declined',
      joined_at: accept ? new Date().toISOString() : null,
    })
    .eq('id', guestId)
    .eq('guest_id', myId)
    .eq('status', 'invited')
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as LiveGuest;
}

/** Host removes a guest. */
export async function removeLiveGuest(
  client: SupabaseClient,
  guestId: string,
): Promise<void> {
  const { error } = await client
    .from('live_guests')
    .update({ status: 'removed' })
    .eq('id', guestId);

  if (error) throw error;
}

/** Guest leaves the live. */
export async function leaveLiveGuest(
  client: SupabaseClient,
  guestId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_guests')
    .update({ status: 'left' })
    .eq('id', guestId)
    .eq('guest_id', myId);

  if (error) throw error;
}

/** Get guests for a live stream. */
export async function getLiveGuests(
  client: SupabaseClient,
  streamId: string,
): Promise<LiveGuestWithProfile[]> {
  const { data, error } = await client
    .from('live_guests')
    .select(`*, guest:profiles!live_guests_guest_id_fkey(${USER_PROFILE})`)
    .eq('live_id', streamId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as LiveGuestWithProfile[];
}

// ===========================================================================
// Moderation
// ===========================================================================

/** Block a viewer from a live stream. */
export async function blockLiveViewer(
  client: SupabaseClient,
  streamId: string,
  viewerId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_blocked_viewers')
    .insert({
      live_id: streamId,
      host_id: myId,
      viewer_id: viewerId,
    });

  if (error && error.code !== '23505') throw error;
}

/** Unblock a viewer. */
export async function unblockLiveViewer(
  client: SupabaseClient,
  streamId: string,
  viewerId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_blocked_viewers')
    .delete()
    .eq('live_id', streamId)
    .eq('host_id', myId)
    .eq('viewer_id', viewerId);

  if (error) throw error;
}

/** Report a live stream. */
export async function reportLiveStream(
  client: SupabaseClient,
  streamId: string,
  reason: string,
  description?: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);

  const { error } = await client
    .from('live_reports')
    .insert({
      live_id: streamId,
      reporter_id: myId,
      reason,
      description: description?.trim() || null,
    });

  if (error && error.code !== '23505') throw error;
}

// ===========================================================================
// Analytics
// ===========================================================================

/** Get analytics for a live stream. */
export async function getLiveStreamAnalytics(
  client: SupabaseClient,
  streamId: string,
): Promise<LiveStreamAnalytics | null> {
  const { data, error } = await client
    .from('live_stream_analytics')
    .select('*')
    .eq('id', streamId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as LiveStreamAnalytics | null;
}

// ===========================================================================
// Realtime subscriptions
// ===========================================================================

/**
 * Subscribe to live stream events: comments, reactions, viewer count,
 * stream status, and guest updates.
 *
 * The topic keeps `live:<streamId>` as its second segment so the
 * `realtime.messages` policies can authorize it; the random suffix
 * only stops two mounted components from fighting over one Phoenix topic.
 */
export function subscribeToLiveStream(
  client: SupabaseClient,
  streamId: string,
  events: LiveStreamEvents,
): LiveStreamChannel {
  const topic = `live:${streamId}:${Math.random().toString(36).slice(2)}`;
  const channel = client.channel(topic, { config: { private: true } });

  const liveFilter = `live_id=eq.${streamId}`;

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_comments', filter: liveFilter },
      (payload) => events.onCommentInsert?.(payload.new as unknown as LiveCommentWithUser),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'live_comments', filter: liveFilter },
      (payload) => {
        const row = payload.new as unknown as LiveComment;
        if (row.is_deleted) {
          events.onCommentDelete?.(row.id);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_reactions', filter: liveFilter },
      (payload) => events.onReactionInsert?.(payload.new as unknown as LiveReaction),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'live_reactions', filter: liveFilter },
      (payload) => events.onReactionDelete?.((payload.old as { id?: string }).id ?? ''),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'live_streams', filter: `id=eq.${streamId}` },
      (payload) => {
        const row = payload.new as unknown as LiveStream;
        events.onViewerCountChange?.(row.viewer_count);
        events.onStreamStatusChange?.(row.stream_status);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_guests', filter: liveFilter },
      (payload) => events.onGuestUpdate?.(payload.new as unknown as LiveGuestWithProfile),
    )
    .subscribe((status) => events.onStatus?.(status));

  return {
    sendReaction: (reactionType: LiveReactionType) => {
      void channel.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { reaction_type: reactionType },
      });
    },
    sendComment: (message: string) => {
      void channel.send({
        type: 'broadcast',
        event: 'comment',
        payload: { message },
      });
    },
    close: () => {
      void client.removeChannel(channel);
    },
  };
}

/**
 * Subscribe to live stream list updates (for explore/discover page).
 * Fires when any stream starts or ends.
 */
export function subscribeToLiveStreamList(
  client: SupabaseClient,
  onUpdate: () => void,
): () => void {
  const channel = client.channel(`live-list:${Math.random().toString(36).slice(2)}`);

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_streams' },
      onUpdate,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
