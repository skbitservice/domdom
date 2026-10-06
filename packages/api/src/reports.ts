import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Report,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '@domdom/types';

/**
 * Reports & moderation API (Step 10).
 *
 * Rules enforced here (and re-enforced by the database):
 * - a report is always filed as yourself (`reporter_id = auth.uid()`);
 * - reason / target_type come from the CHECK constraints in 00007;
 * - only `is_admin()` may read the whole queue or move a report through
 *   pending → under_review → resolved | rejected — the RLS policies decide
 *   that, not this file;
 * - a reporter sees only their own rows (also RLS).
 */

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or dangerous acts' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'fake_account', label: 'Fake account or impersonation' },
  { value: 'copyright', label: 'Copyright infringement' },
  { value: 'other', label: 'Something else' },
];

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  user: 'Account',
  post: 'Post',
  comment: 'Comment',
  reel: 'Reel',
  story: 'Story',
  message: 'Message',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  under_review: 'Under review',
  resolved: 'Resolved',
  rejected: 'Dismissed',
};

/** Description limit mirrors reports_description_len in the schema. */
export const REPORT_DESCRIPTION_MAX = 1000;

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string | null;
}

/** A report enriched for the moderation queue. */
export interface ReportQueueItem extends Report {
  reporter: { id: string; username: string; avatar_url: string | null } | null;
  /** Human label of whatever was reported (best effort — see resolveTargets). */
  targetLabel: string;
}

async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to do that.');
  return data.user.id;
}

function friendly(error: unknown): Error {
  const code = (error as { code?: string }).code;
  if (code === '23505')
    return new Error('You already reported this — our moderators are on it.');
  if (code === '42501')
    return new Error('Your account is not allowed to do that.');
  return error instanceof Error ? error : new Error(String(error));
}

/** True when I have an unresolved report open against this target. */
export async function hasOpenReport(
  client: SupabaseClient,
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const myId = await currentUserId(client);
  const { data, error } = await client
    .from('reports')
    .select('id')
    .eq('reporter_id', myId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .in('status', ['pending', 'under_review'])
    .limit(1);
  if (error) throw friendly(error);
  return (data ?? []).length > 0;
}

/**
 * File a report about a user, post, comment, reel, story or message.
 * Duplicate open reports are refused client-side and by a partial unique
 * index (migration 00011), so the queue never sees the same thing twice.
 */
export async function fileReport(
  client: SupabaseClient,
  input: ReportInput,
): Promise<Report> {
  const myId = await currentUserId(client);
  const description = input.description?.trim() ?? '';

  if (!input.targetId) throw new Error('Nothing to report was selected.');
  if (description.length > REPORT_DESCRIPTION_MAX) {
    throw new Error(
      `Please keep the description under ${REPORT_DESCRIPTION_MAX} characters.`,
    );
  }
  if (input.targetType === 'user' && input.targetId === myId) {
    throw new Error('You cannot report yourself.');
  }
  if (await hasOpenReport(client, input.targetType, input.targetId)) {
    throw new Error('You already reported this — our moderators are on it.');
  }

  const { data, error } = await client
    .from('reports')
    .insert({
      reporter_id: myId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      description: description || null,
    })
    .select('*')
    .single();
  if (error) throw friendly(error);
  return data;
}

/** My reports, newest first (RLS narrows this to my rows anyway). */
export async function getMyReports(client: SupabaseClient): Promise<Report[]> {
  const myId = await currentUserId(client);
  const { data, error } = await client
    .from('reports')
    .select('*')
    .eq('reporter_id', myId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw friendly(error);
  return data ?? [];
}

/**
 * Am I a moderator? Reads my own `admin_users` row — allowed by RLS for
 * rendering only. The real gate is `public.is_admin()` inside every policy.
 */
export async function isAdmin(client: SupabaseClient): Promise<boolean> {
  const myId = await currentUserId(client);
  const { data, error } = await client
    .from('admin_users')
    .select('role')
    .eq('user_id', myId)
    .maybeSingle();
  if (error) throw friendly(error);
  return data !== null && (data.role === 'admin' || data.role === 'moderator');
}

/**
 * Human labels for report targets keyed by target_id. Accounts resolve to
 * "@username"; the other target types are soft references with no join, so
 * they degrade to "Post · 1a2b3c4d" until Steps 4–6 ship their UI.
 */
export async function resolveTargetLabels(
  client: SupabaseClient,
  reports: Pick<Report, 'target_type' | 'target_id'>[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const userIds = [
    ...new Set(
      reports
        .filter((r) => r.target_type === 'user')
        .map((r) => r.target_id),
    ),
  ];
  if (userIds.length === 0) return labels;

  const { data, error } = await client
    .from('profiles')
    .select('id, username')
    .in('id', userIds);
  if (error) throw friendly(error);
  for (const row of data ?? []) {
    labels.set(row.id, `@${row.username}`);
  }
  return labels;
}

/** Fallback label when nothing resolved (or the account was deleted). */
export function describeTarget(report: Pick<Report, 'target_type' | 'target_id'>): string {
  return `${REPORT_TARGET_LABELS[report.target_type]} · ${report.target_id.slice(0, 8)}`;
}

/** The moderation queue. `open` = pending + under review, `all` = everything. */
export async function getReportQueue(
  client: SupabaseClient,
  status?: ReportStatus | 'open' | 'all',
): Promise<ReportQueueItem[]> {
  let query = client
    .from('reports')
    .select(
      `*,
       reporter:profiles!reports_reporter_id_fkey(id, username, avatar_url)`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (status === 'open') {
    query = query.in('status', ['pending', 'under_review']);
  } else if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw friendly(error);

  const rows = (data ?? []) as unknown as Omit<ReportQueueItem, 'targetLabel'>[];
  const targets = await resolveTargetLabels(
    client,
    rows.map(({ reporter: _reporter, ...report }) => report),
  );

  return rows.map((row) => ({
    ...row,
    targetLabel: targets.get(row.target_id) ?? describeTarget(row),
  }));
}

/**
 * Move a report through the workflow. `resolved_at` / `resolved_by` are set
 * here and, once migration 00011 is applied, guaranteed server-side too.
 */
export async function setReportStatus(
  client: SupabaseClient,
  reportId: string,
  status: ReportStatus,
): Promise<Report> {
  const myId = await currentUserId(client);
  const closing = status === 'resolved' || status === 'rejected';

  const { data, error } = await client
    .from('reports')
    .update({
      status,
      ...(closing
        ? { resolved_at: new Date().toISOString(), resolved_by: myId }
        : { resolved_at: null, resolved_by: null }),
    })
    .eq('id', reportId)
    .select('*')
    .single();
  if (error) throw friendly(error);
  if (!data) {
    throw new Error('That report no longer exists (or you lack admin rights).');
  }
  return data;
}
