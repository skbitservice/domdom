import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@domdom/ui';
import {
  countReelView,
  deleteReel,
  getProfileById,
  getReelsFeed,
  setReelLike,
  type ReelFeedItem,
} from '@domdom/api';
import type { Reel } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { ReelPlayer } from '../../components/reels/ReelPlayer';
import { ReelComments } from '../../components/reels/ReelComments';
import { NewReel } from '../../components/reels/NewReel';
import { ReportModal } from '../../components/ReportModal';

const PAGE_SIZE = 8;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ReelFeedItem[]; hasMore: boolean; loadingMore: boolean };

/**
 * Step 6 — Reels.
 *
 * A vertical snap feed: one reel per screen, only the snapped-in video plays
 * (IntersectionObserver decides), sound stays muted until asked otherwise,
 * and every view is counted once per reel per session.
 */
export function Reels() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [banner, setBanner] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [reportReelId, setReportReelId] = useState<string | null>(null);
  const [reportedReels, setReportedReels] = useState<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const countedViews = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setBanner(null);
    try {
      const items = await getReelsFeed(supabase!, { limit: PAGE_SIZE });
      setState({ status: 'ready', items, hasMore: items.length === PAGE_SIZE, loadingMore: false });
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Which reel is snapped into view → the only one allowed to play. */
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
            best = entry;
          }
        }
        const id = (best?.target as HTMLElement | undefined)?.dataset.reelId;
        if (id) setActiveId(id);
      },
      { root, threshold: 0.6 },
    );

    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [state]);

  /** Count a view the first time each reel becomes the active one. */
  useEffect(() => {
    if (!activeId || countedViews.current.has(activeId)) return;
    countedViews.current.add(activeId);
    void countReelView(supabase!, activeId);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            items: current.items.map((item) =>
              item.reel.id === activeId
                ? { ...item, reel: { ...item.reel, views_count: item.reel.views_count + 1 } }
                : item,
            ),
          }
        : current,
    );
  }, [activeId]);

  const loadMore = async () => {
    if (state.status !== 'ready' || state.loadingMore || !state.hasMore) return;
    const before = state.items[state.items.length - 1]?.reel.created_at;
    if (!before) return;

    setState({ ...state, loadingMore: true });
    setBanner(null);
    try {
      const more = await getReelsFeed(supabase!, { limit: PAGE_SIZE, before });
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: [...current.items, ...more],
              hasMore: more.length === PAGE_SIZE,
              loadingMore: false,
            }
          : current,
      );
    } catch (error) {
      setBanner(getErrorMessage(error));
      setState((current) => (current.status === 'ready' ? { ...current, loadingMore: false } : current));
    }
  };

  const handleLike = async (reelId: string, next: boolean) => {
    if (state.status !== 'ready') return;
    const previous = state.items;
    const optimistic = previous.map((item) =>
      item.reel.id === reelId
        ? { ...item, liked_by_me: next, likes_count: item.likes_count + (next ? 1 : -1) }
        : item,
    );
    setState({ ...state, items: optimistic });
    setBanner(null);

    try {
      await setReelLike(supabase!, reelId, next);
    } catch (error) {
      setState((current) => (current.status === 'ready' ? { ...current, items: previous } : current));
      setBanner(getErrorMessage(error));
    }
  };

  const handleDelete = async (item: ReelFeedItem) => {
    if (state.status !== 'ready') return;
    if (!window.confirm('Delete this reel? The video and its comments go with it.')) return;

    const previous = state.items;
    setState({ ...state, items: previous.filter((entry) => entry.reel.id !== item.reel.id) });
    setBanner(null);

    try {
      await deleteReel(supabase!, item.reel);
    } catch (error) {
      setState((current) => (current.status === 'ready' ? { ...current, items: previous } : current));
      setBanner(getErrorMessage(error));
    }
  };

  const handleCommentsOpen = (reelId: string) => setCommentsFor(reelId);

  const changeCommentCount = (reelId: string, delta: number) => {
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            items: current.items.map((item) =>
              item.reel.id === reelId
                ? { ...item, comments_count: Math.max(0, item.comments_count + delta) }
                : item,
            ),
          }
        : current,
    );
  };

  const handleCreated = async (reel: Reel) => {
    setComposerOpen(false);
    try {
      const profile = await getProfileById(supabase!, user!.id);
      if (!profile) throw new Error('Profile missing');
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: [
                {
                  reel,
                  author: {
                    id: profile.id,
                    username: profile.username,
                    avatar_url: profile.avatar_url,
                    is_verified: profile.is_verified,
                  },
                  likes_count: 0,
                  comments_count: 0,
                  liked_by_me: false,
                },
                ...current.items,
              ],
            }
          : current,
      );
      feedRef.current?.scrollTo({ top: 0 });
    } catch {
      // Fall back to a plain reload if the profile lookup failed.
      void load();
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
      <div className="mx-auto max-w-xl px-4 py-8">
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const commentTarget = state.items.find((item) => item.reel.id === commentsFor) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-0 md:px-4 md:py-6">
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-0">
        <h1 className="text-xl font-bold">Reels</h1>
        <Button onClick={() => setComposerOpen(true)} className="px-3 py-2">
          New reel
        </Button>
      </header>

      {banner && (
        <p
          role="alert"
          className="mx-4 mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400 md:mx-0"
        >
          {banner}
        </p>
      )}

      {state.items.length === 0 ? (
        <div className="mx-4 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400 md:mx-0">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200">No reels yet</p>
          <p className="mt-1">
            Reels from accounts you follow — and every public reel — show up here. Upload the
            first one.
          </p>
          <Button className="mt-4" onClick={() => setComposerOpen(true)}>
            Create a reel
          </Button>
        </div>
      ) : (
        <div
          ref={feedRef}
          className="h-[calc(100dvh-11.5rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black md:h-[calc(100dvh-9rem)] md:rounded-2xl"
        >
          {state.items.map((item) => (
            <div
              key={item.reel.id}
              data-reel-id={item.reel.id}
              className="h-full w-full shrink-0 snap-start"
            >
              <ReelPlayer
                item={item}
                isActive={item.reel.id === activeId}
                muted={muted}
                isOwner={item.reel.user_id === user?.id}
                isAuthenticated={!!user}
                onToggleMute={() => setMuted((current) => !current)}
                onLike={(reelId, next) => void handleLike(reelId, next)}
                onOpenComments={handleCommentsOpen}
                onDelete={(target) => void handleDelete(target)}
                onReport={(reelId) => setReportReelId(reelId)}
              />
            </div>
          ))}
        </div>
      )}

      {state.hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="secondary"
            onClick={() => void loadMore()}
            loading={state.loadingMore}
          >
            Load more
          </Button>
        </div>
      )}

      {composerOpen && (
        <NewReel
          onClose={() => setComposerOpen(false)}
          onCreated={(reel) => void handleCreated(reel)}
        />
      )}

      {commentTarget && (
        <ReelComments
          reelId={commentTarget.reel.id}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) => changeCommentCount(commentTarget.reel.id, delta)}
        />
      )}

      {user && reportReelId && (
        <ReportModal
          open
          target={{ type: 'reel', id: reportReelId, label: 'reel' }}
          onClose={() => setReportReelId(null)}
          onFiled={() =>
            setReportedReels((prev) => new Set(prev).add(reportReelId))
          }
        />
      )}
    </div>
  );
}
