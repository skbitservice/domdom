import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Spinner } from '@domdom/ui';
import { getFollowers, getFollowing, type ProfileLite } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface FollowListModalProps {
  open: boolean;
  mode: 'followers' | 'following';
  userId: string;
  onClose: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profiles: ProfileLite[] };

/** Followers / following list in a modal, opened from the profile stats. */
export function FollowListModal({ open, mode, userId, onClose }: FollowListModalProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: 'loading' });

    const load = mode === 'followers' ? getFollowers : getFollowing;
    load(supabase!, userId)
      .then((profiles) => {
        if (!cancelled) setState({ status: 'ready', profiles });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: getErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, userId]);

  const title = mode === 'followers' ? 'Followers' : 'Following';

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {state.status === 'loading' && (
        <div className="flex justify-center py-8 text-zinc-500">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {state.status === 'error' && (
        <p className="py-4 text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      {state.status === 'ready' && state.profiles.length === 0 && (
        <p className="py-6 text-center text-sm text-zinc-500">
          {mode === 'followers'
            ? 'No followers yet.'
            : 'Not following anyone yet.'}
        </p>
      )}

      {state.status === 'ready' && state.profiles.length > 0 && (
        <ul className="space-y-1">
          {state.profiles.map((profile) => (
            <li key={profile.id}>
              <Link
                to={`/profile/${profile.username}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Avatar url={profile.avatar_url} username={profile.username} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">
                      {profile.username}
                    </span>
                    <VerifiedBadge verified={profile.is_verified} size="sm" />
                  </span>
                  {profile.full_name && (
                    <span className="block truncate text-xs text-zinc-500">
                      {profile.full_name}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
