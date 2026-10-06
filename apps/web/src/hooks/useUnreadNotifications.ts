import { useCallback, useEffect, useState } from 'react';
import { getUnreadNotificationCount, subscribeToNotifications } from '@domdom/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

/**
 * Unread notification count for the nav badge.
 *
 * Kept exact with a realtime subscription: any INSERT/UPDATE on my inbox
 * (including "mark all read" from another component) re-runs the count
 * query. When realtime is unavailable the badge still shows the count from
 * page load and refreshes on the next navigation — it degrades, it never
 * lies.
 */
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!supabase) return;
    getUnreadNotificationCount(supabase)
      .then(setCount)
      .catch((error: unknown) => console.warn('unread count refresh failed:', error));
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    refresh();
    return subscribeToNotifications(supabase, user.id, refresh);
  }, [user, refresh]);

  return count;
}
