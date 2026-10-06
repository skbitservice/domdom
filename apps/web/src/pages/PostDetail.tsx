import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@domdom/ui';
import {
  addComment,
  addReply,
  deletePost,
  getPost,
  listComments,
  setLiked,
  setCommentLiked,
  getCommentLikeStatus,
  type CommentRow,
  type FeedPost,
} from '@domdom/api';
import { getErrorMessage } from '@domdom/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { BackButton } from '../components/BackButton';
import { Avatar } from '../components/Avatar';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { ReportModal } from '../components/ReportModal';
import { ShareModal } from '../components/ShareModal';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; item: FeedPost };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Full post view with likes, comments, replies, and sharing. */
export function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<State>({ status: 'loading' });
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [liked, setLikedState] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportPostOpen, setReportPostOpen] = useState(false);
  const [reportedPost, setReportedPost] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportedComments, setReportedComments] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [commentLikes, setCommentLikes] = useState<Map<string, { count: number; likedByMe: boolean }>>(new Map());

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: 'loading' });
    setError(null);
    try {
      const [post, commentRows] = await Promise.all([
        getPost(supabase!, id, user?.id ?? null),
        listComments(supabase!, id),
      ]);
      if (!post) {
        setState({ status: 'missing' });
        return;
      }
      setComments(commentRows);
      setLikedState(post.likedByMe);
      setLikeCount(post.likeCount);
      setState({ status: 'ready', item: post });

      // Load comment like statuses
      if (user) {
        const likeStatuses = await Promise.all(
          commentRows.map((c) => getCommentLikeStatus(supabase!, c.id, user.id)),
        );
        const map = new Map<string, { count: number; likedByMe: boolean }>();
        commentRows.forEach((c, i) => {
          const status = likeStatuses[i];
          if (status) map.set(c.id, status);
        });
        setCommentLikes(map);
      }
    } catch (err) {
      setState({ status: 'error', message: getErrorMessage(err) });
    }
  }, [id, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLike = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (state.status !== 'ready' || busy) return;
    const next = !liked;
    setLikedState(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setBusy(true);
    try {
      await setLiked(supabase!, state.item.post.id, next);
    } catch (err) {
      setLikedState(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.status !== 'ready' || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (replyTo) {
        const reply = await addReply(supabase!, state.item.post.id, replyTo.id, text);
        setComments((rows) => [...rows, reply]);
        setReplyTo(null);
      } else {
        const comment = await addComment(supabase!, state.item.post.id, text);
        setComments((rows) => [...rows, comment]);
      }
      setText('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!user) return;
    const current = commentLikes.get(commentId) ?? { count: 0, likedByMe: false };
    const next = !current.likedByMe;
    // Optimistic update
    setCommentLikes((prev) => new Map(prev).set(commentId, {
      count: current.count + (next ? 1 : -1),
      likedByMe: next,
    }));
    try {
      await setCommentLiked(supabase!, commentId, next);
    } catch {
      // Revert on failure
      setCommentLikes((prev) => new Map(prev).set(commentId, current));
    }
  };

  const handleDelete = async () => {
    if (state.status !== 'ready' || busy) return;
    const authorName = state.item.author?.username;
    const confirmed = window.confirm('Delete this post? This cannot be undone.');
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deletePost(supabase!, state.item.post.id);
      navigate(authorName ? `/profile/${authorName}` : '/app/home');
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">404</p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          This post doesn&apos;t exist, or you don&apos;t have permission to view it.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <BackButton fallback="/" className="-ml-1 mb-3" />
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      </div>
    );
  }

  const { item } = state;
  const { post, author, media } = item;
  const authorName = author?.username ?? 'unknown';
  const isOwner = user?.id === post.user_id;

  // Separate top-level comments and replies
  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = new Map<string, CommentRow[]>();
  comments.filter((c) => c.parent_id).forEach((c) => {
    const list = repliesByParent.get(c.parent_id!) ?? [];
    list.push(c);
    repliesByParent.set(c.parent_id!, list);
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <BackButton fallback="/" className="col-span-full -ml-1 self-start" />
      <div className="overflow-hidden rounded-2xl bg-black">
        {media[0] ? (
          <img
            src={media[0].media_url}
            alt={post.caption?.slice(0, 100) || `${authorName}'s post`}
            className="max-h-[85vh] w-full object-contain"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
            Media unavailable
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Link to={`/profile/${authorName}`} className="flex min-w-0 items-center gap-3">
            <Avatar url={author?.avatar_url} username={authorName} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-semibold hover:underline">
                  {authorName}
                </span>
                <VerifiedBadge verified={author?.is_verified} size="sm" />
              </span>
              <span className="block text-xs text-zinc-500">{formatDate(post.created_at)}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share post"
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-indigo-500 dark:hover:bg-zinc-800"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            {isOwner ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Delete
              </button>
            ) : (
              user && (
                <button
                  type="button"
                  onClick={() => setReportPostOpen(true)}
                  disabled={reportedPost}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  {reportedPost ? 'Reported' : 'Report'}
                </button>
              )
            )}
          </div>
        </div>

        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleLike}
              disabled={busy}
              aria-label={liked ? 'Unlike' : 'Like'}
              aria-pressed={liked}
              className="transition-colors hover:text-red-500 disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-6 w-6 ${liked ? 'text-red-500' : ''}`}
                fill={liked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            {!post.hide_like_count && likeCount > 0 && (
              <span className="text-sm font-semibold">{likeCount.toLocaleString()} likes</span>
            )}
          </div>

          {post.caption && (
            <p className="mt-2 text-sm leading-5">
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
          {post.location && (
            <p className="mt-1 text-xs text-zinc-500">{post.location}</p>
          )}
          {item.hashtags.length > 0 && (
            <p className="mt-1 text-sm text-indigo-500">
              {item.hashtags.map((tag) => `#${tag}`).join(' ')}
            </p>
          )}
        </div>

        <div className="min-h-32 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {topLevelComments.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No comments yet.</p>
          ) : (
            topLevelComments.map((comment) => {
              const name = comment.author?.username ?? 'unknown';
              const commentReported = reportedComments.has(comment.id);
              const likes = commentLikes.get(comment.id) ?? { count: 0, likedByMe: false };
              const replies = repliesByParent.get(comment.id) ?? [];
              return (
                <div key={comment.id} className="space-y-3">
                  <div className="group flex gap-3">
                    <Avatar url={comment.author?.avatar_url} username={name} className="h-8 w-8" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="leading-5">
                        <Link
                          to={`/profile/${name}`}
                          className="mr-1 inline-flex items-center gap-1 font-semibold hover:underline"
                        >
                          {name}
                          <VerifiedBadge verified={comment.author?.is_verified} size="xs" />
                        </Link>
                        {comment.content}
                      </p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-400">
                        <span>{formatDate(comment.created_at)}</span>
                        {likes.count > 0 && <span>{likes.count} likes</span>}
                        {user && !post.comments_disabled && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(comment);
                              setText(`@${name} `);
                            }}
                            className="font-medium hover:text-indigo-500"
                          >
                            Reply
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCommentLike(comment.id)}
                        aria-label={likes.likedByMe ? 'Unlike comment' : 'Like comment'}
                        className={`rounded-lg p-1.5 transition-colors ${
                          likes.likedByMe ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill={likes.likedByMe ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                      {user && comment.user_id !== user.id && (
                        <button
                          type="button"
                          onClick={() => setReportCommentId(comment.id)}
                          disabled={commentReported}
                          aria-label={`Report comment by ${name}`}
                          className="shrink-0 rounded-lg p-1.5 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-800 disabled:opacity-60"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="M4 21V4m0 1h12l-2 4 2 4H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Replies */}
                  {replies.length > 0 && (
                    <div className="ml-11 space-y-2 border-l-2 border-zinc-100 pl-3 dark:border-zinc-800">
                      {replies.map((reply) => {
                        const replyName = reply.author?.username ?? 'unknown';
                        const replyLikes = commentLikes.get(reply.id) ?? { count: 0, likedByMe: false };
                        return (
                          <div key={reply.id} className="group flex gap-2">
                            <Avatar url={reply.author?.avatar_url} username={replyName} className="h-6 w-6" />
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="leading-5">
                                <Link
                                  to={`/profile/${replyName}`}
                                  className="mr-1 inline-flex items-center gap-1 font-semibold hover:underline"
                                >
                                  {replyName}
                                  <VerifiedBadge verified={reply.author?.is_verified} size="xs" />
                                </Link>
                                {reply.content}
                              </p>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-400">
                                <span>{formatDate(reply.created_at)}</span>
                                {replyLikes.count > 0 && <span>{replyLikes.count} likes</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCommentLike(reply.id)}
                              aria-label={replyLikes.likedByMe ? 'Unlike reply' : 'Like reply'}
                              className={`rounded-lg p-1 transition-colors ${
                                replyLikes.likedByMe ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5"
                                fill={replyLikes.likedByMe ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {post.comments_disabled && isOwner && (
            <p className="mb-2 text-center text-xs text-zinc-400">
              Comments are disabled for this post
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400"
            >
              {error}
            </p>
          )}
          {user ? (
            <form onSubmit={handleComment} className="flex gap-2">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                  <span>Replying to @{replyTo.author?.username}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                      setText('');
                    }}
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <label htmlFor="new-comment" className="sr-only">
                Add a comment
              </label>
              <input
                id="new-comment"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={1000}
                placeholder={post.comments_disabled && !isOwner ? 'Comments are disabled' : 'Add a comment…'}
                disabled={post.comments_disabled && !isOwner}
                className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 disabled:opacity-50 dark:border-zinc-700"
              />
              <button
                type="submit"
                disabled={busy || !text.trim() || (post.comments_disabled && !isOwner)}
                className="rounded-full px-3 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-500 disabled:opacity-50 dark:text-indigo-400"
              >
                Post
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-zinc-500">
              <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
                Log in
              </Link>{' '}
              to like or comment.
            </p>
          )}
        </div>
      </div>

      {user && !isOwner && (
        <ReportModal
          open={reportPostOpen}
          target={{ type: 'post', id: post.id, label: `post by @${authorName}` }}
          onClose={() => setReportPostOpen(false)}
          onFiled={() => setReportedPost(true)}
        />
      )}

      {user && reportCommentId && (
        <ReportModal
          open
          target={{ type: 'comment', id: reportCommentId, label: 'comment' }}
          onClose={() => setReportCommentId(null)}
          onFiled={() =>
            setReportedComments((prev) => new Set(prev).add(reportCommentId))
          }
        />
      )}

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        postCaption={post.caption || ''}
      />
    </div>
  );
}
