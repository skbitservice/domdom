import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  clearNotifications,
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@domdom/api';
import type { Notification } from '@domdom/types';
import { formatTimeAgo, getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/VerifiedBadge';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Notification[]; unread: number };

/** One line of copy per kind — `type` is a closed set (migration 00007). */
function sentenceFor(item: Notification): string {
  switch (item.type) {
    case 'follow':
      return 'started following you.';
    case 'follow_request':
      return 'requested to follow you.';
    case 'like':
      return 'liked your post.';
    case 'reel_like':
      return 'liked your reel.';
    case 'comment':
      return 'commented on your post.';
    case 'mention':
      return 'mentioned you.';
    case 'message':
      return 'sent you a message.';
    case 'story_reply':
      return 'replied to your story.';
    default:
      return 'interacted with you.';
  }
}

/**
 * Where a tap lands: follow requests open your own profile (the
 * Accept / Decline card lives there), reel likes open the reel feed
 * (Step 6 — reels have no detail route yet); everything else opens the
 * actor's profile. Deep links to posts arrive with Step 4 — until then
 * nothing fake is linked.
 */
function targetFor(item: Notification): string {
  if (item.type === 'follow_request') return '/app/profile';
  if (item.type === 'reel_like') return '/app/reels';
  return item.actor ? `/profile/${item.actor.username}` : '/app/notifications';
}

export function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [showUnread, setShowUnread] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!supabase) return;
    Promise.all([getNotifications(supabase), getUnreadNotificationCount(supabase)])
      .then(([items, unread]) => setState({ status: 'ready', items, unread }))
      .catch((error: unknown) => {
        // Keep showing already-loaded data on a failed background refresh;
        // only the first failure is a page-level error.
        setState((prev) =>
          prev.status === 'ready' ? prev : { status: 'error', message: getErrorMessage(error) },
        );
        console.warn('notifications refresh failed:', error);
      });
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    reload();
    return subscribeToNotifications(supabase, user.id, reload);
  }, [user, reload]);

  /** Optimistic read: the badge and list update now, the row follows. */
  const markRead = async (item: Notification) => {
    if (item.is_read || !supabase) return;
    setState((prev) =>
      prev.status === 'ready'
        ? {
            ...prev,
            unread: Math.max(0, prev.unread - 1),
            items: prev.items.map((it) => (it.id === item.id ? { ...it, is_read: true } : it)),
          }
        : prev,
    );
    try {
      await markNotificationRead(supabase, item.id);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
      reload();
    }
  };

  const openItem = (item: Notification) => {
    void markRead(item);
    navigate(targetFor(item));
  };

  const removeItem = async (item: Notification) => {
    if (!supabase) return;
    setBusy(item.id);
    setActionError(null);
    setState((prev) =>
      prev.status === 'ready'
        ? {
            ...prev,
            unread: prev.unread - (item.is_read ? 0 : 1),
            items: prev.items.filter((it) => it.id !== item.id),
          }
        : prev,
    );
    try {
      await deleteNotification(supabase, item.id);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
      reload();
    } finally {
      setBusy(null);
    }
  };

  const markAll = async () => {
    if (!supabase) return;
    setBusy('read-all');
    setActionError(null);
    try {
      await markAllNotificationsRead(supabase);
      setState((prev) =>
        prev.status === 'ready'
          ? {
              ...prev,
              unread: 0,
              items: prev.items.map((it) => (it.is_read ? it : { ...it, is_read: true })),
            }
          : prev,
      );
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const clearAll = async () => {
    if (!supabase) return;
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    setBusy('clear');
    setActionError(null);
    try {
      await clearNotifications(supabase);
      setState((prev) => (prev.status === 'ready' ? { ...prev, items: [], unread: 0 } : prev));
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const { items, unread } = state;
  const visible = showUnread ? items.filter((item) => !item.is_read) : items;

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  const actionClass =
    'rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0 || busy !== null}
            className={actionClass}
          >
            {busy === 'read-all' ? 'Marking…' : 'Mark all read'}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={items.length === 0 || busy !== null}
            className={actionClass}
          >
            {busy === 'clear' ? 'Clearing…' : 'Clear all'}
          </button>
        </div>
      </div>

      <div
        className="mt-4 flex w-fit gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900"
        role="tablist"
        aria-label="Filter notifications"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!showUnread}
          onClick={() => setShowUnread(false)}
          className={tabClass(!showUnread)}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showUnread}
          onClick={() => setShowUnread(true)}
          className={tabClass(showUnread)}
        >
          Unread{unread > 0 ? ` (${unread})` : ''}
        </button>
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {actionError}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200">
            {showUnread && unread === 0
              ? 'No unread notifications'
              : "You're all caught up"}
          </p>
          <p className="mt-1">
            {showUnread && unread === 0
              ? 'Everything in your inbox has been read.'
              : 'Follows are the first to land here — likes, comments and messages join in as those steps ship.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-1">
          {visible.map((item) => (
            <li key={item.id}>
              <div
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  item.is_read
                    ? ''
                    : 'bg-indigo-50/70 dark:bg-indigo-500/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar
                    url={item.actor?.avatar_url ?? null}
                    username={item.actor?.username ?? 'system'}
                  />
                  <span className="min-w-0 text-sm leading-5">
                    <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.actor?.username ?? 'System'}
                      <VerifiedBadge verified={item.actor?.is_verified} size="xs" />
                    </span>{' '}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {sentenceFor(item)}
                    </span>{' '}
                    <span className="text-zinc-400">· {formatTimeAgo(item.created_at)}</span>
                  </span>
                </button>

                {!item.is_read && (
                  <span
                    aria-label="Unread"
                    className="h-2 w-2 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-400"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  disabled={busy === item.id}
                  aria-label="Remove notification"
                  className="shrink-0 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
