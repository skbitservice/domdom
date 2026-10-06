import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  editPost,
  deletePost,
  archivePost,
  restorePost,
  setCommentsDisabled,
  setHideLikeCount,
  type FeedPost,
} from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

interface PostOptionsMenuProps {
  post: FeedPost;
  onDelete?: (postId: string) => void;
}

/** Options menu for post owners: edit, archive, delete, disable comments, hide likes. */
export function PostOptionsMenu({ post, onDelete }: PostOptionsMenuProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.post.caption || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleEdit = async () => {
    setBusy(true);
    setError(null);
    try {
      await editPost(supabase!, post.post.id, { caption: editCaption });
      setEditOpen(false);
      setOpen(false);
      // Refresh the page to show updated caption
      navigate(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      if (post.post.is_archived) {
        await restorePost(supabase!, post.post.id);
      } else {
        await archivePost(supabase!, post.post.id);
      }
      setOpen(false);
      navigate(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleComments = async () => {
    setBusy(true);
    setError(null);
    try {
      await setCommentsDisabled(supabase!, post.post.id, !post.post.comments_disabled);
      setOpen(false);
      navigate(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleHideLikes = async () => {
    setBusy(true);
    setError(null);
    try {
      await setHideLikeCount(supabase!, post.post.id, !post.post.hide_like_count);
      setOpen(false);
      navigate(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await deletePost(supabase!, post.post.id);
      setOpen(false);
      onDelete?.(post.post.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Post options"
        className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => {
              setEditCaption(post.post.caption || '');
              setEditOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit caption
          </button>

          <button
            type="button"
            onClick={handleArchive}
            disabled={busy}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            {post.post.is_archived ? 'Restore post' : 'Archive post'}
          </button>

          <button
            type="button"
            onClick={handleToggleComments}
            disabled={busy}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {post.post.comments_disabled ? 'Enable comments' : 'Disable comments'}
          </button>

          <button
            type="button"
            onClick={handleToggleHideLikes}
            disabled={busy}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {post.post.hide_like_count ? 'Show like count' : 'Hide like count'}
          </button>

          <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />

          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete post
          </button>
        </div>
      )}

      {/* Edit caption modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-4 text-lg font-semibold">Edit caption</h3>
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              rows={4}
              maxLength={2200}
              className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="Write a caption…"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEdit}
                disabled={busy}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
