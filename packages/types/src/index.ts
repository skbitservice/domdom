/**
 * Shared domain types for DOMDOM.
 * Web and mobile both import from this package so the shape of a row
 * is defined exactly once.
 */

/** Row shape of `profiles` (created from `auth.users` via trigger — see supabase/migrations). */
export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  is_private: boolean;
  is_verified: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

/** Feed post row of `posts`. */
export interface Post {
  id: string;
  user_id: string;
  caption: string | null;
  location: string | null;
  visibility: 'public' | 'followers' | 'private';
  is_draft: boolean;
  is_archived: boolean;
  comments_disabled: boolean;
  hide_like_count: boolean;
  share_count: number;
  created_at: string;
  updated_at: string;
}

/** Media kind shared by stories (and later posts / reels). */
export type MediaKind = 'image' | 'video';

/** Row shape of `stories` — disappears from every feed after `expires_at`. */
export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: MediaKind;
  caption: string | null;
  expires_at: string;
  created_at: string;
}

/** Row shape of `story_views` (one row per viewer per story). */
export interface StoryView {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}

/** Viewer profile + timestamp, as shown on the owner's "views" sheet. */
export interface StoryViewer {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  viewed_at: string;
}

/** Minimal author info joined onto feed items. */
export interface PostAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
}

/** Row shape of `reels` — a short vertical video. */
export interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  audio_name: string | null;
  /** Seconds; null when the browser could not read the duration. */
  duration: number | null;
  views_count: number;
  created_at: string;
  updated_at: string;
}

/** Minimal author info joined onto reels. */
export interface ReelAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
}

/** What a report is about (matches the CHECK constraint in 00007). */
export type ReportTargetType =
  | 'user'
  | 'post'
  | 'comment'
  | 'reel'
  | 'story'
  | 'message';

/** Why something was reported (matches the CHECK constraint in 00007). */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'nudity'
  | 'violence'
  | 'scam'
  | 'fake_account'
  | 'copyright'
  | 'other';

/** Moderation workflow: pending → under_review → resolved | rejected. */
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'rejected';

/** Row shape of `reports`. `target_id` is a soft reference (no FK) by design. */
export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** Roles accepted by `admin_users.role` (migration 00001). Only admin and
 *  moderator carry `is_admin()` powers; support is display-only. */
export type AdminRole = 'admin' | 'moderator' | 'support';

/** Notification kinds accepted by `notifications.type` (migration 00007 + 00018 + 00019). */
export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'follow_request'
  | 'mention'
  | 'message'
  | 'story_reply'
  | 'reel_like'
  | 'share'
  | 'collab_invite'
  | 'collab_accept';

/** Content kinds that support collaborations (matches the CHECK in 00019). */
export type CollaborationContentType = 'post' | 'reel';

/** Collaboration lifecycle (matches the CHECK in 00019). */
export type CollaborationStatus = 'pending' | 'accepted' | 'rejected' | 'removed';

/** Row of `collaborators` — one user's collaboration on one post/reel. */
export interface Collaboration {
  id: string;
  content_type: CollaborationContentType;
  content_id: string;
  owner_id: string;
  collaborator_id: string;
  status: CollaborationStatus;
  invited_at: string;
  accepted_at: string | null;
  removed_at: string | null;
}

/** How a post was shared (matches the CHECK in 00018). */
export type ShareType = 'dm' | 'story' | 'external' | 'copy_link';

/** Row of `saved_posts` — a bookmarked post. */
export interface SavedPost {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

/** Row of `shares` — a share event. */
export interface Share {
  id: string;
  post_id: string;
  user_id: string;
  share_type: ShareType;
  recipient_id: string | null;
  created_at: string;
}

/** Row of `comment_likes` — a like on a comment. */
export interface CommentLike {
  id: string;
  user_id: string;
  comment_id: string;
  created_at: string;
}

/** Row of `post_hashtags` — a hashtag on a post. */
export interface PostHashtag {
  id: string;
  post_id: string;
  hashtag: string;
  created_at: string;
}

/** Row of `post_mentions` — a mention in a post or comment. */
export interface PostMention {
  id: string;
  post_id: string;
  comment_id: string | null;
  mentioned_user_id: string;
  created_at: string;
}

/** Row of `story_post_links` — a post shared to a story. */
export interface StoryPostLink {
  id: string;
  story_id: string;
  post_id: string;
  created_at: string;
}

/** Row of `spam_flags` — automated spam detection result. */
export interface SpamFlag {
  id: string;
  target_type: 'post' | 'comment' | 'message';
  target_id: string;
  user_id: string;
  flag_type: 'spam' | 'suspicious_links' | 'repeated_content' | 'bot_behavior';
  score: number;
  created_at: string;
}

/** Actor profile joined onto notification rows (null actor = system-generated). */
export interface NotificationActor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

/** Row of `notifications` joined with its actor — the inbox unit. */
export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  reel_id: string | null;
  is_read: boolean;
  created_at: string;
  actor: NotificationActor | null;
}

/** How a conversation is shaped (matches the CHECK in 00006). */
export type ConversationType = 'direct' | 'group';

/** Row of `conversations`. `name` is set for groups, null for direct chats. */
export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  created_by: string | null;
  created_at: string;
}

/** The people in a conversation, as far as the chat UI cares. */
export interface ChatParticipant {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

/** A participant plus their membership row — used for read receipts. */
export interface ConversationMember extends ChatParticipant {
  /** That member's read marker; drives "Seen" in direct conversations. */
  last_read_at: string | null;
}

/** One row of `list_my_conversations()` — an entry in the inbox. */
export interface ConversationSummary extends Conversation {
  /** My own read marker; null until I have opened the thread once. */
  last_read_at: string | null;
  last_message_at: string | null;
  last_message: string | null;
  last_message_sender_id: string | null;
  /** Messages from other people that arrived after `last_read_at`. */
  unread_count: number;
  /** Everyone in the thread, myself included. */
  members: ConversationMember[];
}

/** Message content kinds (matches the CHECK in 00006). */
export type MessageType = 'text' | 'image' | 'video' | 'file' | 'voice';

/** Row of `messages`. */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  created_at: string;
  edited_at: string | null;
  /** Soft delete: the row stays as a tombstone with its content removed. */
  deleted_at: string | null;
}

/** Environment configuration exposed to clients (public keys only). */
export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

// ===========================================================================
// LIVE types
// ===========================================================================

/** Stream lifecycle status. */
export type LiveStreamStatus = 'scheduled' | 'live' | 'ended';

/** Row shape of `live_streams`. */
export interface LiveStream {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  stream_status: LiveStreamStatus;
  stream_key: string;
  started_at: string | null;
  ended_at: string | null;
  viewer_count: number;
  peak_viewers: number;
  total_views: number;
  recording_url: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Live stream joined with host profile — what the viewer screen needs. */
export interface LiveStreamWithHost extends LiveStream {
  host: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

/** Row shape of `live_viewers`. */
export interface LiveViewer {
  id: string;
  live_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
}

/** Row shape of `live_comments`. */
export interface LiveComment {
  id: string;
  live_id: string;
  user_id: string;
  message: string;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
}

/** Live comment joined with user profile — what the chat UI renders. */
export interface LiveCommentWithUser extends LiveComment {
  user: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

/** Reaction types for live streams. */
export type LiveReactionType = 'heart' | 'laugh' | 'clap' | 'fire' | 'cry' | 'surprise';

/** Row shape of `live_reactions`. */
export interface LiveReaction {
  id: string;
  live_id: string;
  user_id: string;
  reaction_type: LiveReactionType;
  created_at: string;
}

/** Guest invitation status. */
export type LiveGuestStatus = 'invited' | 'accepted' | 'declined' | 'removed' | 'left';

/** Row shape of `live_guests`. */
export interface LiveGuest {
  id: string;
  live_id: string;
  host_id: string;
  guest_id: string;
  status: LiveGuestStatus;
  joined_at: string | null;
  created_at: string;
}

/** Live guest joined with guest profile. */
export interface LiveGuestWithProfile extends LiveGuest {
  guest: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

/** Row shape of `live_reports`. */
export interface LiveReport {
  id: string;
  live_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  created_at: string;
}

/** Row shape of `live_blocked_viewers`. */
export interface LiveBlockedViewer {
  id: string;
  live_id: string;
  host_id: string;
  viewer_id: string;
  created_at: string;
}

/** Live stream analytics summary (from `live_stream_analytics` view). */
export interface LiveStreamAnalytics {
  id: string;
  host_id: string;
  title: string;
  stream_status: LiveStreamStatus;
  started_at: string | null;
  ended_at: string | null;
  viewer_count: number;
  peak_viewers: number;
  total_views: number;
  created_at: string;
  duration_seconds: number;
  comment_count: number;
  reaction_count: number;
  unique_viewers: number;
}

/** Events pushed by realtime while a live stream is open. */
export interface LiveStreamEvents {
  onCommentInsert?: (comment: LiveCommentWithUser) => void;
  onCommentDelete?: (commentId: string) => void;
  onReactionInsert?: (reaction: LiveReaction) => void;
  onReactionDelete?: (reactionId: string) => void;
  onViewerCountChange?: (count: number) => void;
  onStreamStatusChange?: (status: LiveStreamStatus) => void;
  onGuestUpdate?: (guest: LiveGuestWithProfile) => void;
  onStatus?: (status: string) => void;
}

/** Live stream channel for sending reactions and typing. */
export interface LiveStreamChannel {
  sendReaction: (reactionType: LiveReactionType) => void;
  sendComment: (message: string) => void;
  close: () => void;
}
