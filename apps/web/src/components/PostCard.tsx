import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setLiked, savePost, unsavePost, type FeedPost } from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { ShareModal } from './ShareModal';
import { PostOptionsMenu } from './PostOptionsMenu';

interface PostCardProps {
  item: FeedPost;
  /** Notified when the like state changes so lists can stay in sync. */
  onLikeChange?: (liked: boolean, likeCount: number) => void;
  /** Notified when the save state changes. */
  onSaveChange?: (saved: boolean) => void;
  /** Notified when the post is deleted. */
  onDelete?: (postId: string) => void;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${filled ? 'text-red-500' : ''}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${filled ? 'text-indigo-500' : ''}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** A post as shown in the home feed: author, media, like/comment/share/save actions. */
export function PostCard({ item, onLikeChange, onSaveChange, onDelete }: PostCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked, setLikedState] = useState(item.likedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [saved, setSaved] = useState(item.savedByMe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showHeart, setShowHeart] = useState(false);

  const { post, author, media } = item;
  const detailPath = `/post/${post.id}`;
  const authorName = author?.username ?? 'unknown';
  const isOwner = user?.id === post.user_id;

  const handleLike = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    const next = !liked;
    setLikedState(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setBusy(true);
    setError(null);
    try {
      await setLiked(supabase!, post.id, next);
      // Use functional form to get latest count for callback
      setLikeCount((latest) => {
        onLikeChange?.(next, latest);
        return latest;
      });
    } catch (err) {
      setLikedState(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Double-click to like
  const handleDoubleClick = useCallback(() => {
    if (!liked) {
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    }
  }, [liked]);

  const handleSave = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    const next = !saved;
    setSaved(next);
    setError(null);
    try {
      if (next) {
        await savePost(supabase!, post.id);
      } else {
        await unsavePost(supabase!, post.id);
      }
      onSaveChange?.(next);
    } catch (err) {
      setSaved(!next);
      setError(getErrorMessage(err));
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to={`/profile/${authorName}`} className="flex min-w-0 items-center gap-3">
          <Avatar url={author?.avatar_url} username={authorName} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold hover:underline">
                {authorName}
              </span>
              <VerifiedBadge verified={author?.is_verified} size="sm" />
            </span>
            {post.location && (
              <span className="block truncate text-xs text-zinc-500">{post.location}</span>
            )}
          </span>
        </Link>
        {isOwner && <PostOptionsMenu post={item} onDelete={onDelete} />}
      </div>

      <div className="relative bg-black" onDoubleClick={handleDoubleClick}>
        {media[0] ? (
          <img
            src={media[0].media_url}
            alt={post.caption?.slice(0, 100) || `${authorName}'s post`}
            loading="lazy"
            className="max-h-[70vh] w-full cursor-pointer object-contain"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
            Media unavailable
          </div>
        )}
        {/* Double-click heart animation */}
        {showHeart && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-24 w-24 text-white drop-shadow-lg"
              fill="currentColor"
              style={{ animation: 'heartBurst 0.8s ease-out' }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        )}
        {/* Multiple media indicator */}
        {media.length > 1 && (
          <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            1/{media.length}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            disabled={busy}
            aria-label={liked ? 'Unlike' : 'Like'}
            aria-pressed={liked}
            className="transition-colors hover:text-red-500 disabled:opacity-60"
          >
            <HeartIcon filled={liked} />
          </button>
          <Link
            to={detailPath}
            aria-label="Open comments"
            className="transition-colors hover:text-indigo-500"
          >
            <CommentIcon />
          </Link>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share post"
            className="transition-colors hover:text-indigo-500"
          >
            <ShareIcon />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Unsave' : 'Save'}
            aria-pressed={saved}
            className="transition-colors hover:text-indigo-500"
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>

        {!post.hide_like_count && likeCount > 0 && (
          <p className="mt-2 text-sm font-semibold">{likeCount.toLocaleString()} likes</p>
        )}

        {post.caption && (
          <p className="mt-1 text-sm leading-5">
            <Link
              to={`/profile/${authorName}`}
              className="mr-1 inline-flex items-center gap-1 font-semibold hover:underline"
            >
              {authorName}
              <VerifiedBadge verified={author?.is_verified} size="xs" />
            </Link>
            {post.caption}
          </p>
        )}

        {/* Hashtags */}
        {item.hashtags.length > 0 && (
          <p className="mt-1 text-sm text-indigo-500">
            {item.hashtags.map((tag) => `#${tag}`).join(' ')}
          </p>
        )}

        {item.commentCount > 0 && (
          <Link
            to={detailPath}
            className="mt-1 block text-sm text-zinc-500 hover:underline"
          >
            View all {item.commentCount} comment{item.commentCount === 1 ? '' : 's'}
          </Link>
        )}

        {post.share_count > 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            {post.share_count} share{post.share_count === 1 ? '' : 's'}
          </p>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        postCaption={post.caption || ''}
      />
    </article>
  );
}
