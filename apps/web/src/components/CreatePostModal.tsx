import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@domdom/ui';
import {
  createPost,
  MAX_CAPTION_LENGTH,
  MAX_POST_IMAGE_BYTES,
  MAX_POST_VIDEO_BYTES,
  MAX_MEDIA_PER_POST,
  type FeedPost,
} from '@domdom/api';
import { checkMediaSignature, getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useUploader } from '../hooks/useMyProfile';
import { FileCard } from './FileCard';

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (post: FeedPost) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime';

/** New-post dialog: pick multiple photos/videos, add caption with hashtags/mentions, set privacy, publish or save as draft. */
export function CreatePostModal({ open, onClose, onCreated }: CreatePostModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploader = useUploader();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs when previews change or dialog closes.
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const reset = () => {
    setFiles([]);
    setPreviews((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setCaption('');
    setLocation('');
    setVisibility('public');
    setError(null);
  };

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

  const handleFiles = async (picked: FileList | null) => {
    if (!picked) return;
    setError(null);
    const newFiles = Array.from(picked);
    const total = files.length + newFiles.length;
    if (total > MAX_MEDIA_PER_POST) {
      setError(`You can upload up to ${MAX_MEDIA_PER_POST} photos/videos per post.`);
      return;
    }

    // Validate each file: type, size, and magic bytes (security rule 4)
    for (const file of newFiles) {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number]);
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type as (typeof ALLOWED_VIDEO_TYPES)[number]);
      if (!isImage && !isVideo) {
        setError('Please choose JPEG, PNG, WebP images or MP4, WebM, MOV videos.');
        return;
      }
      if (isImage && file.size > MAX_POST_IMAGE_BYTES) {
        setError('Images must be 8 MB or smaller.');
        return;
      }
      if (isVideo && file.size > MAX_POST_VIDEO_BYTES) {
        setError('Videos must be 100 MB or smaller.');
        return;
      }
      // Never trust the browser-reported type: read the actual bytes
      const signatureError = await checkMediaSignature(file, file.type);
      if (signatureError) {
        setError(signatureError);
        return;
      }
    }

    setFiles((prev) => [...prev, ...newFiles]);
    setPreviews((prev) => [
      ...prev,
      ...newFiles.map((f) => URL.createObjectURL(f)),
    ]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const newPreviews = prev.filter((_, i) => i !== index);
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return newPreviews;
    });
  };

  const submit = async (isDraft = false) => {
    if (files.length === 0) {
      setError('Choose at least one photo or video.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const post = await createPost(supabase!, {
        caption,
        files,
        location: location || undefined,
        visibility,
        isDraft,
      });
      reset();
      onCreated(post);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New post"
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />

        {previews.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {previews.map((preview, index) => (
                <FileCard
                  key={index}
                  uploader={uploader}
                  fileName={files[index]?.name ?? `File ${index + 1}`}
                  previewUrl={preview}
                  kind={files[index]?.type.startsWith('video/') ? 'video' : 'image'}
                  sizeBytes={files[index]?.size ?? 0}
                  meta={`Tap to remove`}
                  onPick={() => removeFile(index)}
                  onRemove={() => removeFile(index)}
                  removeLabel="Remove"
                />
              ))}
            </div>
            {files.length < MAX_MEDIA_PER_POST && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-500 dark:border-zinc-700 dark:text-zinc-400"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add more ({files.length}/{MAX_MEDIA_PER_POST})
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-10 text-sm text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Choose photos or videos
            <span className="text-xs text-zinc-400">
              JPEG, PNG, WebP, MP4, WebM · up to {MAX_MEDIA_PER_POST} files
            </span>
          </button>
        )}

        <div>
          <label htmlFor="post-caption" className="sr-only">
            Caption
          </label>
          <textarea
            id="post-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={MAX_CAPTION_LENGTH}
            rows={4}
            placeholder="Write a caption… Use #hashtags and @mentions"
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-right text-xs text-zinc-400">
            {caption.length}/{MAX_CAPTION_LENGTH}
          </p>
        </div>

        <div>
          <label htmlFor="post-location" className="sr-only">
            Location
          </label>
          <input
            id="post-location"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={100}
            placeholder="Add location (optional)"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Who can see this post?
          </label>
          <div className="flex gap-2">
            {(['public', 'followers', 'private'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === v
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                    : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
                }`}
              >
                {v === 'public' ? 'Public' : v === 'followers' ? 'Followers' : 'Only me'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => submit(true)}
            disabled={busy}
            variant="secondary"
            className="flex-1"
          >
            {busy ? 'Saving…' : 'Save as draft'}
          </Button>
          <Button onClick={() => submit(false)} disabled={busy} className="flex-1">
            {busy ? 'Sharing…' : 'Share'}
          </Button>
        </div>
        <p className="text-center text-xs text-zinc-400">
          Images up to {(MAX_POST_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB · Videos up to {(MAX_POST_VIDEO_BYTES / (1024 * 1024)).toFixed(0)} MB
        </p>
      </div>
    </Modal>
  );
}
