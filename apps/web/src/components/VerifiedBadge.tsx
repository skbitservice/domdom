import { useId, useState } from 'react';

/** Icon sizes — small enough to sit next to a name, big enough to read. */
export type VerifiedBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export interface VerifiedBadgeProps {
  /**
   * The only switch that matters: the badge renders when (and only when) the
   * account is verified. Unverified users never see a badge.
   */
  verified?: boolean | null;
  size?: VerifiedBadgeSize;
  /** Tooltip text shown on hover, focus and click. */
  label?: string;
  /** Which side of the icon the tooltip opens on (bottom by default). */
  placement?: 'top' | 'bottom';
  /** Renders a small "Verified" chip beside the icon (profile-style headers). */
  withLabel?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<VerifiedBadgeSize, { icon: string; chip: string; gap: string }> = {
  xs: { icon: 'h-3 w-3', chip: 'px-1.5 py-px text-[10px]', gap: 'gap-1' },
  sm: { icon: 'h-3.5 w-3.5', chip: 'px-1.5 py-0.5 text-[11px]', gap: 'gap-1' },
  md: { icon: 'h-4 w-4', chip: 'px-2 py-0.5 text-xs', gap: 'gap-1.5' },
  lg: { icon: 'h-5 w-5', chip: 'px-2 py-1 text-sm', gap: 'gap-1.5' },
};

/**
 * Scalloped outer contour of the badge (12 lobes, centred on 12,12).
 * Drawn once as a solid shape so the check stays crisp on any background.
 */
const BADGE_PATH =
  'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z';

/**
 * The one verified badge used across the app — feed, comments, chat, profile,
 * search, notifications, stories, reels and file/attachment cards.
 *
 * Design notes:
 * - Blue gradient seal with a white check: premium, unmistakably "verified".
 * - Renders nothing for unverified accounts, so callers can pass the flag
 *   straight through without any conditional JSX.
 * - Tooltip ("Verified Account") appears on hover, on keyboard focus and on
 *   click/tap, so it works on touch devices too.
 */
export function VerifiedBadge({
  verified,
  size = 'sm',
  label = 'Verified Account',
  placement = 'bottom',
  withLabel = false,
  className = '',
}: VerifiedBadgeProps) {
  const [pinned, setPinned] = useState(false);
  const gradientId = useId();

  if (!verified) return null;

  const scale = SIZE_CLASS[size];
  const tooltipVisible = pinned
    ? 'translate-y-0 opacity-100'
    : '-translate-y-0.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100';

  return (
    <span
      className={`relative z-30 inline-flex shrink-0 items-center align-middle ${scale.gap} ${className}`}
    >
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        onClick={(event) => {
          // Keep the tap on the badge itself: it pins the tooltip instead of
          // following the link / opening the row the badge sits inside.
          event.preventDefault();
          event.stopPropagation();
          setPinned((current) => !current);
        }}
        onBlur={() => setPinned(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setPinned(false);
          }
        }}
        className="group inline-flex cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
      >
        <svg
          viewBox="0 0 24 24"
          className={`${scale.icon} drop-shadow-[0_1px_2px_rgba(37,99,235,0.35)]`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="52%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          <path d={BADGE_PATH} fill={`url(#${gradientId})`} />
          <path
            d="M7.9 12.3 10.9 15.3 16.4 9.5"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Tooltip sits on the configured side — never outside the card it
            lives in, so it is not clipped by `overflow-hidden` headers. */}
        <span
          className={`pointer-events-none absolute left-1/2 z-50 flex -translate-x-1/2 items-center whitespace-nowrap rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-semibold leading-none text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/15 transition-all duration-150 ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${tooltipVisible}`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-blue-600 ${
              placement === 'top' ? '-bottom-1' : '-top-1'
            }`}
          />
          <span className="relative">{label}</span>
        </span>
      </span>

      {withLabel && (
        <span
          className={`inline-flex items-center rounded-full bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30 ${scale.chip}`}
        >
          Verified
        </span>
      )}
    </span>
  );
}
