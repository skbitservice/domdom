import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@domdom/ui';
import { listConversations } from '@domdom/api';
import type { ConversationSummary } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { ChatThread } from '../../components/chat/ChatThread';
import { ConversationList } from '../../components/chat/ConversationList';
import { NewChatModal } from '../../components/chat/NewChatModal';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; conversations: ConversationSummary[] };

/**
 * /app/messages — inbox on the left, thread on the right.
 *
 * The selected thread comes from the URL (`/app/messages/:conversationId`),
 * so a chat can be linked, bookmarked and opened from a notification.
 * On mobile only one pane is shown at a time; the back button drops the
 * conversation id.
 */
export function Messages() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [newChatOpen, setNewChatOpen] = useState(false);
  const reloadTimerRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);

  const meId = user?.id ?? '';

  const load = useCallback(async (silent: boolean) => {
    if (!supabase) return;
    if (!silent) {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    }

    try {
      const conversations = await listConversations(supabase);
      setState({ status: 'ready', conversations });
    } catch (loadError: unknown) {
      // Never replace rows we already have with an error: a stale list beats
      // a blank screen, and the next navigation retries anyway.
      console.warn('conversation list refresh failed:', loadError);
      const message = getErrorMessage(loadError);
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', message }));
    }
  }, []);

  // Initial load, and a quiet refresh whenever a thread is opened or left.
  useEffect(() => {
    void load(!firstLoadRef.current);
    firstLoadRef.current = false;

    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [conversationId, load]);

  /**
   * Debounced refresh triggered by the thread (new message, deletion, read
   * state) — batching keeps a fast conversation from firing one query per
   * line.
   */
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current !== null) return;
    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      void load(true);
    }, 800);
  }, [load]);

  const openConversation = useCallback(
    (id: string) => {
      navigate(`/app/messages/${id}`);
    },
    [navigate],
  );

  const conversations = state.status === 'ready' ? state.conversations : [];
  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.message : null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] min-h-[20rem] w-full max-w-5xl overflow-hidden border-zinc-200 dark:border-zinc-800 md:h-[calc(100dvh-3rem)] md:border-x">
      <aside
        className={`w-full shrink-0 border-r border-zinc-200 dark:border-zinc-800 md:block md:w-80 ${
          conversationId ? 'hidden' : 'block'
        }`}
      >
        <ConversationList
          conversations={conversations}
          meId={meId}
          selectedId={conversationId}
          loading={loading}
          error={error}
          onSelect={openConversation}
          onNew={() => setNewChatOpen(true)}
          onRetry={() => void load(false)}
        />
      </aside>

      <section
        className={`min-w-0 flex-1 md:block ${conversationId ? 'block' : 'hidden'}`}
        aria-label="Conversation"
      >
        {conversationId ? (
          <ChatThread
            key={conversationId}
            conversationId={conversationId}
            meId={meId}
            onBack={() => navigate('/app/messages')}
            onActivity={scheduleReload}
          />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center gap-3 p-8 text-center md:flex">
            <svg
              className="h-10 w-10 text-zinc-300 dark:text-zinc-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M4 5h16v11H8l-4 4V5Z" />
            </svg>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Select a conversation
            </p>
            <p className="max-w-xs text-sm text-zinc-500">
              Direct messages and groups both arrive here, in real time.
            </p>
            <Button variant="secondary" onClick={() => setNewChatOpen(true)}>
              New message
            </Button>
          </div>
        )}
      </section>

      <NewChatModal
        open={newChatOpen}
        meId={meId}
        onClose={() => setNewChatOpen(false)}
        onCreated={(id) => {
          setNewChatOpen(false);
          openConversation(id);
        }}
      />
    </div>
  );
}
