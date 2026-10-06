import type { ConversationMember, ConversationSummary } from '@domdom/types';

/**
 * Naming helpers shared by the inbox list and the thread header, so a
 * conversation can never be called two different things on one screen.
 */

/** Everyone but me, in membership order. */
export function otherMembers(
  conversation: ConversationSummary,
  meId: string,
): ConversationMember[] {
  return conversation.members.filter((member) => member.id !== meId);
}

/** The other side of a direct conversation (null when there is none). */
export function directPeer(
  conversation: ConversationSummary,
  meId: string,
): ConversationMember | null {
  if (conversation.type !== 'direct') return null;
  return otherMembers(conversation, meId)[0] ?? null;
}

/** Display name: the peer's name for DMs, the group title otherwise. */
export function conversationTitle(
  conversation: ConversationSummary,
  meId: string,
): string {
  if (conversation.type === 'group') return conversation.name ?? 'Group chat';
  const peer = directPeer(conversation, meId);
  if (!peer) return 'Conversation';
  return peer.full_name?.trim() || peer.username;
}

/** Small line under the title: "@username" for DMs, the headcount for groups. */
export function conversationSubtitle(
  conversation: ConversationSummary,
  meId: string,
): string | null {
  if (conversation.type === 'group') {
    const count = conversation.members.length;
    return `${count} ${count === 1 ? 'person' : 'people'}`;
  }
  const peer = directPeer(conversation, meId);
  return peer ? `@${peer.username}` : null;
}

/** One-line preview for the inbox row, honest about deleted content. */
export function conversationPreview(
  conversation: ConversationSummary,
  meId: string,
): string {
  if (!conversation.last_message_at) return 'No messages yet';
  if (conversation.last_message === null) return 'Message deleted';

  const body =
    conversation.last_message.length > 72
      ? `${conversation.last_message.slice(0, 72)}…`
      : conversation.last_message;

  if (conversation.last_message_sender_id === meId) return `You: ${body}`;
  if (conversation.type === 'group') {
    const sender = conversation.members.find(
      (member) => member.id === conversation.last_message_sender_id,
    );
    if (sender) return `${sender.username}: ${body}`;
  }
  return body;
}
