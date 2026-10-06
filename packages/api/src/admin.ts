import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole, Profile, SpamFlag } from '@domdom/types';

/**
 * Admin dashboard API (Step 11).
 *
 * Reads work because the RLS policies grant admins the rows they need
 * (reports: `reporter_id = auth.uid() or is_admin()`; profiles: public by
 * design). Writes never go through the profiles UPDATE policy — ban and
 * verify call the SECURITY DEFINER functions from migration 00014, which
 * re-check `public.is_admin()` inside the database. A non-admin calling
 * them gets a `42501` from PostgreSQL, whatever the UI believes.
 */

/** Live counters for the Overview tab. Every number is an exact RLS count. */
export interface AdminOverview {
  accounts: number;
  newAccounts7d: number;
  verifiedAccounts: number;
  bannedAccounts: number;
  /** pending + under_review — the queue a moderator should look at today. */
  openReports: number;
  resolvedReports: number;
  rejectedReports: number;
  totalReports: number;
  acceptedFollows: number;
}

/** Characters that would change the shape of a PostgREST `or=()` filter. */
const FILTER_UNSAFE = /[\\,()"'`]/g;

async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to do that.');
  return data.user.id;
}

/** Await a `head: true` count query and turn its result into a number. */
async function countOf(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Am I a moderator? Reads my own `admin_users` row — allowed by RLS for
 * rendering only. The real gate stays `public.is_admin()` in every policy
 * and in both admin functions.
 */
export async function getMyAdminRole(client: SupabaseClient): Promise<AdminRole | null> {
  const myId = await currentUserId(client);
  const { data, error } = await client
    .from('admin_users')
    .select('role')
    .eq('user_id', myId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as AdminRole | undefined) ?? null;
}

/**
 * Platform counters. Reports are only countable by admins (RLS narrows the
 * table to your own rows otherwise), which is fine: this runs on the admin
 * page. Follow relationships are openly readable by design (00002).
 */
export async function getAdminOverview(client: SupabaseClient): Promise<AdminOverview> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const head = { count: 'exact', head: true } as const;

  const [
    accounts,
    newAccounts7d,
    verifiedAccounts,
    bannedAccounts,
    pendingReports,
    underReviewReports,
    resolvedReports,
    rejectedReports,
    totalReports,
    acceptedFollows,
  ] = await Promise.all([
    countOf(client.from('profiles').select('id', head)),
    countOf(client.from('profiles').select('id', head).gte('created_at', weekAgo)),
    countOf(client.from('profiles').select('id', head).eq('is_verified', true)),
    countOf(client.from('profiles').select('id', head).eq('is_banned', true)),
    countOf(client.from('reports').select('id', head).eq('status', 'pending')),
    countOf(client.from('reports').select('id', head).eq('status', 'under_review')),
    countOf(client.from('reports').select('id', head).eq('status', 'resolved')),
    countOf(client.from('reports').select('id', head).eq('status', 'rejected')),
    countOf(client.from('reports').select('id', head)),
    countOf(client.from('follows').select('id', head).eq('status', 'accepted')),
  ]);

  return {
    accounts,
    newAccounts7d,
    verifiedAccounts,
    bannedAccounts,
    openReports: pendingReports + underReviewReports,
    resolvedReports,
    rejectedReports,
    totalReports,
    acceptedFollows,
  };
}

/**
 * Accounts for the Users tab: newest first, optionally narrowed by username
 * or full name. The term is stripped of characters that could break out of
 * the PostgREST `or=(…)` filter before it is embedded in the query.
 */
export async function searchAccounts(
  client: SupabaseClient,
  search = '',
): Promise<Profile[]> {
  const term = search.trim().replace(FILTER_UNSAFE, '').slice(0, 60);

  let query = client
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);
  if (term) {
    query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Profile[];
}

/**
 * Ban or unban an account via `admin_set_ban` (migration 00014). The
 * function refuses non-admins, self-bans and bans of admin accounts, and
 * returns the updated row so the list can refresh in place.
 */
export async function setAccountBan(
  client: SupabaseClient,
  userId: string,
  banned: boolean,
): Promise<Profile> {
  const { data, error } = await client.rpc('admin_set_ban', {
    target: userId,
    banned,
  });
  if (error) throw error;
  return data as Profile;
}

/** Grant or revoke the verified badge via `admin_set_verified` (00014). */
export async function setAccountVerified(
  client: SupabaseClient,
  userId: string,
  verified: boolean,
): Promise<Profile> {
  const { data, error } = await client.rpc('admin_set_verified', {
    target: userId,
    verified,
  });
  if (error) throw error;
  return data as Profile;
}

/** Get spam flags for admin review. */
export async function getSpamFlags(client: SupabaseClient): Promise<SpamFlag[]> {
  const { data, error } = await client
    .from('spam_flags')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as SpamFlag[];
}
