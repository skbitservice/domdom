import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '@domdom/ui';
import { getFeedPage, type FeedPost } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { PostCard } from '../../components/PostCard';
import { CreatePostModal } from '../../components/CreatePostModal';
import { StoryBar } from '../../components/stories/StoryBar';

const PAGE_SIZE = 10;

export function Home() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getFeedPage(supabase!, user.id, { limit: PAGE_SIZE });
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!user || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getFeedPage(supabase!, user.id, {
        limit: PAGE_SIZE,
        before: nextCursor,
      });
      setPosts((prev) => [...prev, ...result.posts]);
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [user, nextCursor, loadingMore]);

  // Infinite scroll: observe the sentinel element
  useEffect(() => {
    if (!loadMoreRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore, hasMore, loadingMore]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.post.id !== postId));
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Home</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          New post
        </button>
      </div>

      <StoryBar />

      {loading && (
        <div className="flex justify-center py-20 text-zinc-500">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {!loading && posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200">Your feed is empty</p>
          <p className="mt-1">
            Follow people to see their posts here — or share your first photo.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Create your first post
          </button>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-6">
          {posts.map((item) => (
            <PostCard
              key={item.post.id}
              item={item}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {!loading && posts.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && <Spinner className="h-6 w-6" />}
          {!hasMore && (
            <p className="text-sm text-zinc-400">You've reached the end</p>
          )}
        </div>
      )}

      <CreatePostModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(post) => setPosts((prev) => [post, ...prev])}
      />
    </div>
  );
}
