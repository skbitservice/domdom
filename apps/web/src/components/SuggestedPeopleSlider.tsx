import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProfileHit } from '@domdom/api';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { FollowButton, type FollowState } from './FollowButton';

interface SuggestedPeopleSliderProps {
  /** Ranked suggestions — already filtered to people the viewer doesn't follow. */
  profiles: ProfileHit[];
  /** The viewer's outgoing follow status, keyed by profile id. */
  states: Record<string, FollowState>;
  myId: string;
  onChange: (profileId: string, next: FollowState) => void;
}

/** Second line under the username: display name, else social proof. */
function subtitle(profile: ProfileHit): string | null {
  if (profile.full_name) return profile.full_name;
  if (profile.follower_count > 0) {
    return `${profile.follower_count} follower${profile.follower_count === 1 ? '' : 's'}`;
  }
  return null;
}

interface CardProps {
  profile: ProfileHit;
  state: FollowState;
  myId: string;
  onChange: (next: FollowState) => void;
}

/** One suggestion in the strip: avatar, username, then the follow action. */
function SuggestionCard({ profile, state, myId, onChange }: CardProps) {
  const detail = subtitle(profile);

  return (
    <li className="flex w-36 shrink-0 snap-start flex-col items-center rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        to={`/profile/${profile.username}`}
        className="flex w-full flex-col items-center gap-1"
      >
        <Avatar
          url={profile.avatar_url}
          username={profile.username}
          className="h-16 w-16 text-lg"
        />
        <span className="flex max-w-full items-center gap-1">
          <span className="min-w-0 truncate text-sm font-semibold">{profile.username}</span>
          <VerifiedBadge verified={profile.is_verified} size="sm" />
        </span>
        {detail && (
          <span className="w-full truncate text-xs text-zinc-500 dark:text-zinc-400">
            {detail}
          </span>
        )}
        {profile.follows_me && (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Follows you
          </span>
        )}
      </Link>

      {/* mt-auto pins the button to the bottom of every (equal-height) card;
          the full-width wrapper lets the button stretch edge to edge. */}
      <div className="mt-auto w-full pt-3">
        <FollowButton targetId={profile.id} state={state} myId={myId} onChange={onChange} />
      </div>
    </li>
  );
}

/**
 * Horizontal "Suggested for you" strip: profile photo, username and a follow
 * button on every card, scrolled sideways instead of stacked vertically.
 *
 * The list is controlled — the parent owns fetching and the follow states —
 * so loading, error and empty states stay where the data is fetched. Desktop
 * arrow buttons appear only while there is more to scroll to; touch and
 * trackpad users just swipe.
 */
export function SuggestedPeopleSlider({
  profiles,
  states,
  myId,
  onChange,
}: SuggestedPeopleSliderProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft > 4,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    // Cards can wrap onto two lines (name + "Follows you"), so watch the box
    // as well as the card count to re-evaluate whether arrows are needed.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [sync, profiles.length]);

  const nudge = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 240), behavior: 'smooth' });
  };

  const arrowClass =
    'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xl leading-none text-zinc-700 shadow-md ring-1 ring-zinc-300 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-700';

  return (
    <div className="relative">
      <ul
        ref={scroller}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {profiles.map((profile) => (
          <SuggestionCard
            key={profile.id}
            profile={profile}
            state={states[profile.id] ?? 'none'}
            myId={myId}
            onChange={(next) => onChange(profile.id, next)}
          />
        ))}
      </ul>

      {edges.start && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll suggestions left"
          className={`${arrowClass} -left-2`}
        >
          <span aria-hidden="true">&lsaquo;</span>
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll suggestions right"
          className={`${arrowClass} -right-2`}
        >
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      )}
    </div>
  );
}
