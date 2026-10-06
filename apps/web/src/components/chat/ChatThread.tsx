import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner } from '@domdom/ui';
import {
  deleteMessage,
  getConversation,
  getMessages,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  type ConversationChannel,
} from '@domdom/api';
import type { ConversationSummary, Message } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';
import { ReportModal } from '../ReportModal';
import { conversationSubtitle, conversationTitle, directPeer } from './conversation';
import { formatChatClock, formatChatDayLabel } from './format';

interface ChatThreadProps {
  conversationId: string;
  meId: string;
  /** Mobile back button — leaves the thread for the inbox. */
  onBack: () => void;
  /** Ask the inbox to refresh (a message arrived, was deleted, was read). */
  onActivity: () => void;
}

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; conversation: ConversationSummary };

const HISTORY_PAGE = 50;
/** Stop typing broadcasts after this long without a keystroke. */
const TYPING_TTL = 2500;
const TYPING_THROTTLE = 1500;

type RenderRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; message: Message; showName: boolean };

/**
 * One open conversation: history, live delivery, typing, read receipts and
 * the composer.
 *
 * Live rows come from `subscribeToConversation` (postgres_changes filtered by
 * conversation_id — Realtime re-checks the messages SELECT policy for me, so
 * a forged id would deliver nothing). Every path that changes the inbox also
 * calls `onActivity` so the list next to it can catch up.
 */
export function ChatThread({ conversationId, meId, onBack, onActivity }: ChatThreadProps) {
  const [state, setState] = useState<ThreadState>({ status: 'loading' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, string | null>>({});
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [realtimeStatus, setRealtimeStatus] = useState('');
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportedMessages, setReportedMessages] = useState<Set<string>>(new Set());

  const listRef = useRef<HTMLDivElement | null>(null);
  /** Scroll anchor to preserve when older messages are prepended. */
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const stickToBottomRef = useRef(true);
  const channelRef = useRef<ConversationChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // --- history -------------------------------------------------------------
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    setState({ status: 'loading' });
    setMessages([]);
    setHasMore(false);
    setOlderError(null);
    setError(null);
    setTyping({});

    Promise.all([
      getConversation(supabase, conversationId),
      getMessages(supabase, conversationId, { limit: HISTORY_PAGE }),
    ])
      .then(async ([conversation, history]) => {
        if (cancelled) return;
        if (!conversation) {
          setState({ status: 'error', message: 'This conversation is not available.' });
          return;
        }

        setState({ status: 'ready', conversation });
        setMessages(history.slice().reverse());
        setHasMore(history.length === HISTORY_PAGE);
        setReads(
          Object.fromEntries(conversation.members.map((member) => [member.id, member.last_read_at])),
        );
        stickToBottomRef.current = true;

        // Opening a thread reads it; failures only delay a read receipt.
        await markConversationRead(supabase!, conversationId).catch(() => undefined);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setState({ status: 'error', message: getErrorMessage(loadError) });
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // --- realtime ------------------------------------------------------------
  useEffect(() => {
    if (!supabase || state.status !== 'ready') return;

    const channel = subscribeToConversation(supabase, conversationId, {
      onMessageInsert: (message) => {
        setMessages((prev) =>
          prev.some((row) => row.id === message.id) ? prev : [...prev, message],
        );
        stickToBottomRef.current = true;

        if (message.sender_id !== meId) {
          setTyping((prev) => {
            if (!(message.sender_id in prev)) return prev;
            const next = { ...prev };
            delete next[message.sender_id];
            return next;
          });
          // The message landed in an open thread: read it, so the sender
          // sees "Seen" without me doing anything else.
          void markConversationRead(supabase!, conversationId).catch(() => undefined);
        }
        onActivity();
      },
      onMessageUpdate: (message) => {
        setMessages((prev) => prev.map((row) => (row.id === message.id ? message : row)));
        onActivity();
      },
      onMessageDelete: (messageId) => {
        setMessages((prev) => prev.filter((row) => row.id !== messageId));
        onActivity();
      },
      onReadReceipt: (userId, lastReadAt) => {
        if (userId === meId) return;
        setReads((prev) =>
          prev[userId] === lastReadAt ? prev : { ...prev, [userId]: lastReadAt },
        );
      },
      onTyping: (userId) => {
        if (userId === meId) return;
        setTyping((prev) => ({ ...prev, [userId]: Date.now() + TYPING_TTL }));
      },
      onStatus: setRealtimeStatus,
    });
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [supabase, conversationId, state.status, meId, onActivity]);

  // Expire typing indicators even when nothing else is happening.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let expired = false;
        const next: Record<string, number> = {};
        for (const [userId, until] of Object.entries(prev)) {
          if (until > now) next[userId] = until;
          else expired = true;
        }
        return expired ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // --- scrolling -----------------------------------------------------------
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;

    if (anchorRef.current) {
      const { height, top } = anchorRef.current;
      anchorRef.current = null;
      element.scrollTop = element.scrollHeight - height + top;
      return;
    }
    if (stickToBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, state.status]);

  const handleScroll = () => {
    const element = listRef.current;
    if (!element) return;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 140;
  };

  const loadOlder = async () => {
    if (!supabase || olderLoading) return;
    const oldest = messages[0];
    if (!oldest) return;

    const element = listRef.current;
    if (element) anchorRef.current = { height: element.scrollHeight, top: element.scrollTop };
    stickToBottomRef.current = false;
    setOlderLoading(true);
    setOlderError(null);

    try {
      const older = await getMessages(supabase, conversationId, {
        before: oldest.created_at,
        limit: HISTORY_PAGE,
      });
      if (older.length > 0) setMessages((prev) => [...older.slice().reverse(), ...prev]);
      if (older.length < HISTORY_PAGE) setHasMore(false);
    } catch (loadError: unknown) {
      anchorRef.current = null;
      stickToBottomRef.current = true;
      setOlderError(getErrorMessage(loadError));
    } finally {
      setOlderLoading(false);
    }
  };

  // --- sending -------------------------------------------------------------
  const handleDraftChange = (value: string) => {
    setDraft(value);
    const element = composerRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
    }

    const now = Date.now();
    if (value.trim() && now - lastTypingSentRef.current >= TYPING_THROTTLE) {
      lastTypingSentRef.current = now;
      channelRef.current?.sendTyping(meId);
    }
  };

  const handleSend = async () => {
    if (!supabase || sending) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(supabase, conversationId, text);
      setMessages((prev) =>
        prev.some((row) => row.id === message.id) ? prev : [...prev, message],
      );
      setDraft('');
      stickToBottomRef.current = true;
      if (composerRef.current) composerRef.current.style.height = 'auto';
      onActivity();
      await markConversationRead(supabase, conversationId).catch(() => undefined);
    } catch (sendError: unknown) {
      setError(getErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setError(null);

    try {
      await deleteMessage(supabase, id);
      // Optimistic: the realtime UPDATE confirms with the same content.
      setMessages((prev) =>
        prev.map((row) =>
          row.id === id
            ? { ...row, deleted_at: new Date().toISOString(), content: null, media_url: null }
            : row,
        ),
      );
      onActivity();
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
    }
  };

  // --- derived -------------------------------------------------------------
  const conversation = state.status === 'ready' ? state.conversation : null;

  const seen = useMemo(() => {
    if (!conversation || conversation.type !== 'direct') return null;
    const peer = directPeer(conversation, meId);
    if (!peer) return null;

    let lastMine: Message | null = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const row = messages[index];
      if (row && row.sender_id === meId && !row.deleted_at) {
        lastMine = row;
        break;
      }
    }
    if (!lastMine) return null;

    const theirRead = reads[peer.id] ?? peer.last_read_at;
    if (!theirRead) return null;
    return new Date(theirRead).getTime() >= new Date(lastMine.created_at).getTime();
  }, [conversation, messages, reads, meId]);

  const lastMineId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((row) => row.sender_id === meId && !row.deleted_at)?.id ?? null,
    [messages, meId],
  );

  const typingLine = useMemo(() => {
    if (!conversation) return null;
    const ids = Object.keys(typing);
    if (ids.length === 0) return null;
    const names = ids
      .map((id) => conversation.members.find((member) => member.id === id)?.username)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return null;
    const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ');
    return `${list} ${names.length === 1 ? 'is' : 'are'} typing…`;
  }, [typing, conversation]);

  const rows: RenderRow[] = useMemo(() => {
    if (!conversation) return [];
    const built: RenderRow[] = [];
    let previousDay = '';
    let previous: Message | null = null;

    for (const message of messages) {
      const day = formatChatDayLabel(message.created_at);
      if (day !== previousDay) {
        built.push({ kind: 'day', key: `day-${message.id}`, label: day });
        previousDay = day;
        previous = null;
      }
      built.push({
        kind: 'message',
        message,
        showName:
          message.sender_id !== meId &&
          conversation.type === 'group' &&
          previous?.sender_id !== message.sender_id,
      });
      previous = message;
    }
    return built;
  }, [messages, conversation, meId]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
        <Button variant="secondary" onClick={onBack}>
          Back to conversations
        </Button>
      </div>
    );
  }

  if (!conversation) return null;

  const title = conversationTitle(conversation, meId);
  const subtitle = conversationSubtitle(conversation, meId);
  const offline = realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT';
  const peer = conversation.type === 'direct'
    ? conversation.members.find((member) => member.id !== meId)
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <Avatar
          url={peer?.avatar_url ?? null}
          username={title}
          className="h-9 w-9"
        />

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{title}</span>
            <VerifiedBadge verified={peer?.is_verified} size="sm" />
          </p>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </header>

      {offline && (
        <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Live updates are off right now — reopen the conversation to catch up.
        </p>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {hasMore && (
          <div className="mb-3 text-center">
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => void loadOlder()}
              loading={olderLoading}
            >
              Load earlier messages
            </Button>
            {olderError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{olderError}</p>}
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-500">
            No messages yet — say hi 👋
          </p>
        )}

        {rows.map((row) => {
          if (row.kind === 'day') {
            return (
              <div key={row.key} className="my-4 flex items-center gap-3 text-xs text-zinc-500">
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                {row.label}
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>
            );
          }

          const { message, showName } = row;
          const mine = message.sender_id === meId;
          const deleted = Boolean(message.deleted_at);
          const sender = conversation.members.find((member) => member.id === message.sender_id);
          const confirming = pendingDeleteId === message.id;

          return (
            <div key={message.id} className={`group mt-2 flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {showName && (
                <Avatar url={sender?.avatar_url} username={sender?.username ?? '?'} className="h-7 w-7 self-end" />
              )}

              <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {showName && (
                  <span className="mb-0.5 flex items-center gap-1 px-1 text-xs text-zinc-500">
                    <span className="truncate">{sender?.username}</span>
                    <VerifiedBadge verified={sender?.is_verified} size="xs" />
                  </span>
                )}

                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-5 ${
                    deleted
                      ? 'bg-zinc-50 text-zinc-500 italic dark:bg-zinc-900'
                      : mine
                        ? 'rounded-br-md bg-indigo-600 text-white'
                        : 'rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  {deleted ? (
                    <span>Message deleted</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{message.content}</span>
                  )}
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>{formatChatClock(message.created_at)}</span>

                  {mine && message.id === lastMineId && seen && <span>Seen</span>}

                  {confirming ? (
                    <span className="flex items-center gap-2">
                      <span>Delete for everyone?</span>
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        className="font-semibold text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="text-zinc-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <>
                      {mine && !deleted && (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(message.id)}
                          aria-label="Delete message"
                          className="rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                          </svg>
                        </button>
                      )}
                      {!mine && !deleted && (
                        <button
                          type="button"
                          onClick={() => setReportMessageId(message.id)}
                          aria-label="Report message"
                          disabled={reportedMessages.has(message.id)}
                          className="rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M4 21V4m0 1h12l-2 4 2 4H4" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800">
        {typingLine && (
          <p className="px-4 pt-1.5 text-xs text-zinc-500" aria-live="polite">
            {typingLine}
          </p>
        )}
        {error && (
          <p className="px-4 pt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex items-end gap-2 p-3"
        >
          <textarea
            ref={composerRef}
            rows={1}
            value={draft}
            maxLength={4000}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-36 min-h-[2.75rem] flex-1 resize-none rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <Button type="submit" disabled={!draft.trim() || sending} loading={sending}>
            Send
          </Button>
        </form>
      </div>

      {reportMessageId && (
        <ReportModal
          open
          target={{ type: 'message', id: reportMessageId, label: 'message' }}
          onClose={() => setReportMessageId(null)}
          onFiled={() =>
            setReportedMessages((prev) => new Set(prev).add(reportMessageId))
          }
        />
      )}
    </div>
  );
}
