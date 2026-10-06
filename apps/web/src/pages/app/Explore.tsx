import { Fragment, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  getExplorePage,
  getSuggestedProfiles,
  searchProfiles,
  type FeedPost,
  type FollowStatus,
  type ProfileHit,
} from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { FollowButton, type FollowState } from '../../components/FollowButton';
import { SuggestedPeopleSlider } from '../../components/SuggestedPeopleSlider';
import { PostGrid } from '../../components/PostGrid';

type PeopleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profiles: ProfileHit[]; states: Record<string, FollowState> };

type PostsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; posts: FeedPost[]; hasMore: boolean; nextCursor: string | null };

/** Server follow status → the button's state machine ('blocked' ⇒ none). */
function toFollowState(status: FollowStatus | undefined): FollowState {
  if (status === 'accepted') return 'accepted';
  if (status === 'pending') return 'pending';
  return 'none';
}

interface PersonRowProps {
  profile: ProfileHit;
  state: FollowState;
  myId: string;
  onChange: (next: FollowState) => void;
}

/** One search result / suggestion: identity on the left, action on the right. */
function PersonRow({ profile, state, myId, onChange }: PersonRowProps) {
  const bits: ReactNode[] = [];
  if (profile.full_name) {
    bits.push(<span key="name">{profile.full_name}</span>);
  } else if (profile.bio) {
    bits.push(<span key="bio">{profile.bio}</span>);
  }
  if (profile.follows_me) {
    bits.push(
      <span key="follows" className="font-medium text-indigo-600 dark:text-indigo-400">
        Follows you
      </span>,
    );
  }
  if (profile.follower_count > 0) {
    bits.push(
      <span key="count">
        {profile.follower_count} follower{profile.follower_count === 1 ? '' : 's'}
      </span>,
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
      <Link to={`/profile/${profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar url={profile.avatar_url} username={profile.username} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{profile.username}</span>
            <VerifiedBadge verified={profile.is_verified} size="sm" />
          </span>
          {bits.length > 0 && (
            <span className="block truncate text-xs text-zinc-500">
              {bits.map((bit, index) => (
                <Fragment key={index}>
                  {index > 0 && ' · '}
                  {bit}
                </Fragment>
              ))}
            </span>
          )}
        </span>
      </Link>
      <FollowButton targetId={profile.id} state={state} myId={myId} onChange={onChange} />
    </li>
  );
}

/**
 * Step 9 — Search & Explore.
 *
 * Empty box: suggested people (ranked by followers, never people I already
 * follow) above a grid of the newest posts RLS lets me see. Non-empty box:
 * people search over username, display name and bio, debounced, with stale
 * responses dropped.
 */
export function Explore() {
  const { user } = useAuth();
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<PeopleState>({ status: 'idle' });
  const [suggestState, setSuggestState] = useState<PeopleState>({ status: 'loading' });
  const [postsState, setPostsState] = useState<PostsState>({ status: 'loading' });

  // Debounced commit; emptying the box drops straight back to suggestions.
  useEffect(() => {
    const needle = term.trim();
    if (!needle) {
      setQuery('');
      return;
    }
    const handle = window.setTimeout(() => setQuery(needle), 250);
    return () => window.clearTimeout(handle);
  }, [term]);

  // People search — responses that arrive after newer input are dropped.
  useEffect(() => {
    if (!query || !supabase || !user) {
      setSearchState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setSearchState({ status: 'loading' });
    searchProfiles(supabase, user.id, query)
      .then((result) => {
        if (cancelled) return;
        const states: Record<string, FollowState> = {};
        for (const profile of result.profiles) {
          states[profile.id] = toFollowState(result.states[profile.id]);
        }
        setSearchState({ status: 'ready', profiles: result.profiles, states });
      })
      .catch((searchError: unknown) => {
        if (!cancelled) setSearchState({ status: 'error', message: getErrorMessage(searchError) });
      });
    return () => {
      cancelled = true;
    };
  }, [query, user]);

  // Suggested people, fetched once per visit.
  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    setSuggestState({ status: 'loading' });
    getSuggestedProfiles(supabase, user.id, 8)
      .then((profiles) => {
        if (cancelled) return;
        const states: Record<string, FollowState> = {};
        for (const profile of profiles) states[profile.id] = 'none';
        setSuggestState({ status: 'ready', profiles, states });
      })
      .catch((suggestError: unknown) => {
        if (!cancelled) setSuggestState({ status: 'error', message: getErrorMessage(suggestError) });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The grid behind the search box: newest posts the viewer may see.
  const loadInitialPosts = useCallback(async () => {
    if (!supabase || !user) return;
    setPostsState({ status: 'loading' });
    try {
      const result = await getExplorePage(supabase, user.id, { limit: 30 });
      setPostsState({
        status: 'ready',
        posts: result.posts,
        hasMore: result.nextCursor !== null,
        nextCursor: result.nextCursor,
      });
    } catch (postsError: unknown) {
      setPostsState({ status: 'error', message: getErrorMessage(postsError) });
    }
  }, [user]);

  const loadMorePosts = useCallback(async () => {
    if (!supabase || !user || postsState.status !== 'ready' || !postsState.hasMore || !postsState.nextCursor) return;
    try {
      const result = await getExplorePage(supabase, user.id, {
        limit: 30,
        before: postsState.nextCursor,
      });
      setPostsState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              posts: [...prev.posts, ...result.posts],
              hasMore: result.nextCursor !== null,
              nextCursor: result.nextCursor,
            }
          : prev,
      );
    } catch (postsError: unknown) {
      setPostsState({ status: 'error', message: getErrorMessage(postsError) });
    }
  }, [user, postsState]);

  useEffect(() => {
    void loadInitialPosts();
  }, [loadInitialPosts]);

  // ProtectedRoute guarantees a session; this satisfies the type checker.
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  const myId = user.id;

  const needle = term.trim();
  const searching = needle.length > 0;
  // Input committed? If not, the debounce timer is still running.
  const debouncing = searching && query !== needle;

  const changeSearchState = (profileId: string, next: FollowState) => {
    setSearchState((prev) =>
      prev.status === 'ready' ? { ...prev, states: { ...prev.states, [profileId]: next } } : prev,
    );
  };
  const changeSuggestState = (profileId: string, next: FollowState) => {
    setSuggestState((prev) =>
      prev.status === 'ready' ? { ...prev, states: { ...prev.states, [profileId]: next } } : prev,
    );
  };

  const readyProfiles =
    searchState.status === 'ready'
      ? { profiles: searchState.profiles, states: searchState.states, change: changeSearchState }
      : null;
  const suggestProfiles =
    suggestState.status === 'ready'
      ? { profiles: suggestState.profiles, states: suggestState.states, change: changeSuggestState }
      : null;

  const renderRows = (
    profiles: ProfileHit[],
    states: Record<string, FollowState>,
    change: (id: string, next: FollowState) => void,
  ) => (
    <ul className="mt-2 space-y-1">
      {profiles.map((profile) => (
        <PersonRow
          key={profile.id}
          profile={profile}
          state={states[profile.id] ?? 'none'}
          myId={myId}
          onChange={(next) => change(profile.id, next)}
        />
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Explore</h1>

      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search people by username, name or bio"
        aria-label="Search people"
        className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      {searching ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Results for &ldquo;{needle}&rdquo;
          </h2>
          {debouncing || searchState.status === 'loading' ? (
            <div className="flex justify-center py-8 text-zinc-500">
              <Spinner className="h-6 w-6" />
            </div>
          ) : searchState.status === 'error' ? (
            <p role="alert" className="py-6 text-center text-sm text-red-600 dark:text-red-400">
              {searchState.message}
            </p>
          ) : readyProfiles && readyProfiles.profiles.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              No accounts match &ldquo;{needle}&rdquo; — try a different username, name or bio.
            </p>
          ) : readyProfiles ? (
            renderRows(readyProfiles.profiles, readyProfiles.states, readyProfiles.change)
          ) : null}
        </section>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Suggested people
            </h2>
            {suggestState.status === 'loading' ? (
              <div className="flex justify-center py-8 text-zinc-500">
                <Spinner className="h-6 w-6" />
              </div>
            ) : suggestState.status === 'error' ? (
              <p role="alert" className="py-6 text-center text-sm text-red-600 dark:text-red-400">
                {suggestState.message}
              </p>
            ) : suggestProfiles && suggestProfiles.profiles.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                No suggestions right now — everyone else here is already followed or blocked.
              </p>
            ) : suggestProfiles ? (
              <SuggestedPeopleSlider
                profiles={suggestProfiles.profiles}
                states={suggestProfiles.states}
                myId={myId}
                onChange={suggestProfiles.change}
              />
            ) : null}
          </section>

          <section className="mt-8">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Recent posts
            </h2>
            {postsState.status === 'loading' ? (
              <div className="mt-4 flex justify-center py-8 text-zinc-500">
                <Spinner className="h-6 w-6" />
              </div>
            ) : postsState.status === 'error' ? (
              <p
                role="alert"
                className="mt-4 py-6 text-center text-sm text-red-600 dark:text-red-400"
              >
                {postsState.message}
              </p>
            ) : (
              <>
                <PostGrid
                  posts={postsState.posts}
                  empty={
                    <p className="mt-4 py-6 text-center text-sm text-zinc-500">
                      No posts to explore yet — be the first to share something.
                    </p>
                  }
                />
                {postsState.hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMorePosts}
                      className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
