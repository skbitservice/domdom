-- 00018_enhanced_features.sql
-- Enhanced social features: hashtags, mentions, shares, saves, post management,
-- comment likes, spam detection, and story-post integration.

-- ===========================================================================
-- posts: new columns for management features
-- ===========================================================================
alter table public.posts
  add column if not exists is_draft boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists comments_disabled boolean not null default false,
  add column if not exists hide_like_count boolean not null default false,
  add column if not exists share_count integer not null default 0;

-- ===========================================================================
-- post_hashtags: hashtags associated with posts
-- ===========================================================================
create table public.post_hashtags (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  hashtag    text not null constraint post_hashtags_tag_len check (char_length(hashtag) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint post_hashtags_unique unique (post_id, hashtag)
);

create index post_hashtags_tag_idx on public.post_hashtags (hashtag);
create index post_hashtags_post_idx on public.post_hashtags (post_id);

-- ===========================================================================
-- post_mentions: users mentioned in posts or comments
-- ===========================================================================
create table public.post_mentions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_mentions_target_check check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  ),
  constraint post_mentions_unique unique (post_id, comment_id, mentioned_user_id)
);

create index post_mentions_user_idx on public.post_mentions (mentioned_user_id);
create index post_mentions_post_idx on public.post_mentions (post_id);

-- ===========================================================================
-- comment_likes: likes on comments
-- ===========================================================================
create table public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint comment_likes_unique unique (user_id, comment_id)
);

create index comment_likes_comment_idx on public.comment_likes (comment_id);
create index comment_likes_user_idx on public.comment_likes (user_id);

-- ===========================================================================
-- saved_posts: user bookmarks
-- ===========================================================================
create table public.saved_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_posts_unique unique (user_id, post_id)
);

create index saved_posts_user_idx on public.saved_posts (user_id);
create index saved_posts_post_idx on public.saved_posts (post_id);

-- ===========================================================================
-- shares: track post shares (to DM, to story, external)
-- ===========================================================================
create table public.shares (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  share_type text not null check (share_type in ('dm', 'story', 'external', 'copy_link')),
  recipient_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index shares_post_idx on public.shares (post_id);
create index shares_user_idx on public.shares (user_id);

-- ===========================================================================
-- story_post_links: posts shared to stories
-- ===========================================================================
create table public.story_post_links (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint story_post_links_unique unique (story_id, post_id)
);

create index story_post_links_story_idx on public.story_post_links (story_id);
create index story_post_links_post_idx on public.story_post_links (post_id);

-- ===========================================================================
-- spam_flags: automated spam detection flags
-- ===========================================================================
create table public.spam_flags (
  id         uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'message')),
  target_id  uuid not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  flag_type  text not null check (flag_type in ('spam', 'suspicious_links', 'repeated_content', 'bot_behavior')),
  score      integer not null default 0 check (score between 0 and 100),
  created_at timestamptz not null default now()
);

create index spam_flags_target_idx on public.spam_flags (target_type, target_id);
create index spam_flags_user_idx on public.spam_flags (user_id);

-- ===========================================================================
-- RLS policies for new tables
-- ===========================================================================
alter table public.post_hashtags enable row level security;
alter table public.post_mentions enable row level security;
alter table public.comment_likes enable row level security;
alter table public.saved_posts enable row level security;
alter table public.shares enable row level security;
alter table public.story_post_links enable row level security;
alter table public.spam_flags enable row level security;

-- post_hashtags: readable on visible posts
create policy "View hashtags on visible posts"
  on public.post_hashtags
  for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "Add hashtags to own posts"
  on public.post_hashtags
  for insert
  to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()
  ));

-- post_mentions: readable on visible posts
create policy "View mentions on visible posts"
  on public.post_mentions
  for select
  to anon, authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
    union
    select 1 from public.comments c where c.id = comment_id
  ));

create policy "Add mentions to own posts"
  on public.post_mentions
  for insert
  to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()
    union
    select 1 from public.comments c where c.id = comment_id and c.user_id = auth.uid()
  ));

-- comment_likes: readable by all, own-row writes
create policy "Comment likes are readable"
  on public.comment_likes
  for select
  to anon, authenticated
  using (true);

create policy "Like comments"
  on public.comment_likes
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Remove own comment likes"
  on public.comment_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

-- saved_posts: own-row only
create policy "View own saved posts"
  on public.saved_posts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Save posts"
  on public.saved_posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Unsave posts"
  on public.saved_posts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- shares: readable by all (for share counts), own-row inserts
create policy "Shares are readable"
  on public.shares
  for select
  to anon, authenticated
  using (true);

create policy "Share posts"
  on public.shares
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- story_post_links: readable on visible stories
create policy "View story post links"
  on public.story_post_links
  for select
  to anon, authenticated
  using (exists (select 1 from public.stories s where s.id = story_id));

create policy "Add story post links"
  on public.story_post_links
  for insert
  to authenticated
  with check (exists (
    select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()
  ));

-- spam_flags: admin-only access
create policy "Admins view spam flags"
  on public.spam_flags
  for select
  to authenticated
  using (public.is_admin());

create policy "System can insert spam flags"
  on public.spam_flags
  for insert
  to authenticated
  with check (public.is_admin());

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- Extract hashtags from text (returns array of lowercase tags)
create or replace function public.extract_hashtags(text)
returns text[] language sql immutable as $$
  select array_agg(distinct lower(match[1]))
  from regexp_matches($1, '#([A-Za-z0-9_]+)', 'g') as match
  where length(match[1]) <= 100
$$;

-- Extract mentions from text (returns array of usernames without @)
create or replace function public.extract_mentions(text)
returns text[] language sql immutable as $$
  select array_agg(distinct lower(match[1]))
  from regexp_matches($1, '@([A-Za-z0-9_.]+)', 'g') as match
  where length(match[1]) <= 30
$$;

-- Increment share count on posts
create or replace function public.increment_share_count()
returns trigger language security definer set search_path = public as $$
begin
  update public.posts set share_count = share_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger shares_increment_count
  after insert on public.shares
  for each row execute function public.increment_share_count();

-- Decrement share count when share row is deleted
create or replace function public.decrement_share_count()
returns trigger language security definer set search_path = public as $$
begin
  update public.posts set share_count = greatest(share_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger shares_decrement_count
  after delete on public.shares
  for each row execute function public.decrement_share_count();

-- ===========================================================================
-- Update posts policies to respect is_draft and is_archived
-- ===========================================================================

-- Drop and recreate the SELECT policy to exclude drafts and archived posts
drop policy if exists "View posts per visibility" on public.posts;

create policy "View posts per visibility"
  on public.posts
  for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or (
      not is_draft
      and not is_archived
      and not public.is_blocked(user_id, auth.uid())
      and (
        (visibility = 'public'
          and not exists (
            select 1 from public.profiles p where p.id = user_id and p.is_private
          ))
        or (visibility in ('public', 'followers') and public.is_follower(user_id))
      )
    )
  );

-- ===========================================================================
-- Update notifications constraint to include 'share' type
-- ===========================================================================
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'like', 'comment', 'follow', 'follow_request', 'mention',
      'message', 'story_reply', 'reel_like', 'share'
    ));

-- Update the target_present constraint to include share notifications
alter table public.notifications
  drop constraint if exists notifications_target_present;

alter table public.notifications
  add constraint notifications_target_present
    check (post_id is not null or comment_id is not null or reel_id is not null
           or type in ('follow', 'follow_request', 'mention', 'message', 'story_reply', 'share'));
