import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@domdom/types';
import { usernameError } from '@domdom/utils';

/**
 * Profile API.
 *
 * Reads rely on the public profiles RLS policy; writes rely on the
 * owner-only policy plus the protect_profile_columns trigger (which blocks
 * self-granting is_verified / is_banned).
 */

export interface ProfilePatch {
  username?: string;
  full_name?: string | null;
  bio?: string | null;
  website?: string | null;
  avatar_url?: string | null;
}

export interface ProfileStats {
  posts: number;
  followers: number;
  following: number;
}

export async function getProfileById(client: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(
  client: SupabaseClient,
  username: string,
): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<ProfilePatch>;

  // Validate username format if provided (matches DB check constraint)
  if (clean.username !== undefined) {
    const normalized = clean.username.trim().toLowerCase();
    const err = usernameError(normalized);
    if (err) throw new Error(err);
    clean.username = normalized;
  }

  const { data, error } = await client
    .from('profiles')
    .update(clean)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

const AVATAR_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Upload an avatar to `avatars/{userId}/avatar.{ext}` (the storage policy
 * only allows that path shape) and return a cache-busted public URL.
 * Passing `upsert: true` replaces the previous avatar instead of piling up
 * files — important on the 1 GB free storage tier.
 */
export async function uploadAvatar(
  client: SupabaseClient,
  userId: string,
  file: Blob & { name: string },
): Promise<string> {
  const extension = AVATAR_MIME_EXTENSION[file.type] ?? 'jpg';
  const path = `${userId}/avatar.${extension}`;

  const { error } = await client.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = client.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Aggregate counters for one profile (each query runs under RLS). */
export async function getProfileStats(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileStats> {
  const [posts, followers, following] = await Promise.all([
    client.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId)
      .eq('status', 'accepted'),
    client
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
  ]);

  if (posts.error) throw posts.error;
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;

  return {
    posts: posts.count ?? 0,
    followers: followers.count ?? 0,
    following: following.count ?? 0,
  };
}
