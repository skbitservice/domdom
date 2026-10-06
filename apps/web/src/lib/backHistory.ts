/**
 * In-app visit log for the Back button.
 *
 * window.history can contain other websites, so "back" is resolved against the
 * screens this app actually rendered: the log remembers the last places the
 * user visited and shrinks again when the browser itself goes back, so the
 * button never throws the user out to another site.
 */

const MAX_VISITS = 50;
const AUTH_PATHS = new Set(['/login', '/register', '/forgot-password']);
const visits: string[] = [];

/** Called on every route change (see BackHistoryTracker). */
export function recordVisit(pathname: string): void {
  const top = visits[visits.length - 1];
  if (top === pathname) return;

  // The browser moved back to the entry before this one — follow it.
  if (visits.length > 1 && visits[visits.length - 2] === pathname) {
    visits.pop();
    return;
  }

  visits.push(pathname);
  if (visits.length > MAX_VISITS) visits.shift();
}

/**
 * The screen the user came from, or null when `pathname` was the first one.
 *
 * Inside /app only earlier /app screens count, and auth screens are skipped
 * everywhere, so Back from a section can never land on the login page.
 */
export function previousVisit(pathname: string): string | null {
  const knownAt = visits.lastIndexOf(pathname);
  const inApp = pathname.startsWith('/app');

  for (let i = (knownAt === -1 ? visits.length : knownAt) - 1; i >= 0; i -= 1) {
    const candidate = visits[i];
    if (!candidate || candidate === pathname || AUTH_PATHS.has(candidate)) continue;
    if (inApp && !candidate.startsWith('/app')) continue;
    return candidate;
  }

  return null;
}
