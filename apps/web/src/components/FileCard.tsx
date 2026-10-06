import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

/** The person who uploaded / sent the file. `is_verified` drives the badge. */
export interface FileUploader {
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean | null;
}

export interface FileCardProps {
  /** Uploader / sender — name and verified badge live in the card header. */
  uploader: FileUploader;
  /** Display name of the file (never the object URL). */
  fileName: string;
  /** Object/data URL of an image or video preview, when there is one. */
  previewUrl?: string | null;
  kind?: 'image' | 'video' | 'file';
  /** File size in bytes — shown as KB/MB next to the file name. */
  sizeBytes?: number;
  /** Extra line under the file name (duration, status, "expires in 24 h"…). */
  meta?: ReactNode;
  /** Makes the preview clickable (e.g. "tap to change" inside a picker). */
  onPick?: () => void;
  /** Shows a remove button (pending upload that can be discarded). */
  onRemove?: () => void;
  removeLabel?: string;
  /** `card` = header + large preview · `row` = compact list/attachment row. */
  variant?: 'card' | 'row';
  /** Extra classes for the preview element (aspect, max height…). */
  previewClassName?: string;
  className?: string;
}

function formatSize(bytes?: number): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-blue-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

/**
 * One uploaded / attached file: uploader name + verified badge + file name in
 * a single header area, with the preview directly underneath.
 *
 * Used by every upload flow (post image, reel video, story media, avatar) so
 * the badge, the name and the file always travel together — in the preview,
 * in the attachment card and in compact uploaded-file lists.
 */
export function FileCard({
  uploader,
  fileName,
  previewUrl = null,
  kind = 'file',
  sizeBytes,
  meta,
  onPick,
  onRemove,
  removeLabel = 'Remove file',
  variant = 'card',
  previewClassName = '',
  className = '',
}: FileCardProps) {
  const sizeText = formatSize(sizeBytes);
  const details = [sizeText, meta].filter(Boolean);

  const header = (
    <>
      <Avatar
        url={uploader.avatar_url ?? null}
        username={uploader.username}
        className="h-9 w-9 text-xs"
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {uploader.username}
          </span>
          <VerifiedBadge verified={uploader.is_verified} size="sm" />
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">{fileName}</span>
          {details.length > 0 && <span> · {details.join(' · ')}</span>}
        </span>
      </span>
    </>
  );

  const preview = previewUrl ? (
    kind === 'video' ? (
      <video
        src={previewUrl}
        controls
        playsInline
        preload="metadata"
        className={
          previewClassName ||
          'max-h-72 w-full bg-black object-contain'
        }
      />
    ) : (
      <img
        src={previewUrl}
        alt={fileName}
        className={previewClassName || 'max-h-72 w-full bg-zinc-100 object-contain dark:bg-zinc-800'}
      />
    )
  ) : (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-5 dark:bg-zinc-800/60">
      <FileGlyph />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {fileName}
        </span>
        {sizeText && <span className="block text-xs text-zinc-500">{sizeText}</span>}
      </span>
    </div>
  );

  if (variant === 'row') {
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      >
        {header}
        {previewUrl && (
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {kind === 'video' ? (
              <video src={previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={previewUrl} alt={fileName} className="h-full w-full object-cover" />
            )}
          </span>
        )}
        {onRemove && <RemoveButton label={removeLabel} onRemove={onRemove} />}
      </div>
    );
  }

  const media = onPick ? (
    <button
      type="button"
      onClick={onPick}
      className="block w-full cursor-pointer transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      {preview}
    </button>
  ) : (
    preview
  );

  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <figcaption className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        {header}
        {onRemove && <RemoveButton label={removeLabel} onRemove={onRemove} />}
      </figcaption>
      <div className="p-3">{media}</div>
    </figure>
  );
}
