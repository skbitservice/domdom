import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button, Spinner } from '@domdom/ui';
import { createReel } from '@domdom/api';
import type { Reel } from '@domdom/types';
import { checkMediaSignature, formatDuration, getErrorMessage, validateVideoFile } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useUploader } from '../../hooks/useMyProfile';
import { FileCard } from '../FileCard';

interface NewReelProps {
  onClose: () => void;
  /** Called after a successful upload so the feed can show the new reel. */
  onCreated: (reel: Reel) => void;
}

/** Mirrors the `reel-media` bucket limit (50 MB) and the `reels.duration` check. */
const MAX_MEGABYTES = 50;
const MAX_SECONDS = 300;

interface PickedVideo {
  file: File;
  url: string;
  duration: number | null;
  thumbnail: Blob | null;
}

/** Draws the current frame onto a small JPEG — used as the reel's poster. */
async function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;

  const width = Math.min(480, videoWidth);
  const height = Math.round((videoHeight / videoWidth) * width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
}

/** Reads the duration and grabs a poster frame without showing anything.
 *  Returns an object with the promise and a cleanup function to release the video element. */
function probeVideo(
  url: string,
): {
  promise: Promise<{ duration: number | null; thumbnail: Blob | null }>;
  cleanup: () => void;
} {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  let settled = false;
  let giveUp: ReturnType<typeof setTimeout>;

  const promise = new Promise<{ duration: number | null; thumbnail: Blob | null }>((resolve) => {
    const finish = (duration: number | null, thumbnail: Blob | null) => {
      if (settled) return;
      settled = true;
      if (giveUp) window.clearTimeout(giveUp);
      resolve({ duration, thumbnail });
    };

    giveUp = window.setTimeout(() => finish(null, null), 10_000);

    video.addEventListener('error', () => {
      finish(null, null);
    });

    video.addEventListener(
      'loadeddata',
      () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        const target = Math.min(0.5, (duration ?? 1) * 0.1);

        video.addEventListener(
          'seeked',
          () => {
            void captureFrame(video).then((thumbnail) => finish(duration, thumbnail));
          },
          { once: true },
        );

        try {
          video.currentTime = target;
        } catch {
          finish(duration, null);
        }
      },
      { once: true },
    );

    video.src = url;
  });

  const cleanup = () => {
    if (!settled) {
      settled = true;
      if (giveUp) window.clearTimeout(giveUp);
    }
    // Remove all event listeners by cloning the element
    video.remove();
  };

  return { promise, cleanup };
}

/**
 * Full-screen composer: pick a video, validate it (type → size → magic
 * bytes → duration), preview it, add a caption and upload to `reel-media`.
 * Nothing is written to the database until the file is in storage.
 */
export function NewReel({ onClose, onCreated }: NewReelProps) {
  const uploader = useUploader();
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [caption, setCaption] = useState('');
  const [audioName, setAudioName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const pickedRef = useRef<PickedVideo | null>(null);
  const probeCleanupRef = useRef<(() => void) | null>(null);

  // Release the object URL and cleanup video probe when the composer goes away.
  useEffect(() => {
    return () => {
      if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
      if (probeCleanupRef.current) probeCleanupRef.current();
    };
  }, []);

  const setVideo = (next: PickedVideo | null) => {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    pickedRef.current = next;
    setPicked(next);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);

    const typeError = validateVideoFile(file, MAX_MEGABYTES);
    if (typeError) {
      setError(typeError);
      return;
    }

    // Never trust the browser-reported type: read the actual bytes.
    const signatureError = await checkMediaSignature(file, file.type);
    if (signatureError) {
      setError(signatureError);
      return;
    }

    setProbing(true);
    const url = URL.createObjectURL(file);
    const { promise, cleanup } = probeVideo(url);
    probeCleanupRef.current = cleanup;

    try {
      const { duration, thumbnail } = await promise;
      probeCleanupRef.current = null;
      setProbing(false);

      if (duration !== null && duration > MAX_SECONDS) {
        URL.revokeObjectURL(url);
        setError(`Reels must be ${formatDuration(MAX_SECONDS)} or shorter — that video is ${formatDuration(duration)}.`);
        return;
      }

      setVideo({ file, url, duration, thumbnail });
    } catch {
      probeCleanupRef.current = null;
      setProbing(false);
      URL.revokeObjectURL(url);
      setError('Could not read video. Please pick another one.');
    }
  };

  const submit = async () => {
    if (!picked) {
      setError('Pick a video first.');
      return;
    }
    if (caption.trim().length > 500) {
      setError('Captions can be at most 500 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const reel = await createReel(supabase!, {
        video: picked.file,
        thumbnail: picked.thumbnail,
        caption: caption.trim() || null,
        audioName: audioName.trim() || null,
        duration: picked.duration,
      });
      onCreated(reel);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <h1 className="font-semibold">New reel</h1>
        <Button onClick={submit} loading={busy}>
          Share
        </Button>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto p-4">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
          >
            {error}
          </p>
        )}

        {!picked ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            {probing ? (
              <div className="flex justify-center py-6 text-zinc-500">
                <Spinner className="h-6 w-6" />
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold">Choose a video</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  MP4, MOV or WEBM — up to {MAX_MEGABYTES} MB and {formatDuration(MAX_SECONDS)} long.
                  The file is checked before it is uploaded.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="sr-only"
                    onChange={handleFile}
                    disabled={probing || busy}
                  />
                  Browse files
                </label>
              </>
            )}
          </div>
        ) : (
          <>
            <FileCard
              uploader={uploader}
              fileName={picked.file.name}
              previewUrl={picked.url}
              kind="video"
              sizeBytes={picked.file.size}
              meta={
                picked.duration !== null
                  ? `${formatDuration(picked.duration)}${picked.thumbnail ? ' · poster ready' : ''}`
                  : 'length unknown'
              }
              previewClassName="mx-auto max-h-[50vh] w-full rounded-xl bg-black object-contain"
            />

            <button
              type="button"
              onClick={() => {
                setVideo(null);
                setError(null);
              }}
              className="mt-2 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              disabled={busy}
            >
              Choose a different video
            </button>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="reel-caption"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Caption
                </label>
                <textarea
                  id="reel-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Write a caption…"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                <p className="text-right text-xs text-zinc-500">{caption.length}/500</p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reel-audio"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Audio credit <span className="font-normal text-zinc-500">(optional)</span>
                </label>
                <input
                  id="reel-audio"
                  value={audioName}
                  onChange={(event) => setAudioName(event.target.value)}
                  maxLength={120}
                  placeholder="Original sound · your name"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <p className="mt-5 text-xs leading-5 text-zinc-500">
              Your reel is stored in the public <code className="font-mono">reel-media</code>{' '}
              bucket and follows your account privacy: private accounts show it to followers only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
