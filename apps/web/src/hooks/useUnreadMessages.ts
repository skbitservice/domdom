import { useCallback, useEffect, useState } from 'react';
import { getUnreadMessageCount } from '@domdom/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

/**
 * Unread message total for the nav badge.
 *
 * Two live sources, both honest:
 *
 * - `messages` with **no filter**: Realtime checks that table's SELECT
 *   policy for me, so the only rows it can tell me about are the ones in my
 *   own conversations — a forged subscription gets nothing.
 * - `conversation_members` filtered to my own rows, so opening a thread
 *   (which moves `last_read_at`) clears the badge immediately.
 *
 * When realtime is unavailable the badge still shows the count from page
 * load and refreshes on focus — it degrades, it never lies.
 */
export function useUnreadMessages(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!supabase) return;
    getUnreadMessageCount(supabase)
      .then(setCount)
      .catch((error: unknown) => console.warn('unread message count refresh failed:', error));
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    refresh();

    const channel = supabase
      .channel(`messages-badge:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${user.id}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('message badge realtime unavailable — refreshing on focus only');
        }
      });

    const handleFocus = () => refresh();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      void supabase!.removeChannel(channel);
    };
  }, [user, refresh]);

  return count;
}
