import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReelFeedItem } from '@domdom/api';
import { formatCount, formatDuration } from '@domdom/utils';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';

interface ReelPlayerProps {
  item: ReelFeedItem;
  /** True for the one reel currently snapped into view. */
  isActive: boolean;
  muted: boolean;
  isOwner: boolean;
  /** Whether the viewer is signed in (report requires auth). */
  isAuthenticated: boolean;
  onToggleMute: () => void;
  onLike: (reelId: string, liked: boolean) => void;
  onOpenComments: (reelId: string) => void;
  onDelete: (item: ReelFeedItem) => void;
  onReport: (reelId: string) => void;
}

/**
 * One full-height reel: autoplay is driven by the feed's IntersectionObserver
 * (only the snapped-in video plays), sound stays off until the viewer asks
 * for it — browsers block audible autoplay anyway — and a tap pauses.
 */
export function ReelPlayer({
  item,
  isActive,
  muted,
  isOwner,
  isAuthenticated,
  onToggleMute,
  onLike,
  onOpenComments,
  onDelete,
  onReport,
}: ReelPlayerProps) {
  const { reel, author, likes_count, comments_count, liked_by_me } = item;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isActive) {
      video.pause();
      video.currentTime = 0;
      // The reel is paused right now, so the tap surface must offer "Play".
      setPaused(true);
      return;
    }

    const play = () => {
      void video.play().catch(() => {
        // Autoplay refused (policy or data saver) — the tap overlay recovers.
        setPaused(true);
      });
    };

    if (video.readyState >= 2) {
      play();
    } else {
      video.addEventListener('canplay', play, { once: true });
    }
    return () => video.removeEventListener('canplay', play);
  }, [isActive]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(
        () => setPaused(false),
        () => setPaused(true),
      );
    } else {
      video.pause();
      setPaused(true);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={reel.video_url}
        poster={reel.thumbnail_url ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onClick={togglePlayback}
        className="absolute inset-0 h-full w-full cursor-pointer object-contain"
      />

      {/* Tap surface: pause indicator, rendered under the controls */}
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={paused ? 'Play' : 'Pause'}
        className="absolute inset-0 flex items-center justify-center text-white/90 transition-opacity"
      >
        {paused && (
          <svg
            className="h-16 w-16 drop-shadow"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        )}
      </button>

      {/* Sound toggle */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {reel.duration !== null && (
          <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
            {formatDuration(reel.duration)}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            {muted ? (
              <path d="m16 9 5 6m0-6-5 6" />
            ) : (
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
        </button>
      </div>

      {/* Engagement rail */}
      <div
        className="absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white drop-shadow"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onLike(reel.id, !liked_by_me)}
          aria-label={liked_by_me ? 'Unlike' : 'Like'}
          aria-pressed={liked_by_me}
          className={`flex flex-col items-center gap-1 transition-transform active:scale-90 ${
            liked_by_me ? 'text-red-500' : 'text-white'
          }`}
        >
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill={liked_by_me ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
          </svg>
          <span className="text-xs font-semibold">{formatCount(likes_count)}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenComments(reel.id)}
          aria-label="Comments"
          className="flex flex-col items-center gap-1 text-white"
        >
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
          <span className="text-xs font-semibold">{formatCount(comments_count)}</span>
        </button>

        <div className="flex flex-col items-center gap-1 text-white">
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-xs font-semibold">{formatCount(reel.views_count)}</span>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            aria-label="Delete reel"
            className="flex flex-col items-center gap-1 text-white hover:text-red-400"
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
            </svg>
          </button>
        )}

        {!isOwner && isAuthenticated && (
          <button
            type="button"
            onClick={() => onReport(reel.id)}
            aria-label="Report reel"
            className="flex flex-col items-center gap-1 text-white hover:text-red-400"
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M4 21V4m0 1h12l-2 4 2 4H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Author + caption */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-5 pt-16 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <Link
          to={`/profile/${author.username}`}
          className="flex items-center gap-2 font-semibold hover:underline"
        >
          <Avatar url={author.avatar_url} username={author.username} className="h-8 w-8 text-xs" />
          <span className="truncate">{author.username}</span>
          {/* Near the screen's bottom edge: open the tooltip upwards. */}
          <VerifiedBadge verified={author.is_verified} size="sm" placement="top" />
        </Link>

        {reel.caption && (
          <p className="mt-2 line-clamp-2 text-sm text-white/90">{reel.caption}</p>
        )}

        {reel.audio_name && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/80">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M9 18V5l11-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="17" cy="16" r="3" />
            </svg>
            {reel.audio_name}
          </p>
        )}
      </div>
    </div>
  );
}
