-- 00003_posts.sql
-- Feed content: posts, their media, likes and threaded comments.

-- ===========================================================================
-- posts
-- ===========================================================================
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  caption    text constraint posts_caption_len check (char_length(caption) <= 2200),
  location   text constraint posts_location_len check (char_length(location) <= 100),
  visibility text not null default 'public'
             check (visibility in ('public', 'followers', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One post can carry several photos/videos in a fixed order.
create table public.post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  media_url     text not null,
  media_type    text not null check (media_type in ('image', 'video')),
  thumbnail_url text,
  width         integer check (width > 0),
  height        integer check (height > 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table public.likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_unique unique (user_id, post_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  content    text not null constraint comments_content_len check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- indexes (feed = newest first per author + global recent)
-- ===========================================================================
create index posts_user_created_idx on public.posts (user_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index posts_visibility_created_idx on public.posts (visibility, created_at desc);
create index post_media_post_idx on public.post_media (post_id, sort_order);
create index likes_post_idx on public.likes (post_id);
create index likes_user_idx on public.likes (user_id);
create index comments_post_created_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_user_idx on public.comments (user_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

-- Visibility rules in one place:
--   * owner always sees their own posts
--   * 'public'  ⇒ anyone, unless the profile is private (then followers only)
--   * 'followers' ⇒ accepted followers only
--   * blocked users never see each other's posts
create policy "View posts per visibility"
  on public.posts
  for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or (
      not public.is_blocked(user_id, auth.uid())
      and (
        (visibility = 'public'
          and not exists (
            select 1 from public.profiles p where p.id = user_id and p.is_private
          ))
        or (visibility in ('public', 'followers') and public.is_follower(user_id))
      )
    )
  );

create policy "Create own posts"
  on public.posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Edit own posts"
  on public.posts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own posts"
  on public.posts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Media rows inherit the parent post's visibility: the sub-select on posts
-- runs under the caller's RLS, so only media of visible posts comes back.
create policy "View media of visible posts"
  on public.post_media
  for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "Add media to own posts"
  on public.post_media
  for insert
  to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()
  ));

create policy "Remove media from own posts"
  on public.post_media
  for delete
  to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()
  ));

-- Like counts and like lists are public engagement data — deliberately open
-- read (a like never exposes private content by itself); writes are own-row.
create policy "Likes are readable"
  on public.likes
  for select
  to anon, authenticated
  using (true);

create policy "Like posts you can see"
  on public.likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "Remove own likes"
  on public.likes
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Comments are only readable on posts the caller can see (the nested posts
-- query applies the posts policy automatically).
-- Note: no self-referencing subquery here — policies on the same table must
-- not query that table (PostgreSQL reports infinite recursion). Parent/comment
-- pairing is enforced by the application layer.
create policy "View comments on visible posts"
  on public.comments
  for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "Comment on visible posts as yourself"
  on public.comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "Edit own comments"
  on public.comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own comments"
  on public.comments
  for delete
  to authenticated
  using (user_id = auth.uid());
