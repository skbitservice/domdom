import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  acceptFollowRequest,
  declineFollowRequest,
  getIncomingRequests,
  type ProfileLite,
} from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

/**
 * Pending follow requests for the signed-in user, with Accept / Decline.
 * Renders nothing when there are no requests.
 */
export function FollowRequests() {
  const [requests, setRequests] = useState<ProfileLite[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getIncomingRequests(supabase!)
      .then(setRequests)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const decide = async (requesterId: string, accept: boolean) => {
    setBusyId(requesterId);
    setError(null);
    try {
      if (accept) {
        await acceptFollowRequest(supabase!, requesterId);
      } else {
        await declineFollowRequest(supabase!, requesterId);
      }
      reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null && !error) {
    return (
      <div className="flex justify-center py-6 text-zinc-400">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </p>
    );
  }

  if (!requests || requests.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">
        Follow requests ({requests.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {requests.map((requester) => (
          <li key={requester.id} className="flex items-center gap-3">
            <Link
              to={`/profile/${requester.username}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar url={requester.avatar_url} username={requester.username} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {requester.username}
                  </span>
                  <VerifiedBadge verified={requester.is_verified} size="sm" />
                </span>
                {requester.full_name && (
                  <span className="block truncate text-xs text-zinc-500">
                    {requester.full_name}
                  </span>
                )}
              </span>
            </Link>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide(requester.id, true)}
                disabled={busyId === requester.id}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => decide(requester.id, false)}
                disabled={busyId === requester.id}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
