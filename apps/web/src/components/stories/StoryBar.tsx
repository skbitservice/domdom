import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@domdom/ui';
import { getProfileById, getStoryFeed, type StoryGroup } from '@domdom/api';
import type { Profile, Story } from '@domdom/types';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../Avatar';
import { CreateStoryDialog } from './CreateStoryDialog';
import { StoryViewer } from './StoryViewer';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; groups: StoryGroup[]; me: Profile | null };

const UNVIEWED_RING =
  'bg-gradient-to-tr from-amber-400 via-pink-500 to-indigo-500';
const VIEWED_RING = 'bg-zinc-300 dark:bg-zinc-700';

/**
 * Horizontal story strip above the home feed: "Your story" first, then the
 * accounts you follow, newest activity first. Own group opens the viewer and
 * always offers the "+" shortcut to add another story.
 */
export function StoryBar() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [creating, setCreating] = useState(false);
  const [viewerAuthor, setViewerAuthor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const [groups, me] = await Promise.all([
        getStoryFeed(supabase),
        getProfileById(supabase, user.id),
      ]);
      setState({ status: 'ready', groups, me });
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error) });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Insert the fresh story locally so the viewer can open on it at once. */
  const handleCreated = (story: Story) => {
    setCreating(false);
    setState((previous) => {
      if (previous.status !== 'ready' || !previous.me) return previous;
      const { id, username, full_name, avatar_url, is_verified } = previous.me;
      const author = { id, username, full_name, avatar_url, is_verified };
      const existing = previous.groups.find((group) => group.author.id === id);
      const group: StoryGroup = existing
        ? { ...existing, stories: [...existing.stories, story], viewed: false }
        : { author, stories: [story], viewed: false };
      return {
        ...previous,
        groups: [group, ...previous.groups.filter((g) => g.author.id !== id)],
      };
    });
    setViewerAuthor(story.user_id);
  };

  const handleDeleted = (story: Story) => {
    setState((previous) => {
      if (previous.status !== 'ready') return previous;
      return {
        ...previous,
        groups: previous.groups.flatMap((group) => {
          if (group.author.id !== story.user_id) return [group];
          const stories = group.stories.filter((item) => item.id !== story.id);
          return stories.length > 0 ? [{ ...group, stories }] : [];
        }),
      };
    });
  };

  if (state.status === 'loading') {
    return (
      <section aria-label="Stories" className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-4 px-4 py-4 text-zinc-400">
          <Spinner className="h-5 w-5" />
          <span className="text-sm">Loading stories…</span>
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-label="Stories" className="border-b border-zinc-200 dark:border-zinc-800">
        <p
          role="alert"
          className="m-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      </section>
    );
  }

  const { groups, me } = state;
  const myId = me?.id ?? null;
  const mine = groups.find((group) => group.author.id === myId) ?? null;
  const others = groups.filter((group) => group.author.id !== myId);
  const myLabel = me?.username ?? user?.email?.split('@')[0] ?? 'you';

  return (
    <>
      <section
        aria-label="Stories"
        className="border-b border-zinc-200 dark:border-zinc-800"
      >
        <div className="flex gap-4 overflow-x-auto px-4 py-3">
          {/* Your story — always first, always tappable. */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => (mine ? setViewerAuthor(myId) : setCreating(true))}
              className="flex w-20 flex-col items-center gap-1.5"
            >
              <span
                className={`rounded-full p-[2px] ${
                  mine ? UNVIEWED_RING : VIEWED_RING
                }`}
              >
                <span className="block rounded-full bg-white p-[2px] dark:bg-zinc-950">
                  <Avatar
                    url={me?.avatar_url ?? mine?.author.avatar_url ?? null}
                    username={myLabel}
                    className="h-14 w-14 text-base"
                  />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-zinc-600 dark:text-zinc-400">
                Your story
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="Add to your story"
              className="absolute top-11 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-sm font-bold leading-none text-white shadow hover:bg-indigo-500 dark:border-zinc-950"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          {/* Everyone else's active stories. */}
          {others.map((group) => (
            <button
              key={group.author.id}
              type="button"
              onClick={() => setViewerAuthor(group.author.id)}
              className="flex w-20 shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={`rounded-full p-[2px] ${
                  group.viewed ? VIEWED_RING : UNVIEWED_RING
                }`}
              >
                <span className="block rounded-full bg-white p-[2px] dark:bg-zinc-950">
                  <Avatar
                    url={group.author.avatar_url}
                    username={group.author.username}
                    className="h-14 w-14 text-base"
                  />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-zinc-600 dark:text-zinc-400">
                {group.author.username}
              </span>
            </button>
          ))}
        </div>
      </section>

      <CreateStoryDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={handleCreated}
      />

      {viewerAuthor && (
        <StoryViewer
          groups={groups}
          initialAuthorId={viewerAuthor}
          onClose={() => setViewerAuthor(null)}
          onStoryDeleted={handleDeleted}
        />
      )}
    </>
  );
}
