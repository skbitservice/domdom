import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '@domdom/api';

interface PostGridProps {
  posts: FeedPost[];
  /** Rendered when there are no posts to show. */
  empty?: ReactNode;
}

/** Square 3-column post grid with hover engagement counts. */
export function PostGrid({ posts, empty }: PostGridProps) {
  if (posts.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="mt-6 grid grid-cols-3 gap-1.5 sm:gap-2">
      {posts.map(({ post, media, likeCount, commentCount }) => (
        <Link
          key={post.id}
          to={`/post/${post.id}`}
          className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
        >
          {media[0] ? (
            <img
              src={media[0].media_url}
              alt={post.caption?.slice(0, 100) || 'Post'}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              No media
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount}
            </span>
            <span className="flex items-center gap-1">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {commentCount}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
