import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal, Spinner, TextField } from '@domdom/ui';
import {
  addReelComment,
  deleteReelComment,
  getReelComments,
  type ReelCommentItem,
} from '@domdom/api';
import { formatTimeAgo, getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';
import { ReportModal } from '../ReportModal';

interface ReelCommentsProps {
  reelId: string;
  onClose: () => void;
  /** Lets the feed keep its comment counter in sync with reality. */
  onCountChange: (delta: number) => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; comments: ReelCommentItem[] };

/** Comment thread for one reel, opened from the player's rail. */
export function ReelComments({ reelId, onClose, onCountChange }: ReelCommentsProps) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportedComments, setReportedComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getReelComments(supabase!, reelId)
      .then((comments) => {
        if (!cancelled) setState({ status: 'ready', comments });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: getErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [reelId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const content = draft.trim();
    if (!content) {
      setFormError('Write something first.');
      return;
    }
    if (content.length > 500) {
      setFormError('Comments can be at most 500 characters.');
      return;
    }

    setBusy(true);
    try {
      const comment = await addReelComment(supabase!, reelId, content);
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', comments: [...current.comments, comment] }
          : current,
      );
      setDraft('');
      onCountChange(1);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: ReelCommentItem) => {
    setFormError(null);
    try {
      await deleteReelComment(supabase!, comment.id);
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', comments: current.comments.filter((item) => item.id !== comment.id) }
          : current,
      );
      onCountChange(-1);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <Modal open title="Comments" onClose={onClose}>
      {state.status === 'loading' && (
        <div className="flex justify-center py-8 text-zinc-500">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {state.status === 'error' && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          {state.comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              No comments yet. Say something nice.
            </p>
          ) : (
            <ul className="space-y-4">
              {state.comments.map((comment) => {
                const commentReported = reportedComments.has(comment.id);
                return (
                  <li key={comment.id} className="group flex items-start gap-3">
                    <Avatar
                      url={comment.author.avatar_url}
                      username={comment.author.username}
                      className="h-8 w-8 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <Link
                          to={`/profile/${comment.author.username}`}
                          className="inline-flex items-center gap-1 font-semibold hover:underline"
                          onClick={onClose}
                        >
                          {comment.author.username}
                          <VerifiedBadge verified={comment.author.is_verified} size="xs" />
                        </Link>{' '}
                        <span className="text-xs text-zinc-500">
                          {formatTimeAgo(comment.created_at)}
                        </span>
                      </p>
                      <p className="break-words text-sm text-zinc-700 dark:text-zinc-300">
                        {comment.content}
                      </p>
                    </div>
                    {comment.user_id === user?.id ? (
                      <button
                        type="button"
                        onClick={() => remove(comment)}
                        aria-label="Delete comment"
                        className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    ) : (
                      user && (
                        <button
                          type="button"
                          onClick={() => setReportCommentId(comment.id)}
                          disabled={commentReported}
                          aria-label="Report comment"
                          className="shrink-0 rounded-lg p-1.5 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-800 disabled:opacity-60"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="M4 21V4m0 1h12l-2 4 2 4H4" />
                          </svg>
                        </button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={submit} className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <TextField
              label="Add a comment"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a comment…"
              maxLength={500}
              error={formError}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">{draft.trim().length}/500</span>
              <Button type="submit" loading={busy}>
                Post
              </Button>
            </div>
          </form>
        </>
      )}

      {user && reportCommentId && (
        <ReportModal
          open
          target={{ type: 'comment', id: reportCommentId, label: 'comment' }}
          onClose={() => setReportCommentId(null)}
          onFiled={() =>
            setReportedComments((prev) => new Set(prev).add(reportCommentId))
          }
        />
      )}
    </Modal>
  );
}
