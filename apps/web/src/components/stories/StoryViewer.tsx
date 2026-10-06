import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Spinner } from '@domdom/ui';
import {
  deleteStory,
  getStoryViewers,
  recordStoryView,
  type StoryGroup,
} from '@domdom/api';
import type { Story, StoryViewer as StoryViewerRow } from '@domdom/types';
import { formatTimeAgo, getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';
import { ReportModal } from '../ReportModal';

/** Images get the classic 5 s; videos use their own length once known. */
const IMAGE_DURATION_MS = 5000;
const MIN_VIDEO_DURATION_MS = 3000;
const MAX_VIDEO_DURATION_MS = 60_000;
/** A hold longer than this counts as "pause", not as "tap to advance". */
const LONG_PRESS_MS = 400;

interface StoryViewerProps {
  groups: StoryGroup[];
  /** Opens on this author's stories when they are still present. */
  initialAuthorId?: string;
  onClose: () => void;
  /** The bar drops the story from its list; the viewer repositions itself. */
  onStoryDeleted: (story: Story) => void;
}

interface Cursor {
  authorId: string;
  storyId: string;
}

/**
 * Full-screen story playback: segment progress, auto-advance, tap/keyboard
 * navigation, hold-to-pause, view recording, plus the owner's view count and
 * delete action. RLS decides who may see what — this component only plays the
 * rows it was handed.
 */
export function StoryViewer({
  groups,
  initialAuthorId,
  onClose,
  onStoryDeleted,
}: StoryViewerProps) {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const [cursor, setCursor] = useState<Cursor | null>(() => {
    const wanted = initialAuthorId
      ? groups.find((group) => group.author.id === initialAuthorId)
      : undefined;
    const start = wanted ?? groups[0];
    const firstStory = start?.stories[0];
    return firstStory && start ? { authorId: start.author.id, storyId: firstStory.id } : null;
  });

  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [views, setViews] = useState<StoryViewerRow[] | null>(null);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);

  const progressRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const heldAtRef = useRef(0);
  const swallowClickRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  /* ------------------------------------------------------------------ */
  /* position                                                            */
  /* ------------------------------------------------------------------ */
  const groupIndex = cursor ? groups.findIndex((g) => g.author.id === cursor.authorId) : -1;
  const group = groupIndex >= 0 ? groups[groupIndex] : undefined;
  const storyIndex =
    group && cursor ? group.stories.findIndex((s) => s.id === cursor.storyId) : -1;
  const story = group && storyIndex >= 0 ? group.stories[storyIndex] : undefined;
  const isMine = Boolean(story && myId && story.user_id === myId);

  const goTo = useCallback((next: Cursor | null) => {
    if (next) setCursor(next);
    else onClose();
  }, [onClose]);

  const stepForward = useCallback(() => {
    if (!group || storyIndex < 0) {
      goTo(null);
      return;
    }
    const nextStory = group.stories[storyIndex + 1];
    if (nextStory) {
      goTo({ authorId: group.author.id, storyId: nextStory.id });
      return;
    }
    const nextGroup = groups[groupIndex + 1];
    const firstOfNext = nextGroup?.stories[0];
    if (nextGroup && firstOfNext) {
      goTo({ authorId: nextGroup.author.id, storyId: firstOfNext.id });
      return;
    }
    goTo(null);
  }, [group, groups, groupIndex, storyIndex, goTo]);

  const stepBack = useCallback(() => {
    if (!group || storyIndex < 0) return;
    if (storyIndex > 0) {
      const previous = group.stories[storyIndex - 1];
      if (previous) goTo({ authorId: group.author.id, storyId: previous.id });
      return;
    }
    if (groupIndex > 0) {
      const previousGroup = groups[groupIndex - 1];
      const last = previousGroup?.stories[previousGroup.stories.length - 1];
      if (previousGroup && last) {
        goTo({ authorId: previousGroup.author.id, storyId: last.id });
        return;
      }
    }
    // Already at the very beginning: do nothing (stay at start).
  }, [group, groupIndex, groups, storyIndex, goTo]);

  /* ------------------------------------------------------------------ */
  /* safety net: the cursor can go stale after a deletion                 */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (story) return;
    const fallback = groups[0];
    const first = fallback?.stories[0];
    if (fallback && first) setCursor({ authorId: fallback.author.id, storyId: first.id });
    else onClose();
  }, [story, groups, onClose]);

  /* ------------------------------------------------------------------ */
  /* progress                                                            */
  /* ------------------------------------------------------------------ */
  const storyId = story?.id;
  const durationMs =
    story?.media_type === 'video' ? (videoDurationMs ?? IMAGE_DURATION_MS) : IMAGE_DURATION_MS;
  /** Playback holds while paused *or* while a sheet covers the story. */
  const holding = paused || showViews;

  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
    setVideoDurationMs(null);
    setPaused(false);
    setConfirmDelete(false);
  }, [storyId]);

  useEffect(() => {
    if (!storyId || holding) return undefined;

    let frame = 0;
    let last = performance.now();
    let lastPaint = last - 1000;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      progressRef.current = Math.min(1, progressRef.current + delta / durationMs);

      if (progressRef.current >= 1) {
        setProgress(1);
        stepForward();
        return;
      }
      if (now - lastPaint >= 60) {
        lastPaint = now;
        setProgress(progressRef.current);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [storyId, holding, durationMs, stepForward]);

  /* Keep playback and the timer in sync while paused or covered. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (holding) video.pause();
    else void video.play().catch(() => undefined);
  }, [holding, storyId]);

  /* ------------------------------------------------------------------ */
  /* bookkeeping                                                         */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!story || !myId || story.user_id === myId) return;
    if (seenRef.current.has(story.id)) return;
    seenRef.current.add(story.id);
    void recordStoryView(supabase!, story, myId);
  }, [story, myId]);

  useEffect(() => {
    if (!storyId || !isMine) {
      setViews(null);
      return;
    }
    let cancelled = false;
    setViewsLoading(true);
    getStoryViewers(supabase!, storyId)
      .then((rows) => {
        if (!cancelled) setViews(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setViewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, isMine]);

  /* ------------------------------------------------------------------ */
  /* keyboard                                                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showViews) return; // the views dialog owns Escape while open
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') stepForward();
      else if (event.key === 'ArrowLeft') stepBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, stepForward, stepBack, showViews]);

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */
  const handleDelete = async () => {
    if (!story || busy) return;
    // Pick the landing spot *before* the row disappears: ids of the
    // remaining stories never shift, so this stays correct either way.
    const nextStory = group?.stories[storyIndex + 1];
    const nextGroup = groups[groupIndex + 1];
    const landing: Cursor | null = nextStory
      ? { authorId: group!.author.id, storyId: nextStory.id }
      : nextGroup?.stories[0]
        ? { authorId: nextGroup.author.id, storyId: nextGroup.stories[0].id }
        : null;

    setBusy(true);
    setError(null);
    try {
      await deleteStory(supabase!, story);
      onStoryDeleted(story);
      goTo(landing);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* render                                                               */
  /* ------------------------------------------------------------------ */
  if (!story || !group) return null;

  const segmentCount = group.stories.length;
  const progressPercent = Math.round(progress * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Stories by ${group.author.username}`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 pt-3">
        {/* Segment progress: one bar per story in this author's group. */}
        <div className="flex gap-1">
          {group.stories.map((item, index) => (
            <div
              key={item.id}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width:
                    index < storyIndex
                      ? '100%'
                      : index === storyIndex
                        ? `${progressPercent}%`
                        : '0%',
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Avatar
            url={group.author.avatar_url}
            username={group.author.username}
            className="h-8 w-8 text-xs"
          />
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white">
            <span className="truncate">{isMine ? 'Your story' : group.author.username}</span>
            <VerifiedBadge verified={group.author.is_verified} size="sm" />
          </span>
          <span className="text-xs text-white/60">
            {formatTimeAgo(story.created_at)} · {storyIndex + 1}/{segmentCount}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {isMine && (
              <button
                type="button"
                onClick={() => setShowViews(true)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
              >
                {views === null
                  ? viewsLoading
                    ? '…'
                    : '0 views'
                  : `${views.length} view${views.length === 1 ? '' : 's'}`}
              </button>
            )}
            {isMine && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="rounded-lg px-2 py-1 text-xs font-medium text-red-300 hover:bg-white/10 disabled:opacity-60"
              >
                Delete
              </button>
            )}
            {!isMine && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                disabled={reported}
                className="rounded-lg px-2 py-1 text-xs font-medium text-red-300 hover:bg-white/10 disabled:opacity-60"
              >
                {reported ? 'Reported' : 'Report'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close stories"
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
            <span>Delete this story for everyone?</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-white/80 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}
      </div>

      {/* Media + tap zones */}
      <div
        className="relative mx-auto flex w-full max-w-lg flex-1 items-center justify-center overflow-hidden"
        onPointerDown={() => {
          heldAtRef.current = performance.now();
          setPaused(true);
        }}
        onPointerUp={() => {
          setPaused(false);
          swallowClickRef.current = performance.now() - heldAtRef.current > LONG_PRESS_MS;
        }}
        onPointerCancel={() => setPaused(false)}
      >
        {story.media_type === 'video' ? (
          <video
            ref={videoRef}
            key={story.id}
            src={story.media_url}
            className="max-h-full max-w-full object-contain"
            autoPlay
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (!Number.isFinite(duration) || duration <= 0) return;
              setVideoDurationMs(
                Math.min(
                  MAX_VIDEO_DURATION_MS,
                  Math.max(MIN_VIDEO_DURATION_MS, duration * 1000),
                ),
              );
              progressRef.current = 0;
              setProgress(0);
            }}
          />
        ) : (
          <img
            key={story.id}
            src={story.media_url}
            alt={story.caption ?? `Story by ${group.author.username}`}
            className="max-h-full max-w-full object-contain"
          />
        )}

        <button
          type="button"
          aria-label="Previous story"
          className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
          onClick={() => {
            if (swallowClickRef.current) {
              swallowClickRef.current = false;
              return;
            }
            stepBack();
          }}
        />
        <button
          type="button"
          aria-label="Next story"
          className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
          onClick={() => {
            if (swallowClickRef.current) {
              swallowClickRef.current = false;
              return;
            }
            stepForward();
          }}
        />

        {paused && !confirmDelete && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <svg
              className="h-16 w-16 text-white/70"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7L8 5Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Caption + owner stats */}
      <div className="mx-auto w-full max-w-lg px-4 pb-6 pt-3">
        {story.caption && (
          <p className="text-sm leading-6 text-white/90">{story.caption}</p>
        )}
        {isMine && (
          <p className="mt-1 text-xs text-white/60">
            Expires in {hoursUntil(story.expires_at)} h
          </p>
        )}
      </div>

      {showViews && (
        <Modal open title="Story views" onClose={() => setShowViews(false)}>
          {viewsLoading && views === null ? (
            <div className="flex justify-center py-6 text-zinc-500">
              <Spinner className="h-6 w-6" />
            </div>
          ) : !views || views.length === 0 ? (
            <p className="py-2 text-sm text-zinc-500">Nobody has seen this story yet.</p>
          ) : (
            <ul className="max-h-64 space-y-3">
              {views.map((viewer) => (
                <li key={viewer.id} className="flex items-center gap-3">
                  <Avatar
                    url={viewer.avatar_url}
                    username={viewer.username}
                    className="h-8 w-8 text-xs"
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {viewer.username}
                      </span>
                      <VerifiedBadge verified={viewer.is_verified} size="sm" />
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {formatTimeAgo(viewer.viewed_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {!isMine && (
        <ReportModal
          open={reportOpen}
          target={{ type: 'story', id: story.id, label: `story by @${group.author.username}` }}
          onClose={() => setReportOpen(false)}
          onFiled={() => setReported(true)}
        />
      )}
    </div>
  );
}

/** Whole hours left before the story expires (min 1, for a friendly label). */
function hoursUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 3_600_000));
}
