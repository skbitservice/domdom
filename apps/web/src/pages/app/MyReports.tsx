import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  describeTarget,
  getMyReports,
  resolveTargetLabels,
} from '@domdom/api';
import type { Report, ReportStatus } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; reports: Report[]; labels: Map<string, string> };

const statusChip: Record<ReportStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  under_review:
    'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  resolved:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

function reasonLabel(report: Report): string {
  return REPORT_REASONS.find((r) => r.value === report.reason)?.label ?? report.reason;
}

/** "Your reports" — everything I filed, with its current workflow status. */
export function MyReports() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    getMyReports(supabase!)
      .then(async (reports) => {
        const labels = await resolveTargetLabels(supabase!, reports);
        setState({ status: 'ready', reports, labels });
      })
      .catch((error) => setState({ status: 'error', message: getErrorMessage(error) }));
  }, []);

  useEffect(load, [load]);

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      </div>
    );
  }

  const { reports, labels } = state;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Your reports</h1>
        <span className="text-sm text-zinc-500">{reports.length} filed</span>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Moderators review reports in order — false reports may lead to
        restrictions on your account.
      </p>

      {reports.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p>You haven&apos;t reported anything yet.</p>
          <p className="mt-1">
            Open any profile and use the <span className="font-medium text-red-600 dark:text-red-400">Report</span>{' '}
            button next to Block.
          </p>
          <Link
            to="/app/explore"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Go to Explore
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((report) => {
            const target = labels.get(report.target_id) ?? describeTarget(report);
            return (
              <li
                key={report.id}
                className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {REPORT_TARGET_LABELS[report.target_type]}:{' '}
                    <span className="font-medium">{target}</span>
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
                  <span>Filed {new Date(report.created_at).toLocaleString()}</span>
                  {report.resolved_at && (
                    <span>
                      Closed {new Date(report.resolved_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
