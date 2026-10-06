import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification } from '@domdom/types';
import { getCurrentUserId } from './social';

/**
 * Notifications inbox API (Step 8).
 *
 * RLS does the isolation: SELECT/UPDATE only ever touch rows where
 * recipient_id = auth.uid(), and DELETE additionally lets the actor withdraw
 * a notification they generated (policy in migration 00009). Nothing here
 * filters by user id to "be safe" — the database is the authority.
 *
 * Writes are best-effort at the call sites that must not break (e.g. likes
 * notifying), but the inbox itself treats errors as real: an unread badge
 * that lies would be worse than no badge.
 */

/** Newest first, actor profile joined in (null actor = system message). */
const NOTIFICATION_SELECT =
  '*, actor:profiles!notifications_actor_id_fkey(id, username, full_name, avatar_url, is_verified)';

const PAGE_SIZE = 50;

/** Latest notifications for the signed-in user (newest first, capped). */
export async function getNotifications(
  client: SupabaseClient,
  limit = PAGE_SIZE,
): Promise<Notification[]> {
  const { data, error } = await client
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
}

/** Exact unread count for the nav badge (uses the partial unread index). */
export async function getUnreadNotificationCount(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

/** Mark a single inbox entry read. Silently no-ops when it is not mine. */
export async function markNotificationRead(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('is_read', false);
  if (error) throw error;
}

/** "Mark all as read" — one UPDATE, scoped to my inbox by RLS. */
export async function markAllNotificationsRead(client: SupabaseClient): Promise<void> {
  const myId = await getCurrentUserId(client);
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', myId)
    .eq('is_read', false);
  if (error) throw error;
}

/** Remove one inbox entry (recipient or actor may delete — policy 00009). */
export async function deleteNotification(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

/**
 * "Clear all" — deletes rows I received. The recipient_id filter matters:
 * a DELETE target must pass the table's SELECT policy too (the Postgres
 * gotcha documented in the README), and rows I received are exactly the
 * rows I can select.
 */
export async function clearNotifications(client: SupabaseClient): Promise<void> {
  const myId = await getCurrentUserId(client);
  const { error } = await client.from('notifications').delete().eq('recipient_id', myId);
  if (error) throw error;
}

/**
 * Live inbox updates: fires `onChange` for INSERT/UPDATE/DELETE on the
 * signed-in user's notifications. Best effort by design — when realtime is
 * unreachable the callback simply never fires and the page keeps working
 * with its manual refresh, so no caller ever surfaces a realtime error.
 *
 * Returns an unsubscribe function (call it from effect cleanup).
 */
export function subscribeToNotifications(
  client: SupabaseClient,
  userId: string,
  onChange: () => void,
): () => void {
  // Unique topic per subscriber: several components may watch the same
  // table at once and Phoenix topics must not collide on one socket.
  const channel = client.channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`);

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('notifications realtime unavailable — falling back to manual refresh');
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
