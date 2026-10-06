import { useMemo, useState } from 'react';
import { Button, Spinner } from '@domdom/ui';
import type { ConversationSummary } from '@domdom/types';
import { formatTimeAgo } from '@domdom/utils';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';
import { conversationPreview, conversationTitle } from './conversation';

interface ConversationListProps {
  conversations: ConversationSummary[];
  meId: string;
  selectedId: string | undefined;
  loading: boolean;
  error: string | null;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  /** Re-run the initial load (used by the error state's retry button). */
  onRetry: () => void;
}

/**
 * The inbox half of /app/messages: every conversation I am a member of,
 * newest activity first, with an unread badge per row.
 */
export function ConversationList({
  conversations,
  meId,
  selectedId,
  loading,
  error,
  onSelect,
  onNew,
  onRetry,
}: ConversationListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        conversationTitle(conversation, meId),
        ...conversation.members.map((member) => member.username),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [conversations, meId, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-bold">Messages</h1>
        <Button onClick={onNew} className="px-3 py-1.5">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </Button>
      </div>

      <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search conversations"
          placeholder="Search"
          className="w-full rounded-xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && conversations.length === 0 && (
          <div className="flex justify-center py-10 text-zinc-500">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {error && conversations.length === 0 && (
          <div className="px-4 py-8 text-center text-sm">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="px-6 py-10 text-center text-sm leading-6 text-zinc-500">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">No conversations yet</p>
            <p className="mt-1">
              Start one with the New button — direct messages and groups both live here.
            </p>
          </div>
        )}

        {error && conversations.length > 0 && (
          <p className="px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
            Couldn’t refresh the list: {error}
          </p>
        )}

        {filtered.length === 0 && conversations.length > 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            No conversation matches “{query.trim()}”.
          </p>
        )}

        <ul>
          {filtered.map((conversation) => {
            const title = conversationTitle(conversation, meId);
            const selected = conversation.id === selectedId;
            const peer =
              conversation.type === 'direct'
                ? conversation.members.find((member) => member.id !== meId)
                : undefined;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors dark:border-zinc-900 ${
                    selected
                      ? 'bg-indigo-50 dark:bg-indigo-500/10'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Avatar
                    url={peer?.avatar_url ?? null}
                    username={title}
                    className="h-11 w-11"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{title}</span>
                        <VerifiedBadge verified={peer?.is_verified} size="xs" />
                      </span>
                      {conversation.last_message_at && (
                        <span className="shrink-0 text-xs text-zinc-500">
                          {formatTimeAgo(conversation.last_message_at)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-xs ${
                          conversation.unread_count > 0
                            ? 'font-medium text-zinc-800 dark:text-zinc-200'
                            : 'text-zinc-500'
                        }`}
                      >
                        {conversationPreview(conversation, meId)}
                      </span>
                      {conversation.unread_count > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
                          aria-label={`${conversation.unread_count} unread`}
                        >
                          {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
