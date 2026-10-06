-- 00004_stories.sql
-- 24-hour stories plus view tracking.

-- ===========================================================================
-- stories
-- ===========================================================================
create table public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_url  text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption    text constraint stories_caption_len check (char_length(caption) <= 200),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create table public.story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  constraint story_views_unique unique (story_id, viewer_id)
);

-- ===========================================================================
-- indexes
-- ===========================================================================
-- Hot query: "active stories of the people I follow" and expiry cleanup.
create index stories_user_idx on public.stories (user_id, expires_at desc);
create index stories_expires_idx on public.stories (expires_at);
create index story_views_story_idx on public.story_views (story_id);
create index story_views_viewer_idx on public.story_views (viewer_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.stories enable row level security;
alter table public.story_views enable row level security;

-- Expired stories disappear for everyone but the author (soft expiry —
-- rows are cleaned up later in bulk, never read after expires_at).
create policy "View active stories"
  on public.stories
  for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and not public.is_blocked(user_id, auth.uid())
      and (
        not exists (
          select 1 from public.profiles p where p.id = user_id and p.is_private
        )
        or public.is_follower(user_id)
      )
    )
  );

create policy "Create own stories"
  on public.stories
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Edit own stories"
  on public.stories
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own stories"
  on public.stories
  for delete
  to authenticated
  using (user_id = auth.uid());

-- A viewer sees the story-owner's view list or their own views.
create policy "Read story views"
  on public.story_views
  for select
  to anon, authenticated
  using (
    viewer_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
  );

create policy "Record own story views"
  on public.story_views
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (select 1 from public.stories s where s.id = story_id)
  );
