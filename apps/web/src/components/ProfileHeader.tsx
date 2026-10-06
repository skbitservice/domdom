import type { ReactNode } from 'react';
import type { Profile } from '@domdom/types';
import type { ProfileStats } from '@domdom/api';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

function Stat({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick?: () => void;
}) {
  // flex-1 → the three stats share the row evenly, like Instagram's
  // posts / followers / following columns.
  const className =
    'flex-1 rounded-lg px-2 py-1 text-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800';
  const inner = (
    <>
      <div className="text-base font-bold tabular-nums sm:text-lg">{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

function externalHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

/**
 * Shared header for the own-profile and public-profile pages, laid out the
 * way Instagram does it: avatar and stats side by side, identity and bio
 * underneath, action buttons last (full-width halves on a phone).
 */
export function ProfileHeader({
  profile,
  stats,
  actions,
  onFollowersClick,
  onFollowingClick,
}: {
  profile: Profile;
  stats: ProfileStats;
  /** Buttons rendered under the bio (e.g. Edit profile). */
  actions?: ReactNode;
  /** When provided, the followers stat becomes a button opening a list. */
  onFollowersClick?: () => void;
  /** When provided, the following stat becomes a button opening a list. */
  onFollowingClick?: () => void;
}) {
  return (
    <header className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 sm:p-6">
      {/* Avatar + stats — one row at every width. */}
      <div className="flex items-center gap-4 sm:gap-10">
        <Avatar
          url={profile.avatar_url}
          username={profile.username}
          className="h-20 w-20 text-2xl sm:h-32 sm:w-32 sm:text-4xl"
        />

        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Stat value={stats.posts} label="posts" />
          <Stat
            value={stats.followers}
            label="followers"
            onClick={onFollowersClick}
          />
          <Stat
            value={stats.following}
            label="following"
            onClick={onFollowingClick}
          />
        </div>
      </div>

      {/* Identity + bio, full width under the avatar row. */}
      <div className="mt-4 sm:mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold break-all sm:text-lg">
            {profile.username}
          </h1>
          <VerifiedBadge verified={profile.is_verified} size="md" />
          {profile.is_private && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Private
            </span>
          )}
        </div>

        {profile.full_name && (
          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {profile.full_name}
          </p>
        )}

        {(profile.bio || profile.website) && (
          <div className="mt-1 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {profile.bio && (
              <p className="whitespace-pre-wrap break-words">{profile.bio}</p>
            )}
            {profile.website && (
              <a
                href={externalHref(profile.website)}
                target="_blank"
                rel="noreferrer nofollow"
                className="break-all font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {profile.website}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Buttons: halves of one row on a phone, natural width on desktop. */}
      {actions && (
        <div className="mt-5 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </header>
  );
}
