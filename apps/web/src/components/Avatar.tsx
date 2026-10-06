interface AvatarProps {
  url?: string | null;
  /** Used for initials and alt text when there is no image. */
  username: string;
  className?: string;
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

/** Circular avatar with an initials fallback. */
export function Avatar({ url, username, className = '' }: AvatarProps) {
  // Callers may pass their own size (h-20 w-20 …); only fall back to the
  // default 40px per axis when they don't, so two conflicting utilities for
  // the same axis never end up in the class list.
  const hasHeight = /\bh-|\bsize-/.test(className);
  const hasWidth = /\bw-|\bsize-/.test(className);
  const classes = `${hasHeight ? '' : 'h-10'} ${hasWidth ? '' : 'w-10'} shrink-0 rounded-full object-cover ${className}`;

  if (url) {
    return (
      <img
        src={url}
        alt={`${username}'s avatar`}
        loading="lazy"
        className={classes}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 ${classes}`}
    >
      {initials(username)}
    </div>
  );
}
