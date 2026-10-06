import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, TextField } from '@domdom/ui';
import {
  getAdminOverview,
  getMyAdminRole,
  searchAccounts,
  setAccountBan,
  setAccountVerified,
  getSpamFlags,
  type AdminOverview,
} from '@domdom/api';
import type { AdminRole, Profile, SpamFlag } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { useAdminAccess } from '../../../hooks/useAdminAccess';
import { Avatar } from '../../../components/Avatar';
import { VerifiedBadge } from '../../../components/VerifiedBadge';

type Tab = 'overview' | 'accounts' | 'spam';

type SpamState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; flags: SpamFlag[] };

type OverviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AdminOverview };

type AccountsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; accounts: Profile[] };

const tabs: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'spam', label: 'Spam flags' },
];

function overviewCards(data: AdminOverview): { label: string; value: number; hint?: string }[] {
  return [
    { label: 'Accounts', value: data.accounts },
    { label: 'New this week', value: data.newAccounts7d },
    { label: 'Verified', value: data.verifiedAccounts },
    { label: 'Banned', value: data.bannedAccounts },
    { label: 'Open reports', value: data.openReports, hint: 'pending + under review' },
    { label: 'Resolved', value: data.resolvedReports },
    { label: 'Dismissed', value: data.rejectedReports },
    { label: 'Reports total', value: data.totalReports },
    { label: 'Follows', value: data.acceptedFollows, hint: 'accepted' },
  ];
}

/**
 * Admin dashboard — /app/admin (Step 11).
 *
 * Access follows the same rule as the moderation queue: the link is hidden
 * from everyone else for tidiness, while `is_admin()` in the database does
 * the deciding — reads return nothing and admin_set_ban / admin_set_verified
 * refuse with 42501 for anyone who is not a moderator.
 */
export function AdminDashboard() {
  const access = useAdminAccess();
  const { user } = useAuth();

  const [role, setRole] = useState<AdminRole | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OverviewState>({ status: 'loading' });
  const [accounts, setAccounts] = useState<AccountsState>({ status: 'idle' });
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [spam, setSpam] = useState<SpamState>({ status: 'idle' });

  const loadOverview = useCallback(() => {
    setOverview({ status: 'loading' });
    getAdminOverview(supabase!)
      .then((data) => setOverview({ status: 'ready', data }))
      .catch((error) => setOverview({ status: 'error', message: getErrorMessage(error) }));
  }, []);

  const loadAccounts = useCallback((term: string) => {
    setAccounts({ status: 'loading' });
    searchAccounts(supabase!, term)
      .then((rows) => setAccounts({ status: 'ready', accounts: rows }))
      .catch((error) => setAccounts({ status: 'error', message: getErrorMessage(error) }));
  }, []);

  const loadSpam = useCallback(() => {
    setSpam({ status: 'loading' });
    getSpamFlags(supabase!)
      .then((flags) => setSpam({ status: 'ready', flags }))
      .catch((error) => setSpam({ status: 'error', message: getErrorMessage(error) }));
  }, []);

  useEffect(() => {
    if (access !== 'granted') return;
    loadOverview();
    getMyAdminRole(supabase!)
      .then(setRole)
      .catch(() => setRole(null));
  }, [access, loadOverview]);

  // The Accounts tab loads its first page (newest accounts) on first open.
  useEffect(() => {
    if (access === 'granted' && tab === 'accounts' && accounts.status === 'idle') {
      loadAccounts('');
    }
  }, [access, tab, accounts.status, loadAccounts]);

  // The Spam tab loads flags on first open.
  useEffect(() => {
    if (access === 'granted' && tab === 'spam' && spam.status === 'idle') {
      loadSpam();
    }
  }, [access, tab, spam.status, loadSpam]);

  /** After a successful action: refresh the list *and* the counters. */
  const refreshAll = useCallback(() => {
    loadAccounts(search);
    loadOverview();
  }, [loadAccounts, loadOverview, search]);

  const toggleBan = async (account: Profile) => {
    const ban = !account.is_banned;
    const confirmed = window.confirm(
      ban
        ? `Ban @${account.username}? They stop appearing in follow lists and every future follow attempt is refused.`
        : `Unban @${account.username}? They will be able to interact again.`,
    );
    if (!confirmed) return;

    setBusyId(account.id);
    setActionError(null);
    try {
      await setAccountBan(supabase!, account.id, ban);
      refreshAll();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const toggleVerified = async (account: Profile) => {
    const verify = !account.is_verified;
    const confirmed = window.confirm(
      verify
        ? `Grant the verified badge to @${account.username}?`
        : `Remove the verified badge from @${account.username}?`,
    );
    if (!confirmed) return;

    setBusyId(account.id);
    setActionError(null);
    try {
      await setAccountVerified(supabase!, account.id, verify);
      refreshAll();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if (access === 'loading') {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (access === 'denied') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This area is limited to moderators. Admin rights live in the
          database (<span className="font-mono text-xs">admin_users</span> +
          <span className="font-mono text-xs"> is_admin()</span>), not in this
          page — ask the project owner to add your account.
        </p>
        <Link
          to="/app/home"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex items-center gap-3 text-xs">
          {role && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {role}
            </span>
          )}
          <Link
            to="/app/moderation"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Moderation queue →
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Platform numbers and account actions. Ban and verify run inside the
        database (<span className="font-mono text-xs">admin_set_ban()</span> /{' '}
        <span className="font-mono text-xs">admin_set_verified()</span>), so they
        work even if this page is bypassed — and fail for everyone else.
      </p>

      <div className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === option.value
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {actionError}
        </p>
      )}

      {tab === 'overview' && (
        <section className="mt-6">
          {overview.status === 'loading' && (
            <div className="flex justify-center py-16 text-zinc-500">
              <Spinner className="h-8 w-8" />
            </div>
          )}

          {overview.status === 'error' && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
            >
              {overview.message}
            </p>
          )}

          {overview.status === 'ready' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {overviewCards(overview.data).map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <p className="text-2xl font-bold tabular-nums">{card.value}</p>
                    <p className="mt-1 text-xs font-medium text-zinc-500">{card.label}</p>
                    {card.hint && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{card.hint}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Counted live under row-level security — an admin sees every
                report, a signed-in user would only see their own.
              </p>
            </>
          )}
        </section>
      )}

      {tab === 'accounts' && (
        <section className="mt-6">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              loadAccounts(search);
            }}
          >
            <div className="flex-1">
              <TextField
                label="Search accounts"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Username or full name — empty shows the newest"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {(accounts.status === 'idle' || accounts.status === 'loading') && (
            <div className="mt-6 flex justify-center py-16 text-zinc-500">
              <Spinner className="h-8 w-8" />
            </div>
          )}

          {accounts.status === 'error' && (
            <p
              role="alert"
              className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
            >
              {accounts.message}
            </p>
          )}

          {accounts.status === 'ready' && accounts.accounts.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No accounts match that search.
            </div>
          )}

          {accounts.status === 'ready' && accounts.accounts.length > 0 && (
            <>
              <p className="mt-5 text-xs text-zinc-500">
                {accounts.accounts.length} account{accounts.accounts.length === 1 ? '' : 's'}
                {search.trim() ? ' matching your search' : ' — newest first'}
              </p>
              <ul className="mt-2 space-y-3">
                {accounts.accounts.map((account) => {
                  const isSelf = account.id === user?.id;
                  return (
                    <li
                      key={account.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <Link
                        to={`/profile/${account.username}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <Avatar url={account.avatar_url} username={account.username} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">
                              {account.username}
                            </span>
                            <VerifiedBadge verified={account.is_verified} size="sm" withLabel />
                            {account.is_banned && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                                Banned
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-zinc-500">
                            {account.full_name ? `${account.full_name} · ` : ''}
                            joined {new Date(account.created_at).toLocaleDateString()}
                          </span>
                        </span>
                      </Link>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant={account.is_banned ? 'secondary' : 'danger'}
                          className="px-3 py-1.5 text-xs"
                          disabled={isSelf}
                          title={isSelf ? 'You cannot moderate your own account' : undefined}
                          loading={busyId === account.id}
                          onClick={() => toggleBan(account)}
                        >
                          {account.is_banned ? 'Unban' : 'Ban'}
                        </Button>
                        <Button
                          variant={account.is_verified ? 'secondary' : 'primary'}
                          className="px-3 py-1.5 text-xs"
                          disabled={isSelf}
                          title={isSelf ? 'You cannot verify your own account' : undefined}
                          loading={busyId === account.id}
                          onClick={() => toggleVerified(account)}
                        >
                          {account.is_verified ? 'Unverify' : 'Verify'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'spam' && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Spam flags
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Automatically flagged content — review and take action.
          </p>

          {spam.status === 'loading' && (
            <div className="mt-6 flex justify-center py-16 text-zinc-500">
              <Spinner className="h-8 w-8" />
            </div>
          )}

          {spam.status === 'error' && (
            <p
              role="alert"
              className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
            >
              {spam.message}
            </p>
          )}

          {spam.status === 'ready' && spam.flags.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No spam flags yet.
            </div>
          )}

          {spam.status === 'ready' && spam.flags.length > 0 && (
            <ul className="mt-4 space-y-3">
              {spam.flags.map((flag) => (
                <li
                  key={flag.id}
                  className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      {flag.flag_type}
                    </span>
                    <span className="text-xs text-zinc-400">
                      Score: {flag.score}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {flag.target_type} — {flag.target_id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(flag.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
