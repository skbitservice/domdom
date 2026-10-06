import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  acceptFollowRequest,
  blockUser,
  declineFollowRequest,
  getProfileByUsername,
  getProfileStats,
  getRelationship,
  getUserPosts,
  hasBlocked,
  unblockUser,
  type FeedPost,
  type ProfileStats,
  type Relationship,
} from '@domdom/api';
import type { Profile } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { BackButton } from '../components/BackButton';
import { ProfileHeader } from '../components/ProfileHeader';
import { FollowButton, type FollowState } from '../components/FollowButton';
import { PostGrid } from '../components/PostGrid';
import { ReportModal } from '../components/ReportModal';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: Profile; stats: ProfileStats };

/** Public profile page: /profile/:username */
export function ProfileView() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });

  const [rel, setRel] = useState<Relationship | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setState({ status: 'loading' });
    setRel(null);
    setBlocked(false);
    setActionError(null);

    getProfileByUsername(supabase!, username)
      .then(async (profile) => {
        if (cancelled) return;
        if (!profile) {
          setState({ status: 'missing' });
          return;
        }
        const stats = await getProfileStats(supabase!, profile.id);
        if (cancelled) return;
        setState({ status: 'ready', profile, stats });

        if (user && user.id !== profile.id) {
          const [relationship, isBlocked] = await Promise.all([
            getRelationship(supabase!, user.id, profile.id),
            hasBlocked(supabase!, profile.id),
          ]);
          if (!cancelled) {
            setRel(relationship);
            setBlocked(isBlocked);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: getErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [username, user]);

  const outgoingState: FollowState =
    rel?.outgoing?.status === 'accepted'
      ? 'accepted'
      : rel?.outgoing?.status === 'pending'
        ? 'pending'
        : 'none';

  // Load the profile's visible posts (RLS decides what the viewer may see).
  useEffect(() => {
    if (state.status !== 'ready') return;
    let cancelled = false;
    getUserPosts(supabase!, state.profile.id, user?.id ?? null)
      .then((rows) => {
        if (!cancelled) setPosts(rows);
      })
      .catch(() => {
        // Grid falls back to the empty state; header errors surface separately.
      });
    return () => {
      cancelled = true;
    };
  }, [state, user?.id]);

  const incomingPending = rel?.incoming?.status === 'pending';

  const handleBlockToggle = useCallback(async () => {
    if (state.status !== 'ready' || !user) return;
    const target = state.profile;
    const confirmed = window.confirm(
      blocked
        ? `Unblock @${target.username}?`
        : `Block @${target.username}? They will be removed from your followers and you from theirs.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setActionError(null);
    try {
      if (blocked) {
        await unblockUser(supabase!, target.id);
        setBlocked(false);
        setRel(await getRelationship(supabase!, user.id, target.id));
      } else {
        await blockUser(supabase!, target.id);
        setBlocked(true);
        setRel(null);
        setPosts([]);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [state, user, blocked]);

  const handleRequestDecision = useCallback(
    async (accept: boolean) => {
      if (state.status !== 'ready' || !rel?.incoming) return;
      setBusy(true);
      setActionError(null);
      try {
        if (accept) {
          await acceptFollowRequest(supabase!, rel.incoming.follower_id);
        } else {
          await declineFollowRequest(supabase!, rel.incoming.follower_id);
        }
        if (user) setRel(await getRelationship(supabase!, user.id, state.profile.id));
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [state, rel, user],
  );

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">@{username}</p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          This account doesn&apos;t exist.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <BackButton fallback="/" className="-ml-1 mb-3" />
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      </div>
    );
  }

  const { profile, stats } = state;
  const isOwn = user?.id === profile.id;
  const signedIn = Boolean(user);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackButton fallback="/" className="-ml-1 mb-2" />
      <ProfileHeader
        profile={profile}
        stats={stats}
        actions={
          isOwn ? (
            <Link
              to="/app/profile/edit"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-700"
            >
              Edit profile
            </Link>
          ) : signedIn ? (
            <>
              {blocked ? (
                <button
                  type="button"
                  onClick={handleBlockToggle}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                >
                  Unblock
                </button>
              ) : (
                <>
                  <FollowButton
                    targetId={profile.id}
                    myId={user!.id}
                    state={outgoingState}
                    onChange={(next) =>
                      setRel((current) => ({
                        outgoing:
                          next === 'none'
                            ? null
                            : ({
                                id: current?.outgoing?.id ?? '',
                                follower_id: user!.id,
                                following_id: profile.id,
                                status: next,
                                created_at: new Date().toISOString(),
                              }),
                        incoming: current?.incoming ?? null,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={handleBlockToggle}
                    disabled={busy}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800"
                  >
                    Block
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                disabled={reported}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                {reported ? 'Reported' : 'Report'}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Log in to follow
            </Link>
          )
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {actionError}
        </p>
      )}

      {!isOwn && !blocked && incomingPending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="text-sm text-indigo-800 dark:text-indigo-200">
            <span className="font-semibold">@{profile.username}</span> wants to
            follow you.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleRequestDecision(true)}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => handleRequestDecision(false)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-white disabled:opacity-60 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-800"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <PostGrid
        posts={posts}
        empty={
          <section className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {isOwn
              ? 'This is your public profile — share your first post from your profile page.'
              : `No posts to show from @${profile.username}.`}
          </section>
        }
      />

      {signedIn && !isOwn && (
        <ReportModal
          open={reportOpen}
          target={{ type: 'user', id: profile.id, label: `@${profile.username}` }}
          onClose={() => setReportOpen(false)}
          onFiled={() => setReported(true)}
        />
      )}
    </div>
  );
}
