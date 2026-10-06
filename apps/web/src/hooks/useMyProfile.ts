import { useEffect, useMemo, useState } from 'react';
import { getProfileById } from '@domdom/api';
import type { Profile } from '@domdom/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import type { FileUploader } from '../components/FileCard';

/**
 * The signed-in user's profile row (username, avatar, `is_verified`…).
 *
 * Needed wherever the current user appears as an *uploader* — file previews
 * and attachment cards show the sender's name plus the verified badge, and the
 * badge must come from the database flag, never from the client.
 *
 * Returns `null` while loading (or on failure): callers fall back to an
 * unverified identity, so a slow lookup can never flash a badge.
 */
export function useMyProfile(): Profile | null {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user || !supabase) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    getProfileById(supabase, user.id)
      .then((row) => {
        if (!cancelled) setProfile(row);
      })
      .catch(() => {
        // The badge is cosmetic — a failed read must not break an upload.
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return profile;
}

/**
 * Uploader identity for file/attachment cards: name, avatar and the verified
 * flag. Never optimistically verified — until the profile lands the badge
 * stays hidden, and an unverified account never renders one.
 */
export function useUploader(): FileUploader {
  const { user } = useAuth();
  const profile = useMyProfile();

  return useMemo<FileUploader>(
    () => ({
      username:
        profile?.username ??
        (typeof user?.user_metadata?.username === 'string'
          ? (user.user_metadata.username as string)
          : (user?.email?.split('@')[0] ?? 'You')),
      avatar_url: profile?.avatar_url ?? null,
      is_verified: profile?.is_verified ?? false,
    }),
    [profile, user],
  );
}
