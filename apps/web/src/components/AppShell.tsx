import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@domdom/ui';
import { isAdmin } from '@domdom/api';
import { useAuth } from '../providers/AuthProvider';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { supabase } from '../lib/supabase';
import { BackButton } from './BackButton';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  {
    to: '/app/home',
    label: 'Home',
    icon: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-10.5Z" />,
  },
  {
    to: '/app/explore',
    label: 'Explore',
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  {
    to: '/app/reels',
    label: 'Reels',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
      </>
    ),
  },
  {
    to: '/app/messages',
    label: 'Messages',
    icon: <path d="M4 5h16v11H8l-4 4V5Z" />,
  },
  {
    to: '/app/notifications',
    label: 'Notifications',
    icon: (
      <>
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
  },
  {
    to: '/app/profile',
    label: 'Profile',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
  {
    to: '/app/saved',
    label: 'Saved',
    icon: (
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    ),
  },
  {
    to: '/app/reports',
    label: 'Your reports',
    icon: (
      <>
        <path d="M5 21V4h9l1 2h5v9h-6l-1-2H7v8H5Z" />
      </>
    ),
  },
];

/** Shown only to moderators — the database still decides, not this list. */
const adminItem: NavItem = {
  to: '/app/admin',
  label: 'Admin',
  icon: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
};

/**
 * Bottom bar on mobile: every sidebar entry except the sidebar-only ones.
 * Profile must be in here — the desktop sidebar is hidden on mobile, so this
 * bar is the only way to reach /app/profile from a phone.
 */
const sidebarOnly = new Set(['/app/reports']);
const mobileNavItems = navItems.filter((item) => !sidebarOnly.has(item.to));

const moderationItem: NavItem = {
  to: '/app/moderation',
  label: 'Moderation',
  icon: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

/**
 * Chrome for the logged-in area: left sidebar on desktop,
 * bottom tab bar on mobile (per the DOMDOM navigation spec).
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const unread = useUnreadNotifications();
  const unreadMessages = useUnreadMessages();
  const navigate = useNavigate();

  // Cosmetic: hides the Moderation entry from non-moderators.
  // Every read/write on that page is still gated by is_admin() in the DB.
  const [moderator, setModerator] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    isAdmin(supabase)
      .then((value) => {
        if (!cancelled) setModerator(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const items = moderator ? [...navItems, adminItem, moderationItem] : navItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
    }`;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-zinc-200 p-4 dark:border-zinc-800 md:flex">
          <div className="px-3 py-2 text-xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
            DOMDOM
          </div>
          <BackButton className="-ml-1 self-start" />
          <nav className="mt-4 flex flex-1 flex-col gap-1" aria-label="Main">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  {item.icon}
                </svg>
                {item.label}
                {item.to === '/app/notifications' && unread > 0 && (
                  <span
                    aria-label={`${unread} unread notifications`}
                    className="ml-auto rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold tabular-nums text-white dark:bg-indigo-500"
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                {item.to === '/app/messages' && unreadMessages > 0 && (
                  <span
                    aria-label={`${unreadMessages} unread messages`}
                    className="ml-auto rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold tabular-nums text-white dark:bg-indigo-500"
                  >
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <span className="truncate text-xs text-zinc-500" title={user?.email ?? undefined}>
              {user?.email}
            </span>
            <ThemeToggle />
          </div>
          <Button variant="ghost" className="mt-2 justify-start" onClick={handleSignOut}>
            Sign out
          </Button>
        </aside>

        {/* Mobile top bar */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
            <div className="flex min-w-0 items-center gap-1">
              <BackButton label="" className="-ml-1.5" />
              <span className="text-lg font-black tracking-tight text-indigo-600 dark:text-indigo-400">
                DOMDOM
              </span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </header>

          <main className="flex-1 pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={
                item.to === '/app/notifications' && unread > 0
                  ? `Notifications, ${unread} unread`
                  : item.to === '/app/messages' && unreadMessages > 0
                    ? `Messages, ${unreadMessages} unread`
                    : item.label
              }
              className={({ isActive }) =>
                `relative rounded-lg p-3 transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`
              }
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              {item.to === '/app/notifications' && unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              {item.to === '/app/messages' && unreadMessages > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                >
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
