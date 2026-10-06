import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowStatus } from './social';

/**
 * Search & discovery API (Step 9).
 *
 * Reads run under the public `profiles` SELECT policy, so nothing is exposed
 * here that a signed-out visitor could not already fetch. Blocking is applied
 * as a courtesy filter with the SECURITY DEFINER `is_blocked()` helper — the
 * database remains the authority for every action (following, posting,
 * commenting) regardless of what these lists show.
 */

/** A profile as shown in search results and suggestion lists. */
export interface ProfileHit {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_private: boolean;
  /** Accepted followers; pending requests are not counted. */
  follower_count: number;
  /** True when this account already follows the signed-in user. */
  follows_me: boolean;
}

export interface SearchResults {
  profiles: ProfileHit[];
  /** Signed-in user's outgoing follow status, keyed by profile id. */
  states: Record<string, FollowStatus>;
}

/** Raw row as returned by the embedded-count select below. */
interface HitRow {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_private: boolean;
  followers: { count: number }[] | null;
}

const HIT_COLUMNS =
  'id, username, full_name, bio, avatar_url, is_verified, is_private, ' +
  'followers:follows!follows_following_id_fkey(count?filter=status.eq.accepted)';

/**
 * Bounded candidate pools. Enough headroom to absorb block filtering while
 * keeping every read a fixed, small size.
 */
const SEARCH_CANDIDATES = 40;
const SUGGESTION_CANDIDATES = 60;

/** Mirrors the longest string the search box will send. */
const MAX_QUERY_LENGTH = 50;

function toHit(row: HitRow): ProfileHit {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    bio: row.bio,
    avatar_url: row.avatar_url,
    is_verified: row.is_verified,
    is_private: row.is_private,
    follower_count: row.followers?.[0]?.count ?? 0,
    follows_me: false,
  };
}

/**
 * Prepares user input for PostgREST's quoted filter grammar.
 *
 * `"` and `\` could terminate or escape the quoted pattern, so they are
 * removed. LIKE wildcards (`%`, `_`) are deliberately left alone: they can
 * only widen the match, never reach data the caller could not read anyway.
 */
function sanitizeQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH).replace(/["\\]/g, '');
}

/** Exact username, then prefix, then substring, then name, then bio. */
function relevance(hit: ProfileHit, term: string): number {
  const query = term.toLowerCase();
  const username = hit.username.toLowerCase();
  if (username === query) return 0;
  if (username.startsWith(query)) return 1;
  if (username.includes(query)) return 2;
  if (hit.full_name?.toLowerCase().includes(query)) return 3;
  return 4;
}

/** One query: the signed-in user's outgoing follow status for these ids. */
async function fetchOutgoingStates(
  client: SupabaseClient,
  myId: string,
  ids: string[],
): Promise<Record<string, FollowStatus>> {
  if (ids.length === 0) return {};
  const { data, error } = await client
    .from('follows')
    .select('following_id, status')
    .eq('follower_id', myId)
    .in('following_id', ids);
  if (error) throw error;

  const states: Record<string, FollowStatus> = {};
  for (const row of (data ?? []) as { following_id: string; status: FollowStatus }[]) {
    states[row.following_id] = row.status;
  }
  return states;
}

/**
 * Ids of candidates that already follow the signed-in user (accepted only),
 * for the "Follows you" badge. Cosmetic — a failure downgrades to "no badge"
 * instead of failing the whole list.
 */
async function fetchIncomingIds(
  client: SupabaseClient,
  myId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set<string>();
  try {
    const { data, error } = await client
      .from('follows')
      .select('follower_id')
      .eq('following_id', myId)
      .eq('status', 'accepted')
      .in('follower_id', ids);
    if (error) throw error;
    return new Set(((data ?? []) as { follower_id: string }[]).map((row) => row.follower_id));
  } catch (error) {
    console.warn('follows-you badge skipped:', error instanceof Error ? error.message : error);
    return new Set<string>();
  }
}

/**
 * Drops profiles blocked in either direction.
 *
 * `is_blocked(a, b)` is SECURITY DEFINER and symmetric, so one call per
 * candidate covers both directions even though `blocked_users` rows are only
 * readable by the person who created them. Checks run in parallel and fail
 * open: profiles are public by RLS, so a failed courtesy check must never
 * hide a list the database would have allowed.
 */
async function dropBlocked(
  client: SupabaseClient,
  myId: string,
  profiles: ProfileHit[],
): Promise<ProfileHit[]> {
  if (profiles.length === 0) return profiles;

  const flags = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const { data, error } = await client.rpc('is_blocked', { a: myId, b: profile.id });
        return !error && data === true;
      } catch {
        return false;
      }
    }),
  );

  return profiles.filter((_, index) => !flags[index]);
}

/**
 * People search over username, display name and bio.
 *
 * The signed-in user is excluded (their own profile is one click away in the
 * nav) and so are banned accounts. Candidates are ranked for relevance in
 * memory — PostgreSQL cannot order by match quality from PostgREST.
 */
export async function searchProfiles(
  client: SupabaseClient,
  myId: string,
  rawQuery: string,
  limit = 20,
): Promise<SearchResults> {
  const term = sanitizeQuery(rawQuery);
  if (!term) return { profiles: [], states: {} };

  const pattern = `%${term}%`;
  const { data, error } = await client
    .from('profiles')
    .select(HIT_COLUMNS)
    .or(`username.ilike."${pattern}",full_name.ilike."${pattern}",bio.ilike."${pattern}"`)
    .eq('is_banned', false)
    .neq('id', myId)
    .order('username')
    .limit(SEARCH_CANDIDATES);
  if (error) throw error;

  const ranked = ((data ?? []) as unknown as HitRow[])
    .map(toHit)
    .sort(
      (a, b) => relevance(a, term) - relevance(b, term) || a.username.localeCompare(b.username),
    )
    .slice(0, limit);

  const profiles = await dropBlocked(client, myId, ranked);
  const ids = profiles.map((profile) => profile.id);
  const [states, incoming] = await Promise.all([
    fetchOutgoingStates(client, myId, ids),
    fetchIncomingIds(client, myId, ids),
  ]);
  for (const profile of profiles) profile.follows_me = incoming.has(profile.id);

  return { profiles, states };
}

/**
 * "Suggested for you": accounts the signed-in user does not already follow
 * or follow-request, ranked by accepted follower count.
 *
 * Candidates arrive newest-first from the query; the in-memory sort is
 * stable, so equally followed profiles keep that newest-first order.
 */
export async function getSuggestedProfiles(
  client: SupabaseClient,
  myId: string,
  limit = 12,
): Promise<ProfileHit[]> {
  const { data, error } = await client
    .from('profiles')
    .select(HIT_COLUMNS)
    .neq('id', myId)
    .eq('is_banned', false)
    .order('created_at', { ascending: false })
    .limit(SUGGESTION_CANDIDATES);
  if (error) throw error;

  const candidates = ((data ?? []) as unknown as HitRow[]).map(toHit);
  if (candidates.length === 0) return [];

  const ids = candidates.map((profile) => profile.id);
  const [outgoing, incoming] = await Promise.all([
    fetchOutgoingStates(client, myId, ids),
    fetchIncomingIds(client, myId, ids),
  ]);

  const fresh = candidates.filter((profile) => outgoing[profile.id] === undefined);
  for (const profile of fresh) profile.follows_me = incoming.has(profile.id);

  fresh.sort((a, b) => b.follower_count - a.follower_count);

  return dropBlocked(client, myId, fresh.slice(0, limit));
}
