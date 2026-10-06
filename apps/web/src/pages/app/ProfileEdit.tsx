import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Spinner, TextField } from '@domdom/ui';
import { getProfileById, updateProfile, uploadAvatar } from '@domdom/api';
import type { Profile } from '@domdom/types';
import { getErrorMessage, normalizeUsername, usernameError, validateImageFile } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Avatar } from '../../components/Avatar';
import { FileCard } from '../../components/FileCard';

const AVATAR_MAX_MB = 2;
const BIO_MAX = 160;

export function ProfileEdit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    getProfileById(supabase!, user.id)
      .then((data) => {
        if (cancelled || !data) return;
        setProfile(data);
        setUsername(data.username);
        setFullName(data.full_name ?? '');
        setBio(data.bio ?? '');
        setWebsite(data.website ?? '');
      })
      .catch((error) => {
        if (!cancelled) setFormError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleFileChange = (file: File | undefined) => {
    setFormError(null);
    if (!file) return;

    const problem = validateImageFile(file, AVATAR_MAX_MB);
    if (problem) {
      setFormError(problem);
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !profile) return;
    setFormError(null);

    const nextErrors: Record<string, string | null> = {
      username: usernameError(normalizeUsername(username)),
      full_name: fullName.length > 60 ? 'Maximum 60 characters.' : null,
      bio: bio.length > BIO_MAX ? `Maximum ${BIO_MAX} characters.` : null,
      website: website.length > 200 ? 'Maximum 200 characters.' : null,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      let avatarUrl: string | undefined;

      if (avatarFile) {
        avatarUrl = await uploadAvatar(supabase!, user.id, avatarFile);
      }

      await updateProfile(supabase!, user.id, {
        username: normalizeUsername(username),
        full_name: fullName.trim() || null,
        bio: bio.trim() || null,
        website: website.trim() || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });

      navigate('/app/profile');
    } catch (error) {
      const code = (error as { code?: string }).code;
      setFormError(
        code === '23505'
          ? 'That username is already taken.'
          : getErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {formError ?? 'Profile could not be loaded.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Edit profile</h1>
        <Link
          to="/app/profile"
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Cancel
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        {formError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
          >
            {formError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar
              url={avatarPreview ?? profile.avatar_url}
              username={username || profile.username}
              className="h-16 w-16 text-lg"
            />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="avatar-input"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-700"
              >
                Change photo
              </button>
              <p className="mt-1 text-xs text-zinc-500">
                JPEG, PNG or WEBP — up to {AVATAR_MAX_MB} MB.
              </p>
            </div>
          </div>

          {/* Pending avatar upload: uploader + badge + file name in one row. */}
          {avatarFile && avatarPreview && (
            <FileCard
              variant="row"
              uploader={{
                username: profile.username,
                avatar_url: profile.avatar_url,
                is_verified: profile.is_verified,
              }}
              fileName={avatarFile.name}
              previewUrl={avatarPreview}
              kind="image"
              sizeBytes={avatarFile.size}
              meta="Ready to upload"
              removeLabel="Discard the new photo"
              onRemove={() => {
                URL.revokeObjectURL(avatarPreview);
                setAvatarPreview(null);
                setAvatarFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
          )}

          <TextField
            label="Username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            error={errors.username}
            required
          />
          <TextField
            label="Full name"
            name="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            error={errors.full_name}
          />
          <div className="space-y-1.5">
            <label htmlFor="bio" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about you"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <p className="text-right text-xs text-zinc-500 tabular-nums">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <TextField
            label="Website"
            name="website"
            type="url"
            inputMode="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            error={errors.website}
          />

          <div className="flex gap-3">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => navigate('/app/profile')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
