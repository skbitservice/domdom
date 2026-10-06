import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  getProfileById,
  getProfileStats,
  getUserPosts,
  type FeedPost,
  type ProfileStats,
} from '@domdom/api';
import type { Profile } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { ProfileHeader } from '../../components/ProfileHeader';
import { FollowRequests } from '../../components/FollowRequests';
import { FollowListModal } from '../../components/FollowListModal';
import { PostGrid } from '../../components/PostGrid';
import { CreatePostModal } from '../../components/CreatePostModal';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: Profile; stats: ProfileStats };

interface ListState {
  open: boolean;
  mode: 'followers' | 'following';
}

export function Profile() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [list, setList] = useState<ListState>({ open: false, mode: 'followers' });
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [creating, setCreating] = useState(false);

  const loadPosts = useCallback(() => {
    if (!user) return;
    getUserPosts(supabase!, user.id, user.id)
      .then(setPosts)
      .catch(() => setPosts([])); // grid stays empty; header errors surface separately
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    setState({ status: 'loading' });
    Promise.all([getProfileById(supabase!, user.id), getProfileStats(supabase!, user.id)])
      .then(([profile, stats]) => {
        if (cancelled) return;
        if (!profile) {
          setState({
            status: 'error',
            message:
              'No profile exists for this account yet. Profiles are created automatically at signup — if this persists, re-run migration 00001.',
          });
        } else {
          setState({ status: 'ready', profile, stats });
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: getErrorMessage(error) });
      });

    loadPosts();

    return () => {
      cancelled = true;
    };
  }, [user, loadPosts]);

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
      </div>
    );
  }

  const { profile, stats } = state;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <ProfileHeader
        profile={profile}
        stats={stats}
        onFollowersClick={() => setList({ open: true, mode: 'followers' })}
        onFollowingClick={() => setList({ open: true, mode: 'following' })}
        actions={
          <>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              New post
            </button>
            <Link
              to="/app/profile/edit"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-700"
            >
              Edit profile
            </Link>
          </>
        }
      />

      <div className="mt-4">
        <FollowRequests />
      </div>

      <PostGrid
        posts={posts}
        empty={
          <section className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">No posts yet</p>
            <p className="mt-1">Share your first photo — it will appear here.</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              New post
            </button>
          </section>
        }
      />

      <FollowListModal
        open={list.open}
        mode={list.mode}
        userId={profile.id}
        onClose={() => setList((current) => ({ ...current, open: false }))}
      />

      <CreatePostModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(post) => {
          setPosts((current) => [post, ...current]);
          setState((current) =>
            current.status === 'ready'
              ? { ...current, stats: { ...current.stats, posts: current.stats.posts + 1 } }
              : current,
          );
        }}
      />
    </div>
  );
}
