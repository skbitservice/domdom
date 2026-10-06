import { useLocation, useNavigate } from 'react-router-dom';
import { previousVisit } from '../lib/backHistory';

interface BackButtonProps {
  /** Screen to open when there is no earlier one inside the app. */
  fallback?: string;
  /** Visible text next to the arrow. */
  label?: string;
  className?: string;
}

/** React Router keeps the position in the browser history as `idx`. */
function historyIndex(): number {
  const state = window.history.state as { idx?: number | null } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

/**
 * "Go back" for every section: returns to the screen the user came from, or to
 * `fallback` when the section was opened directly. Renders nothing when there
 * is nowhere to go back to (typically the first screen after opening the app).
 */
export function BackButton({
  fallback = '/app/home',
  label = 'Back',
  className = '',
}: BackButtonProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const previous = previousVisit(pathname);
  const target = previous ?? fallback;

  if (target === pathname) return null;

  const handleBack = () => {
    // Step through the real history when the previous entry is ours,
    // otherwise jump straight to the remembered section.
    if (previous && historyIndex() > 0) navigate(-1);
    else navigate(target);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label ? `${label} to ${target}` : 'Go back'}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-300 dark:hover:bg-zinc-800 ${className}`}
    >
      <svg
        className="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
