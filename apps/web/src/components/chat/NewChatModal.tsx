import { useEffect, useState } from 'react';
import { Button, Modal, Spinner } from '@domdom/ui';
import {
  createGroupConversation,
  getFollowers,
  getFollowing,
  searchChatProfiles,
  startDirectConversation,
} from '@domdom/api';
import type { ChatParticipant } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../Avatar';
import { VerifiedBadge } from '../VerifiedBadge';

interface NewChatModalProps {
  open: boolean;
  meId: string;
  onClose: () => void;
  /** Fires with the id of the conversation to open (existing or brand new). */
  onCreated: (conversationId: string) => void;
}

type Tab = 'direct' | 'group';

/**
 * Start a chat: pick one person for a direct message, or name a room and
 * pick several for a group.
 *
 * Picking never guesses — `start_conversation_with` / `create_group_chat`
 * (migration 00012) decide what actually exists, re-check the block list and
 * return the conversation id the caller should open.
 */
export function NewChatModal({ open, meId, onClose, onCreated }: NewChatModalProps) {
  const [tab, setTab] = useState<Tab>('direct');
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<ChatParticipant[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [results, setResults] = useState<ChatParticipant[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ChatParticipant[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh modal every time it opens — no leftovers from the previous attempt.
  useEffect(() => {
    if (!open) return;
    setTab('direct');
    setTerm('');
    setResults(null);
    setSelected([]);
    setGroupName('');
    setError(null);
  }, [open]);

  // Suggestions = who I already follow (either direction), capped and de-duped.
  useEffect(() => {
    if (!open || !supabase) return;
    let cancelled = false;
    setSuggestionsLoading(true);

    Promise.all([getFollowers(supabase, meId), getFollowing(supabase, meId)])
      .then(([followers, following]) => {
        if (cancelled) return;
        const merged = new Map<string, ChatParticipant>();
        for (const person of [...followers, ...following]) {
          if (person.id !== meId) merged.set(person.id, person);
        }
        setSuggestions([...merged.values()].slice(0, 30));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, meId]);

  // Debounced username search; empty term falls back to the suggestions.
  useEffect(() => {
    if (!open || !supabase) return;
    const needle = term.trim();
    if (!needle) {
      setResults(null);
      setSearching(false);
      return;
    }

    const handle = window.setTimeout(() => {
      setSearching(true);
      searchChatProfiles(supabase!, needle)
        .then((people) => setResults(people.filter((person) => person.id !== meId)))
        .catch((searchError: unknown) => {
          setResults([]);
          setError(getErrorMessage(searchError));
        })
        .finally(() => setSearching(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [open, term, meId]);

  const startDirect = async (person: ChatParticipant) => {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await startDirectConversation(supabase, person.id));
    } catch (startError: unknown) {
      setError(getErrorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!supabase || busy) return;
    if (!groupName.trim()) {
      setError('Give the group a name.');
      return;
    }
    if (selected.length === 0) {
      setError('Pick at least one person to add.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const id = await createGroupConversation(
        supabase,
        groupName,
        selected.map((person) => person.id),
      );
      onCreated(id);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (person: ChatParticipant) => {
    setSelected((current) =>
      current.some((entry) => entry.id === person.id)
        ? current.filter((entry) => entry.id !== person.id)
        : [...current, person],
    );
  };

  const people: ChatParticipant[] = term.trim() ? (results ?? []) : suggestions;
  const showEmptySearch = Boolean(term.trim()) && !searching && results !== null;

  return (
    <Modal open={open} title="New message" onClose={onClose}>
      <div className="flex gap-2">
        {(['direct', 'group'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === value
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {value === 'direct' ? 'Direct' : 'Group'}
          </button>
        ))}
      </div>

      {tab === 'group' && (
        <input
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          maxLength={60}
          placeholder="Group name"
          aria-label="Group name"
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}

      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search by username"
        aria-label="Search by username"
        className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      {!term.trim() && (
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {suggestionsLoading ? 'Loading suggestions…' : 'Suggested'}
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {people.map((person) => {
          const isChosen = selected.some((entry) => entry.id === person.id);
          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => (tab === 'group' ? toggleSelected(person) : void startDirect(person))}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors disabled:opacity-60 ${
                  isChosen
                    ? 'bg-indigo-50 dark:bg-indigo-500/10'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Avatar url={person.avatar_url} username={person.username} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{person.username}</span>
                    <VerifiedBadge verified={person.is_verified} size="sm" />
                  </span>
                  {person.full_name && (
                    <span className="block truncate text-xs text-zinc-500">{person.full_name}</span>
                  )}
                </span>
                {tab === 'group' && (
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      isChosen
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-zinc-300 text-transparent dark:border-zinc-600'
                    }`}
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {searching && (
        <div className="flex justify-center py-4 text-zinc-500">
          <Spinner className="h-5 w-5" />
        </div>
      )}

      {!searching && !suggestionsLoading && people.length === 0 && (
        <p className="py-6 text-center text-sm text-zinc-500">
          {showEmptySearch
            ? `No account matches “${term.trim()}”.`
            : 'Nobody to suggest yet — search for a username above.'}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {tab === 'group' && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">
            {selected.length === 0
              ? 'No one picked yet'
              : `${selected.length} ${selected.length === 1 ? 'person' : 'people'} selected`}
          </span>
          <Button onClick={() => void createGroup()} loading={busy} disabled={busy}>
            Create group
          </Button>
        </div>
      )}
    </Modal>
  );
}
