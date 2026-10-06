/**
 * Formatting helpers shared by every client (web now, mobile later).
 * Kept dependency-free so this package stays environment agnostic.
 */

/** Compact "how long ago" label: 58s → "1m", 2h, 3d, then a date. */
export function formatTimeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Whole number of hours an ISO timestamp is in the past (min 1). */
export function hoursAgo(iso: string): number {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 1;
  return Math.max(1, Math.floor((Date.now() - timestamp) / 3_600_000));
}

/** Compact engagement count: 949 → "949", 1 234 → "1.2K", 2 000 000 → "2M". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${trimZero(value / 1000)}K`;
  return `${trimZero(value / 1_000_000)}M`;
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

/** `mm:ss` label for a length in seconds ("0:00" when unknown). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.round(totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
