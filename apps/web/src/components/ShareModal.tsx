import { useState } from 'react';
import { Modal, Button } from '@domdom/ui';
import { sharePost } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { Avatar } from './Avatar';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  postCaption: string;
}

/** Share a post to DM, story, external apps, or copy link. */
export function ShareModal({ open, onClose, postId, postCaption }: ShareModalProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  const handleShareToDM = async () => {
    setBusy(true);
    setError(null);
    try {
      await sharePost(supabase!, postId, 'dm');
      setShareSuccess('Shared to chat!');
      setTimeout(() => {
        setShareSuccess(null);
        onClose();
      }, 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleShareToStory = async () => {
    setBusy(true);
    setError(null);
    try {
      await sharePost(supabase!, postId, 'story');
      setShareSuccess('Shared to story!');
      setTimeout(() => {
        setShareSuccess(null);
        onClose();
      }, 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      await sharePost(supabase!, postId, 'copy_link');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link. Please copy it manually.');
    }
  };

  const handleExternalShare = async () => {
    const url = `${window.location.origin}/post/${postId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check this post on DOMDOM',
          text: postCaption.slice(0, 100),
          url,
        });
        await sharePost(supabase!, postId, 'external');
      } catch {
        // User cancelled or share failed
      }
    } else {
      // Fallback: copy link
      await handleCopyLink();
    }
  };

  return (
    <Modal open={open} title="Share post" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Share this post with others
        </p>

        <div className="space-y-2">
          <Button
            onClick={handleShareToDM}
            disabled={busy}
            className="w-full justify-start"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Send in chat
          </Button>

          <Button
            onClick={handleShareToStory}
            disabled={busy}
            variant="secondary"
            className="w-full justify-start"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Share to story
          </Button>

          <Button
            onClick={handleExternalShare}
            disabled={busy}
            variant="secondary"
            className="w-full justify-start"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share externally
          </Button>

          <Button
            onClick={handleCopyLink}
            disabled={busy}
            variant="secondary"
            className="w-full justify-start"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? 'Link copied!' : 'Copy link'}
          </Button>
        </div>

        {shareSuccess && (
          <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-400">
            {shareSuccess}
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
