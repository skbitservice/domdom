-- 00005_reels.sql
-- Short vertical video: reels, their likes and comments.

-- ===========================================================================
-- reels
-- ===========================================================================
create table public.reels (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  video_url     text not null,
  thumbnail_url text,
  caption       text constraint reels_caption_len check (char_length(caption) <= 500),
  audio_name    text constraint reels_audio_len check (char_length(audio_name) <= 120),
  duration      integer constraint reels_duration_len check (duration between 0 and 300),
  views_count   integer not null default 0 constraint reels_views_min check (views_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.reel_likes (
  id         uuid primary key default gen_random_uuid(),
  reel_id    uuid not null references public.reels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reel_likes_unique unique (reel_id, user_id)
);

create table public.reel_comments (
  id         uuid primary key default gen_random_uuid(),
  reel_id    uuid not null references public.reels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  content    text not null constraint reel_comments_content_len check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reels_set_updated_at
  before update on public.reels
  for each row execute function public.set_updated_at();

create trigger reel_comments_set_updated_at
  before update on public.reel_comments
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- indexes
-- ===========================================================================
create index reels_created_idx on public.reels (created_at desc);
create index reels_user_idx on public.reels (user_id, created_at desc);
create index reel_likes_reel_idx on public.reel_likes (reel_id);
create index reel_likes_user_idx on public.reel_likes (user_id);
create index reel_comments_reel_idx on public.reel_comments (reel_id, created_at);
create index reel_comments_user_idx on public.reel_comments (user_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.reels enable row level security;
alter table public.reel_likes enable row level security;
alter table public.reel_comments enable row level security;

-- Reels follow the profile's privacy: private accounts are only visible to
-- their followers; blocked users never see each other's reels.
create policy "View reels"
  on public.reels
  for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or (
      not public.is_blocked(user_id, auth.uid())
      and (
        not exists (
          select 1 from public.profiles p where p.id = user_id and p.is_private
        )
        or public.is_follower(user_id)
      )
    )
  );

create policy "Create own reels"
  on public.reels
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Edit own reels"
  on public.reels
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own reels"
  on public.reels
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Engagement data is public read (same reasoning as post likes);
-- writes are own-row only.
create policy "Reel likes are readable"
  on public.reel_likes
  for select
  to anon, authenticated
  using (true);

create policy "Like reels you can see"
  on public.reel_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reels r where r.id = reel_id)
  );

create policy "Remove own reel likes"
  on public.reel_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy "View reel comments on visible reels"
  on public.reel_comments
  for select
  to anon, authenticated
  using (exists (select 1 from public.reels r where r.id = reel_id));

create policy "Comment on visible reels as yourself"
  on public.reel_comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reels r where r.id = reel_id)
  );

create policy "Edit own reel comments"
  on public.reel_comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own reel comments"
  on public.reel_comments
  for delete
  to authenticated
  using (user_id = auth.uid());
