import { useEffect, useState } from 'react';
import { Button, Modal, Spinner } from '@domdom/ui';
import {
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS,
  fileReport,
  hasOpenReport,
} from '@domdom/api';
import type { Report, ReportTargetType } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** What the user sees, e.g. "@someone". */
  label: string;
}

interface ReportModalProps {
  open: boolean;
  target: ReportTarget;
  onClose: () => void;
  /** Called once the report exists in the database. */
  onFiled?: (report: Report) => void;
}

type Phase = 'checking' | 'form' | 'already' | 'done';

/**
 * Report dialog: pick a reason, optionally explain, submit. The row is
 * inserted with reporter_id = my own id; RLS keeps other people's reports
 * invisible to me and mine invisible to them.
 */
export function ReportModal({ open, target, onClose, onFiled }: ReportModalProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset + check for an existing open report each time it opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase('checking');
    setReason('');
    setDescription('');
    setError(null);

    hasOpenReport(supabase!, target.type, target.id)
      .then((exists) => {
        if (!cancelled) setPhase(exists ? 'already' : 'form');
      })
      .catch(() => {
        // The check is a convenience — the DB has a unique index too.
        if (!cancelled) setPhase('form');
      });

    return () => {
      cancelled = true;
    };
  }, [open, target.type, target.id]);

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please choose a reason.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const report = await fileReport(supabase!, {
        targetType: target.type,
        targetId: target.id,
        reason: (reason as Report['reason']),
        description,
      });
      setPhase('done');
      onFiled?.(report);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={phase === 'done' ? 'Report sent' : `Report ${target.label}`}
      onClose={onClose}
    >
      {phase === 'checking' && (
        <div className="flex items-center justify-center gap-3 py-8 text-sm text-zinc-500">
          <Spinner className="h-5 w-5" /> Checking…
        </div>
      )}

      {phase === 'already' && (
        <div className="space-y-4 py-2 text-sm leading-6">
          <p className="text-zinc-700 dark:text-zinc-300">
            You already reported <span className="font-semibold">{target.label}</span>. Our
            moderators will review it — you can follow the status under{' '}
            <span className="font-medium">Your reports</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4 py-2 text-sm leading-6">
          <p className="text-zinc-700 dark:text-zinc-300">
            Thanks — your report about <span className="font-semibold">{target.label}</span>{' '}
            has been filed. A moderator will look at it; you&apos;ll see the outcome in{' '}
            <span className="font-medium">Your reports</span>.
          </p>
          <p className="text-xs text-zinc-500">
            False reports may lead to restrictions on your own account.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}

      {phase === 'form' && (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              What&apos;s wrong?
            </legend>
            <div className="space-y-1">
              {REPORT_REASONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    reason === option.value
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setError(null);
                    }}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label
              htmlFor="report-description"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Anything else? <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, REPORT_DESCRIPTION_MAX))}
              rows={3}
              placeholder="Add context that helps a moderator decide…"
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <p className="text-right text-xs tabular-nums text-zinc-400">
              {description.length}/{REPORT_DESCRIPTION_MAX}
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleSubmit} loading={busy}>
              Submit report
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
