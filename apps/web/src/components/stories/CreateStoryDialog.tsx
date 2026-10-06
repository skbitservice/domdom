import { useEffect, useRef, useState } from 'react';
import { Button, Modal, TextField } from '@domdom/ui';
import { createStory, uploadStoryMedia } from '@domdom/api';
import type { Story } from '@domdom/types';
import {
  checkMediaSignature,
  getErrorMessage,
  validateStoryFile,
} from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useUploader } from '../../hooks/useMyProfile';
import { FileCard } from '../FileCard';

/** Mirrors the `story-media` bucket limit (25 MB) enforced server-side. */
const MAX_STORY_MB = 25;
const ACCEPTED =
  'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

type Phase = 'idle' | 'validating' | 'uploading';

interface CreateStoryDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fired after the story row exists so the bar can show it immediately. */
  onCreated: (story: Story) => void;
}

/**
 * Pick → validate → preview → share flow for a 24-hour story.
 *
 * Files are checked three times before anything is uploaded: declared MIME
 * type against the allow-list, size against the bucket limit, and finally
 * the file's magic bytes against that MIME type (a renamed `.exe` or an HTML
 * file dressed up as a JPEG never reaches storage).
 */
export function CreateStoryDialog({ open, onClose, onCreated }: CreateStoryDialogProps) {
  const { user } = useAuth();
  const uploader = useUploader();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  const revokePreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  };

  const reset = () => {
    revokePreview();
    setFile(null);
    setCaption('');
    setError(null);
    setPhase('idle');
    if (inputRef.current) inputRef.current.value = '';
  };

  useEffect(() => () => revokePreview(), []);

  const handlePick = async (picked: File | undefined) => {
    revokePreview();
    setFile(null);
    setError(null);
    if (!picked) return;

    const typeError = validateStoryFile(picked, MAX_STORY_MB);
    if (typeError) {
      setError(typeError);
      return;
    }

    setPhase('validating');
    const signatureError = await checkMediaSignature(picked, picked.type);
    setPhase('idle');
    if (signatureError) {
      setError(signatureError);
      return;
    }

    previewRef.current = URL.createObjectURL(picked);
    setFile(picked);
  };

  const handleShare = async () => {
    if (!file || !user || phase !== 'idle') return;

    setPhase('uploading');
    setError(null);
    try {
      const mediaUrl = await uploadStoryMedia(supabase!, user.id, file);
      const story = await createStory(supabase!, {
        media_url: mediaUrl,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
        caption,
      });
      reset();
      onCreated(story);
    } catch (err) {
      setError(getErrorMessage(err));
      setPhase('idle');
    }
  };

  const busy = phase !== 'idle';

  return (
    <Modal open={open} title="Add to your story" onClose={busy ? () => {} : onClose}>
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          aria-label="Choose a photo or video"
          onChange={(event) => void handlePick(event.target.files?.[0])}
        />

        {file && previewRef.current ? (
          <FileCard
            uploader={uploader}
            fileName={file.name}
            previewUrl={previewRef.current}
            kind={file.type.startsWith('video/') ? 'video' : 'image'}
            sizeBytes={file.size}
            onPick={busy ? undefined : () => inputRef.current?.click()}
            previewClassName="mx-auto block aspect-[9/16] max-h-72 w-40 rounded-xl bg-black object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mx-auto flex aspect-[9/16] max-h-72 w-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400"
          >
            <span className="text-3xl" aria-hidden="true">
              +
            </span>
            Choose photo or video
          </button>
        )}

        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {file ? 'Choose a different file' : 'Choose photo or video'}
        </Button>

        <TextField
          label="Caption (optional)"
          value={caption}
          maxLength={200}
          placeholder="Say something…"
          disabled={busy}
          onChange={(event) => setCaption(event.target.value)}
        />

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">
            {phase === 'validating'
              ? 'Checking file…'
              : phase === 'uploading'
                ? 'Uploading…'
                : file
                  ? `${Math.max(1, Math.round(file.size / 1024))} KB · expires in 24 h`
                  : 'Disappears after 24 hours'}
          </span>
          <Button
            onClick={() => void handleShare()}
            loading={phase === 'uploading'}
            disabled={!file || busy}
          >
            Share
          </Button>
        </div>
      </div>
    </Modal>
  );
}
