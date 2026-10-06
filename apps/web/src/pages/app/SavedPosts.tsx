import { useEffect, useState, useCallback } from 'react';
import { Spinner } from '@domdom/ui';
import { getSavedPosts, type FeedPost } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { PostCard } from '../../components/PostCard';

export function SavedPosts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const saved = await getSavedPosts(supabase!, user.id);
      setPosts(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.post.id !== postId));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Saved posts</h1>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200">No saved posts yet</p>
          <p className="mt-1">Posts you bookmark will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((item) => (
            <PostCard key={item.post.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
