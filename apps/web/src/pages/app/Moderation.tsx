import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@domdom/ui';
import {
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  getReportQueue,
  setReportStatus,
  type ReportQueueItem,
} from '@domdom/api';
import type { ReportStatus } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAdminAccess } from '../../hooks/useAdminAccess';

type Filter = 'open' | 'all' | ReportStatus;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ReportQueueItem[] };

const filters: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const statusChip: Record<ReportStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  under_review:
    'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  resolved:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

function reasonLabel(report: ReportQueueItem): string {
  return REPORT_REASONS.find((r) => r.value === report.reason)?.label ?? report.reason;
}

/**
 * Moderation queue — /app/moderation.
 *
 * The link is hidden from non-admins for tidiness only: RLS already
 * refuses every read and write in this page unless public.is_admin(),
 * so opening the URL by hand just shows an empty result / an error.
 */
export function Moderation() {
  const access = useAdminAccess();
  const [filter, setFilter] = useState<Filter>('open');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    getReportQueue(supabase!, filter)
      .then((items) => setState({ status: 'ready', items }))
      .catch((error) => setState({ status: 'error', message: getErrorMessage(error) }));
  }, [filter]);

  useEffect(() => {
    if (access === 'granted') load();
  }, [access, load]);

  const move = async (report: ReportQueueItem, next: ReportStatus) => {
    setBusyId(report.id);
    setActionError(null);
    try {
      await setReportStatus(supabase!, report.id, next);
      load();
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
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This queue is limited to moderators. Admin rights live in the
          database (<span className="font-mono text-xs">admin_users</span> +
          <span className="font-mono text-xs"> is_admin()</span>), not in this
          page — ask the project owner to add your account.
        </p>
        <Link
          to="/app/reports"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Your reports
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Moderation</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Every report filed on DOMDOM, newest first.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === option.value
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
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

      {state.status === 'loading' && (
        <div className="flex justify-center py-16 text-zinc-500">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {state.status === 'error' && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Nothing here — no reports match this filter.
        </div>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="mt-6 space-y-3">
          {state.items.map((report) => (
            <li
              key={report.id}
              className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {REPORT_TARGET_LABELS[report.target_type]}:{' '}
                  <span className="font-medium">{report.targetLabel}</span>
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip[report.status]}`}
                >
                  {REPORT_STATUS_LABELS[report.status]}
                </span>
              </div>

              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {reasonLabel(report)}
                {report.description && (
                  <span className="mt-1 block whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    “{report.description}”
                  </span>
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>
                  By{' '}
                  {report.reporter ? (
                    <Link
                      to={`/profile/${report.reporter.username}`}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      @{report.reporter.username}
                    </Link>
                  ) : (
                    'a deleted account'
                  )}
                </span>
                <span>{new Date(report.created_at).toLocaleString()}</span>
                {report.resolved_at && (
                  <span>Closed {new Date(report.resolved_at).toLocaleString()}</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {report.status === 'pending' && (
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    loading={busyId === report.id}
                    onClick={() => move(report, 'under_review')}
                  >
                    Start review
                  </Button>
                )}
                {report.status === 'under_review' && (
                  <>
                    <Button
                      className="px-3 py-1.5 text-xs"
                      loading={busyId === report.id}
                      onClick={() => move(report, 'resolved')}
                    >
                      Resolve — action taken
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      loading={busyId === report.id}
                      onClick={() => move(report, 'rejected')}
                    >
                      Dismiss — no violation
                    </Button>
                  </>
                )}
                {(report.status === 'resolved' || report.status === 'rejected') && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    loading={busyId === report.id}
                    onClick={() => move(report, 'under_review')}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
