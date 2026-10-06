import { useState } from 'react';
import { followUser, getRelationship, unfollowUser } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';

export type FollowState = 'none' | 'pending' | 'accepted';

interface FollowButtonProps {
  targetId: string;
  state: FollowState;
  myId: string;
  onChange: (next: FollowState) => void;
}

const labels: Record<FollowState, string> = {
  none: 'Follow',
  pending: 'Requested',
  accepted: 'Following',
};

function friendly(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === '42501') return "You can't follow this account.";
  return getErrorMessage(error);
}

/**
 * Follow / Requested / Following toggle. The row's status comes from the
 * database (public ⇒ accepted, private ⇒ pending), never from this button.
 */
export function FollowButton({ targetId, state, myId, onChange }: FollowButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      if (state === 'none') {
        const row = await followUser(supabase!, targetId);
        if (row) {
          onChange(row.status === 'pending' ? 'pending' : 'accepted');
        } else {
          // Row already existed (race) — reconcile with the server.
          const rel = await getRelationship(supabase!, myId, targetId);
          onChange(rel.outgoing?.status === 'accepted' ? 'accepted' : 'pending');
        }
      } else {
        // Following → unfollow; Requested → cancel request (same row).
        await unfollowUser(supabase!, targetId);
        onChange('none');
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const primary = state === 'none';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        className={
          primary
            ? 'min-w-28 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60'
            : 'min-w-28 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-700'
        }
      >
        {labels[state]}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
