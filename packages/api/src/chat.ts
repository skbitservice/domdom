import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatParticipant,
  ConversationMember,
  ConversationSummary,
  Message,
} from '@domdom/types';
import { getCurrentUserId } from './social';

/**
 * Chat API (Step 7).
 *
 * Division of labour with the database, so the client never invents state:
 *
 * - Inbox assembly (last message + unread count per conversation) happens in
 *   `list_my_conversations()` — one round trip instead of an N+1 loop.
 * - Creating conversations happens in `start_conversation_with` /
 *   `create_group_chat` (migration 00012), which are race-safe and re-check
 *   the block list the client cannot be trusted with.
 * - Delivery is `postgres_changes` on `messages`: Realtime checks the table's
 *   SELECT policy per subscriber, so a channel filtered on conversation_id
 *   can only deliver rows the subscriber may already read.
 * - Typing events are broadcasts on a private channel, authorized against
 *   `realtime.messages` policies (also migration 00012).
 *
 * Nothing here filters by user id to "be safe" — RLS is the authority.
 */

/** Profile columns the chat UI needs, in one shared shape. */
const PARTICIPANT = 'id, username, full_name, avatar_url, is_verified';

/** Row returned by `list_my_conversations()` before it meets its members. */
interface ConversationRow {
  conversation_id: string;
  conversation_type: ConversationSummary['type'];
  conversation_name: string | null;
  created_by: string | null;
  created_at: string;
  last_read_at: string | null;
  last_message_at: string | null;
  last_message: string | null;
  last_message_sender_id: string | null;
  unread_count: number | string;
}

interface MemberRow {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  profile: ChatParticipant | null;
}

function toSummary(
  row: ConversationRow,
  members: ConversationMember[],
): ConversationSummary {
  return {
    id: row.conversation_id,
    type: row.conversation_type,
    name: row.conversation_name,
    created_by: row.created_by,
    created_at: row.created_at,
    last_read_at: row.last_read_at,
    last_message_at: row.last_message_at,
    last_message: row.last_message,
    last_message_sender_id: row.last_message_sender_id,
    // count(*) comes back as bigint — Normalise so the UI never formats a string.
    unread_count: Number(row.unread_count ?? 0),
    members,
  };
}

/** Participants for every conversation passed in, grouped by conversation. */
async function loadMembers(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, ConversationMember[]>> {
  const grouped = new Map<string, ConversationMember[]>();
  if (ids.length === 0) return grouped;

  const { data, error } = await client
    .from('conversation_members')
    .select(
      `conversation_id, user_id, last_read_at, profile:profiles!conversation_members_user_id_fkey(${PARTICIPANT})`,
    )
    .in('conversation_id', ids);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as MemberRow[]) {
    if (!row.profile) continue;
    const list = grouped.get(row.conversation_id) ?? [];
    list.push({ ...row.profile, last_read_at: row.last_read_at });
    grouped.set(row.conversation_id, list);
  }
  return grouped;
}

/** My whole inbox, newest activity first. */
export async function listConversations(client: SupabaseClient): Promise<ConversationSummary[]> {
  const { data, error } = await client.rpc('list_my_conversations', { p_conversation_id: null });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ConversationRow[];
  const members = await loadMembers(
    client,
    rows.map((row) => row.conversation_id),
  );
  return rows.map((row) => toSummary(row, members.get(row.conversation_id) ?? []));
}

/**
 * One conversation — used when a thread is opened by URL or right after
 * creating one. Returns `null` when I am not a member: the RPC reads through
 * RLS, so a foreign conversation id simply comes back empty.
 */
export async function getConversation(
  client: SupabaseClient,
  conversationId: string,
): Promise<ConversationSummary | null> {
  const { data, error } = await client.rpc('list_my_conversations', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ConversationRow[];
  const row = rows[0];
  if (!row) return null;

  const members = await loadMembers(client, [conversationId]);
  return toSummary(row, members.get(conversationId) ?? []);
}

/**
 * Message history, **newest first** (callers reverse it for display).
 * `before` pages backwards in time without ever skipping a row.
 */
export async function getMessages(
  client: SupabaseClient,
  conversationId: string,
  options: { before?: string; limit?: number } = {},
): Promise<Message[]> {
  let query = client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.before) query = query.lt('created_at', options.before);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Message[];
}

/** Send a text message. A block between me and any member is refused (42501). */
export async function sendMessage(
  client: SupabaseClient,
  conversationId: string,
  text: string,
): Promise<Message> {
  const myId = await getCurrentUserId(client);
  const content = text.trim();
  if (!content) throw new Error('Type a message first.');
  if (content.length > 4000) throw new Error('Messages can be at most 4000 characters.');

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: myId,
      message_type: 'text',
      content,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as Message;
}

/**
 * Delete a message: an UPDATE that stamps `deleted_at` and empties the
 * content (the constraint added in 00012 allows content to be null only for
 * deleted rows). Every member keeps seeing the row as a tombstone, which is
 * what lets realtime tell them the bubble is gone instead of leaving a stale
 * message on their screen until a refresh.
 */
export async function deleteMessage(client: SupabaseClient, messageId: string): Promise<void> {
  const { data, error } = await client
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      content: null,
      media_url: null,
    })
    .eq('id', messageId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That message can no longer be deleted.');
}

/** Move my read marker to "now" for one conversation (drives read receipts). */
export async function markConversationRead(
  client: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const myId = await getCurrentUserId(client);
  const { error } = await client
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', myId);
  if (error) throw error;
}

/** Open (or reuse) a direct conversation and return its id. */
export async function startDirectConversation(
  client: SupabaseClient,
  targetId: string,
): Promise<string> {
  const { data, error } = await client.rpc('start_conversation_with', { p_target: targetId });
  if (error) throw error;
  return data as string;
}

/** Create a group conversation and return its id. */
export async function createGroupConversation(
  client: SupabaseClient,
  name: string,
  memberIds: string[],
): Promise<string> {
  const { data, error } = await client.rpc('create_group_chat', {
    p_name: name.trim(),
    p_member_ids: memberIds,
  });
  if (error) throw error;
  return data as string;
}

/** Unread messages across every conversation — the nav badge. */
export async function getUnreadMessageCount(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('unread_message_count');
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * People to start a chat with: a username search over the publicly readable
 * profiles table. Empty term returns nothing — the caller shows its own
 * "suggestions" (followers/following) instead of pretending to search.
 */
export async function searchChatProfiles(
  client: SupabaseClient,
  term: string,
  limit = 20,
): Promise<ChatParticipant[]> {
  const clean = term.trim().toLowerCase();
  if (!clean) return [];

  const { data, error } = await client
    .from('profiles')
    .select(PARTICIPANT)
    .ilike('username', `%${clean}%`)
    .order('username', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ChatParticipant[];
}

/** Events pushed by realtime while a thread is open. All optional. */
export interface ConversationEvents {
  onMessageInsert?: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  /** The row still exists but its content is gone — remove the bubble. */
  onMessageDelete?: (messageId: string) => void;
  /** Another member moved their read marker (a read receipt). */
  onReadReceipt?: (userId: string, lastReadAt: string | null) => void;
  onTyping?: (userId: string) => void;
  onStatus?: (status: string) => void;
}

export interface ConversationChannel {
  /** Broadcast a typing event to the other members. */
  sendTyping: (userId: string) => void;
  /** Detach from realtime (call from effect cleanup). */
  close: () => void;
}

/**
 * Live updates for one open thread: message rows via postgres_changes,
 * read receipts via conversation_members, typing via broadcast.
 *
 * The topic keeps `conversation:<uuid>` as its second segment so the
 * `realtime.messages` policies (00012) can authorize it; the random suffix
 * only stops two mounted components from fighting over one Phoenix topic.
 *
 * When realtime is unreachable the callback reports the status and the page
 * keeps working off its manual refresh — it degrades, it never lies.
 */
export function subscribeToConversation(
  client: SupabaseClient,
  conversationId: string,
  events: ConversationEvents,
): ConversationChannel {
  const topic = `conversation:${conversationId}:${Math.random().toString(36).slice(2)}`;
  const channel = client.channel(topic, { config: { private: true } });
  const filter = `conversation_id=eq.${conversationId}`;

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
      (payload) => events.onMessageInsert?.(payload.new as unknown as Message),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter },
      (payload) => events.onMessageUpdate?.(payload.new as unknown as Message),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter },
      // Only the id survives a delete (replica identity), which is all we need.
      (payload) => events.onMessageDelete?.((payload.old as { id?: string }).id ?? ''),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter },
      (payload) => {
        const row = payload.new as unknown as {
          user_id: string;
          last_read_at: string | null;
        };
        events.onReadReceipt?.(row.user_id, row.last_read_at);
      },
    )
    .on('broadcast', { event: 'typing' }, (payload) => {
      const body = payload.payload as { user_id?: string } | null;
      if (body?.user_id) events.onTyping?.(body.user_id);
    })
    .subscribe((status) => events.onStatus?.(status));

  return {
    sendTyping: (userId: string) => {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } });
    },
    close: () => {
      void client.removeChannel(channel);
    },
  };
}
