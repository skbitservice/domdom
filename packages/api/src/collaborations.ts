import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collaboration, CollaborationContentType, CollaborationStatus } from '@domdom/types';
import { getCurrentUserId } from './social';

/**
 * Collaborations API — Collab Posts & Collab Reels (migration 00019).
 *
 * A collaboration never copies content: it adds a `collaborators` row that
 * points at the SAME post/reel id, so likes, comments, shares and saves stay
 * attached to the original content and show up on both profiles.
 *
 * The database is the authority for every rule (same philosophy as follows):
 *   * only the content creator can invite (INSERT trigger + RLS),
 *   * blocked or banned accounts can never be invited (INSERT trigger),
 *   * duplicate active invitations are refused (partial unique index),
 *   * the collaborator cap comes from `app_settings.max_collaborators`
 *     (default 5, admin-editable — no deploy needed),
 *   * only the invitee accepts or rejects (UPDATE trigger),
 *   * only the owner removes a collaborator; the collaborator may leave,
 *   * deleting the original post/reel removes it from both profiles
 *     (AFTER DELETE cleanup triggers).
 *
 * Content visibility is NOT re-implemented here: a collab post/reel follows
 * the same RLS visibility rules as any other content (private accounts,
 * follower-only posts, blocks), so a pending invite never makes content
 * visible on the invitee's profile — only an accepted one does, through the
 * profile-grid queries in `posts.ts` / `reels.ts`.
 */

export type { Collaboration, CollaborationContentType, CollaborationStatus };

/** Profile shape embedded in collaboration lists. */
export interface CollaborationProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface CollaborationWithProfiles extends Collaboration {
  owner: CollaborationProfile | null;
  collaborator: CollaborationProfile | null;
}

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, is_verified';

const COLLAB_SELECT = [
  'id', 'content_type', 'content_id', 'owner_id', 'collaborator_id',
  'status', 'invited_at', 'accepted_at', 'removed_at',
  `owner:profiles!collaborators_owner_id_fkey(${PROFILE_COLUMNS})`,
  `collaborator:profiles!collaborators_collaborator_id_fkey(${PROFILE_COLUMNS})`,
].join(', ');

/** Best-effort notification write — never breaks the main action. */
async function notify(
  client: SupabaseClient,
  row: {
    recipient_id: string;
    actor_id: string;
    type: 'collab_invite' | 'collab_accept';
    post_id?: string | null;
    reel_id?: string | null;
  },
): Promise<void> {
  const { error } = await client.from('notifications').insert({
    recipient_id: row.recipient_id,
    actor_id: row.actor_id,
    type: row.type,
    post_id: row.post_id ?? null,
    reel_id: row.reel_id ?? null,
  });
  if (error) console.warn('notification insert skipped:', error.message);
}

function contentTargets(collab: Collaboration): { post_id: string | null; reel_id: string | null } {
  return {
    post_id: collab.content_type === 'post' ? collab.content_id : null,
    reel_id: collab.content_type === 'reel' ? collab.content_id : null,
  };
}

/** Map database errors to readable messages (triggers raise P0001). */
function mapError(error: { code?: string; message?: string }, fallback: string): Error {
  if (error.code === '23505') {
    return new Error('This user is already invited to this content.');
  }
  if (error.code === '42501') {
    return new Error("You can't invite collaborators to this content.");
  }
  return new Error(error.message || fallback);
}

/**
 * Invite a user to collaborate on one of your posts or reels.
 * The invitee gets a `collab_invite` notification (also delivered over the
 * realtime channel — `notifications` is in the supabase_realtime publication).
 */
export async function inviteCollaborator(
  client: SupabaseClient,
  input: { contentType: CollaborationContentType; contentId: string; collaboratorId: string },
): Promise<CollaborationWithProfiles> {
  const myId = await getCurrentUserId(client);
  if (input.collaboratorId === myId) {
    throw new Error('You cannot collaborate with yourself.');
  }

  const { data, error } = await client
    .from('collaborators')
    .insert({
      content_type: input.contentType,
      content_id: input.contentId,
      owner_id: myId,
      collaborator_id: input.collaboratorId,
    })
    .select(COLLAB_SELECT)
    .single();
  if (error) throw mapError(error, 'The invitation could not be created.');

  const collab = data as unknown as CollaborationWithProfiles;
  await notify(client, {
    recipient_id: collab.collaborator_id,
    actor_id: collab.owner_id,
    type: 'collab_invite',
    ...contentTargets(collab),
  });
  return collab;
}

/** Invitations waiting for my decision (newest first). */
export async function listPendingCollaborations(
  client: SupabaseClient,
): Promise<CollaborationWithProfiles[]> {
  const myId = await getCurrentUserId(client);
  const { data, error } = await client
    .from('collaborators')
    .select(COLLAB_SELECT)
    .eq('collaborator_id', myId)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as CollaborationWithProfiles[];
}

/** Every collaboration on one post/reel (public data, newest first). */
export async function listCollaborators(
  client: SupabaseClient,
  contentType: CollaborationContentType,
  contentId: string,
): Promise<CollaborationWithProfiles[]> {
  const { data, error } = await client
    .from('collaborators')
    .select(COLLAB_SELECT)
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .order('invited_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as CollaborationWithProfiles[];
}

/** One collaboration by id (must involve the caller — RLS enforced). */
export async function getCollaboration(
  client: SupabaseClient,
  id: string,
): Promise<CollaborationWithProfiles | null> {
  const { data, error } = await client
    .from('collaborators')
    .select(COLLAB_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CollaborationWithProfiles | null) ?? null;
}

/**
 * Accept an invitation addressed to me. The content now appears on my profile
 * (through the accepted-collaborator queries) and the owner gets a
 * `collab_accept` notification.
 */
export async function acceptCollaboration(
  client: SupabaseClient,
  id: string,
): Promise<CollaborationWithProfiles> {
  const { data, error } = await client
    .from('collaborators')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('status', 'pending')
    .select(COLLAB_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This invitation no longer exists.');

  const collab = data as unknown as CollaborationWithProfiles;
  await notify(client, {
    recipient_id: collab.owner_id,
    actor_id: collab.collaborator_id,
    type: 'collab_accept',
    ...contentTargets(collab),
  });
  return collab;
}

/** Reject an invitation addressed to me (the collaboration is cancelled). */
export async function rejectCollaboration(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('collaborators')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

/** The content owner removes an accepted collaborator. */
export async function removeCollaboration(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('collaborators')
    .update({ status: 'removed' })
    .eq('id', id)
    .eq('status', 'accepted');
  if (error) throw error;
}

/** A collaborator leaves a collaboration they accepted. */
export async function leaveCollaboration(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('collaborators')
    .update({ status: 'removed' })
    .eq('id', id)
    .eq('status', 'accepted');
  if (error) throw error;
}

/**
 * Content ids (posts or reels) where the user is an ACCEPTED collaborator.
 * Used by the profile grids: pending invitations never surface here, so
 * invited content stays off the profile until the invite is accepted.
 */
export async function getCollabContentIds(
  client: SupabaseClient,
  contentType: CollaborationContentType,
  userId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('collaborators')
    .select('content_id')
    .eq('content_type', contentType)
    .eq('collaborator_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data ?? []).map((row) => row.content_id);
}
