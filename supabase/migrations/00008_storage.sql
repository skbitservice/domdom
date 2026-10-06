-- 00008_storage.sql
-- Media buckets with per-bucket size/type limits and RLS policies.
-- Limits match the free-tier plan (Supabase Free: 50 MB max upload, 1 GB total).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- public read ⇒ feeds can render URLs directly, no signed-URL round trips
  ('avatars',    'avatars',    true,  2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('post-media', 'post-media', true,  26214400, array['image/jpeg', 'image/png', 'image/webp',
                                                       'video/mp4', 'video/quicktime', 'video/webm']),
  ('story-media', 'story-media', true, 26214400, array['image/jpeg', 'image/png', 'image/webp',
                                                        'video/mp4', 'video/quicktime', 'video/webm']),
  ('reel-media', 'reel-media', true,  52428800, array['image/jpeg', 'image/png', 'image/webp',
                                                       'video/mp4', 'video/quicktime', 'video/webm']),
  -- private: conversation media must stay member-only
  ('chat-media', 'chat-media', false, 8388608,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ===========================================================================
-- object policies
-- ===========================================================================

-- READ: the four social buckets are public (avatars/photos/reels/stories are
-- public content by design); chat-media only opens for conversation members.
-- Path convention:  {owner-or-conversation-id}/{filename}
create policy "Public read for social media"
  on storage.objects
  for select
  using (
    bucket_id in ('avatars', 'post-media', 'story-media', 'reel-media')
    or (
      bucket_id = 'chat-media'
      and public.is_conversation_member(nullif((storage.foldername(name))[1], '')::uuid)
    )
  );

-- INSERT: upload only into your own folder. For chat-media the first path
-- segment is the conversation id, which the uploader must belong to.
create policy "Insert into own media folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    (
      bucket_id in ('avatars', 'post-media', 'story-media', 'reel-media')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or (
      bucket_id = 'chat-media'
      and public.is_conversation_member(nullif((storage.foldername(name))[1], '')::uuid)
    )
  );

-- UPDATE (used by avatar re-upload / upsert) and DELETE: object owner only.
create policy "Update own objects"
  on storage.objects
  for update
  to authenticated
  using (
    owner_id = auth.uid()::text
    and bucket_id in ('avatars', 'post-media', 'story-media', 'reel-media', 'chat-media')
  )
  with check (
    owner_id = auth.uid()::text
    and bucket_id in ('avatars', 'post-media', 'story-media', 'reel-media', 'chat-media')
  );

create policy "Delete own objects"
  on storage.objects
  for delete
  to authenticated
  using (
    owner_id = auth.uid()::text
    and bucket_id in ('avatars', 'post-media', 'story-media', 'reel-media', 'chat-media')
  );
