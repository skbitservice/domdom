-- 00019_live_streams.sql
-- Instagram-style LIVE streaming: streams, viewers, comments, reactions,
-- guests, reports, and analytics.
--
-- Design notes:
-- - All tables have RLS enabled; the database is the authority.
-- - live_streams.stream_key is a secret — only the host can read it.
-- - live_viewers tracks join/leave for analytics (peak viewers, total views).
-- - live_comments and live_reactions are the realtime chat layer.
-- - live_guests enables Instagram-style co-hosting.
-- - live_reports lets viewers report a live stream.
-- - A SECURITY DEFINER function handles viewer count updates safely.

-- ===========================================================================
-- live_streams: the core stream table
-- ===========================================================================
create table public.live_streams (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null default 'LIVE',
  description     text,
  thumbnail_url   text,
  stream_status   text not null default 'scheduled'
                  check (stream_status in ('scheduled', 'live', 'ended')),
  stream_key      text not null unique,
  started_at      timestamptz,
  ended_at        timestamptz,
  viewer_count    integer not null default 0,
  peak_viewers    integer not null default 0,
  total_views     integer not null default 0,
  recording_url   text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index live_streams_host_idx on public.live_streams (host_id);
create index live_streams_status_idx on public.live_streams (stream_status);
create index live_streams_created_idx on public.live_streams (created_at desc);

-- ===========================================================================
-- live_viewers: who joined and when (for analytics)
-- ===========================================================================
create table public.live_viewers (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.live_streams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  constraint live_viewers_unique unique (live_id, user_id, joined_at)
);

create index live_viewers_live_idx on public.live_viewers (live_id);
create index live_viewers_user_idx on public.live_viewers (user_id);

-- ===========================================================================
-- live_comments: realtime chat messages
-- ===========================================================================
create table public.live_comments (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.live_streams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message    text not null constraint live_comments_msg_len check (char_length(message) between 1 and 500),
  is_pinned  boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index live_comments_live_idx on public.live_comments (live_id);
create index live_comments_user_idx on public.live_comments (user_id);
create index live_comments_created_idx on public.live_comments (created_at desc);

-- ===========================================================================
-- live_reactions: emoji reactions (heart, laugh, clap, etc.)
-- ===========================================================================
create table public.live_reactions (
  id            uuid primary key default gen_random_uuid(),
  live_id       uuid not null references public.live_streams (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  reaction_type text not null check (reaction_type in ('heart', 'laugh', 'clap', 'fire', 'cry', 'surprise')),
  created_at    timestamptz not null default now(),
  constraint live_reactions_unique unique (live_id, user_id, reaction_type)
);

create index live_reactions_live_idx on public.live_reactions (live_id);
create index live_reactions_user_idx on public.live_reactions (user_id);

-- ===========================================================================
-- live_guests: co-host / guest management
-- ===========================================================================
create table public.live_guests (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.live_streams (id) on delete cascade,
  host_id    uuid not null references public.profiles (id) on delete cascade,
  guest_id   uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'invited'
             check (status in ('invited', 'accepted', 'declined', 'removed', 'left')),
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  constraint live_guests_unique unique (live_id, guest_id)
);

create index live_guests_live_idx on public.live_guests (live_id);
create index live_guests_guest_idx on public.live_guests (guest_id);

-- ===========================================================================
-- live_reports: report a live stream
-- ===========================================================================
create table public.live_reports (
  id          uuid primary key default gen_random_uuid(),
  live_id     uuid not null references public.live_streams (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'scam', 'other')),
  description text,
  created_at  timestamptz not null default now(),
  constraint live_reports_unique unique (live_id, reporter_id)
);

create index live_reports_live_idx on public.live_reports (live_id);

-- ===========================================================================
-- live_blocked_viewers: host can block viewers from a live
-- ===========================================================================
create table public.live_blocked_viewers (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.live_streams (id) on delete cascade,
  host_id    uuid not null references public.profiles (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint live_blocked_unique unique (live_id, viewer_id)
);

create index live_blocked_live_idx on public.live_blocked_viewers (live_id);
create index live_blocked_viewer_idx on public.live_blocked_viewers (viewer_id);

-- ===========================================================================
-- RLS policies
-- ===========================================================================
alter table public.live_streams enable row level security;
alter table public.live_viewers enable row level security;
alter table public.live_comments enable row level security;
alter table public.live_reactions enable row level security;
alter table public.live_guests enable row level security;
alter table public.live_reports enable row level security;
alter table public.live_blocked_viewers enable row level security;

-- live_streams: anyone can view live/ended streams; only host can modify
create policy "View live streams"
  on public.live_streams
  for select
  to anon, authenticated
  using (stream_status in ('live', 'ended') or host_id = auth.uid());

create policy "Host can create streams"
  on public.live_streams
  for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "Host can update own streams"
  on public.live_streams
  for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "Host can delete own streams"
  on public.live_streams
  for delete
  to authenticated
  using (host_id = auth.uid());

-- live_viewers: anyone can view; users can insert/delete their own
create policy "View live viewers"
  on public.live_viewers
  for select
  to anon, authenticated
  using (true);

create policy "Users can join live"
  on public.live_viewers
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can leave live"
  on public.live_viewers
  for delete
  to authenticated
  using (user_id = auth.uid());

-- live_comments: anyone can view; users can insert/delete their own
create policy "View live comments"
  on public.live_comments
  for select
  to anon, authenticated
  using (true);

create policy "Users can comment"
  on public.live_comments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own comments"
  on public.live_comments
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Host can delete any comment on their live
create policy "Host can delete any comment"
  on public.live_comments
  for delete
  to authenticated
  using (exists (
    select 1 from public.live_streams s where s.id = live_id and s.host_id = auth.uid()
  ));

-- live_reactions: anyone can view; users can insert/delete their own
create policy "View live reactions"
  on public.live_reactions
  for select
  to anon, authenticated
  using (true);

create policy "Users can react"
  on public.live_reactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can remove reactions"
  on public.live_reactions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- live_guests: host and guest can view; host can manage
create policy "View live guests"
  on public.live_guests
  for select
  to anon, authenticated
  using (true);

create policy "Host can invite guests"
  on public.live_guests
  for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "Host can update guests"
  on public.live_guests
  for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "Guest can update own status"
  on public.live_guests
  for update
  to authenticated
  using (guest_id = auth.uid())
  with check (guest_id = auth.uid());

create policy "Host can remove guests"
  on public.live_guests
  for delete
  to authenticated
  using (host_id = auth.uid());

-- live_reports: anyone can insert; only host and admin can view
create policy "Users can report live"
  on public.live_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "Host can view reports on own live"
  on public.live_reports
  for select
  to authenticated
  using (exists (
    select 1 from public.live_streams s where s.id = live_id and s.host_id = auth.uid()
  ) or public.is_admin());

-- live_blocked_viewers: host can manage; viewers can check if blocked
create policy "View blocked status"
  on public.live_blocked_viewers
  for select
  to authenticated
  using (viewer_id = auth.uid() or host_id = auth.uid());

create policy "Host can block viewers"
  on public.live_blocked_viewers
  for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "Host can unblock viewers"
  on public.live_blocked_viewers
  for delete
  to authenticated
  using (host_id = auth.uid());

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- Generate a unique stream key
create or replace function public.generate_stream_key()
returns text language sql immutable as $$
  select encode(gen_random_bytes(16), 'hex');
$$;

-- Update viewer count when someone joins
create or replace function public.handle_viewer_join()
returns trigger language security definer set search_path = public as $$
begin
  update public.live_streams
  set viewer_count = viewer_count + 1,
      total_views = total_views + 1,
      peak_viewers = greatest(peak_viewers, viewer_count + 1),
      updated_at = now()
  where id = new.live_id;
  return new;
end;
$$;

create trigger live_viewers_join
  after insert on public.live_viewers
  for each row execute function public.handle_viewer_join();

-- Update viewer count when someone leaves
create or replace function public.handle_viewer_leave()
returns trigger language security definer set search_path = public as $$
begin
  update public.live_streams
  set viewer_count = greatest(viewer_count - 1, 0),
      updated_at = now()
  where id = old.live_id;
  return old;
end;
$$;

create trigger live_viewers_leave
  after update of left_at on public.live_viewers
  for each row
  when (old.left_at is null and new.left_at is not null)
  execute function public.handle_viewer_leave();

-- Auto-set started_at when stream goes live
create or replace function public.handle_stream_live()
returns trigger language security definer set search_path = public as $$
begin
  if new.stream_status = 'live' and old.stream_status != 'live' then
    new.started_at := now();
  end if;
  if new.stream_status = 'ended' and old.stream_status != 'ended' then
    new.ended_at := now();
  end if;
  return new;
end;
$$;

create trigger live_streams_status_change
  before update of stream_status on public.live_streams
  for each row execute function public.handle_stream_live();

-- ===========================================================================
-- Realtime publication
-- ===========================================================================
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    -- Add live tables to realtime publication if not already members
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_comments'
    ) then
      alter publication supabase_realtime add table public.live_comments;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_reactions'
    ) then
      alter publication supabase_realtime add table public.live_reactions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_streams'
    ) then
      alter publication supabase_realtime add table public.live_streams;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_viewers'
    ) then
      alter publication supabase_realtime add table public.live_viewers;
    end if;
  end if;
end
$$;

-- ===========================================================================
-- Analytics view: live stream summary
-- ===========================================================================
create or replace view public.live_stream_analytics as
select
  s.id,
  s.host_id,
  s.title,
  s.stream_status,
  s.started_at,
  s.ended_at,
  s.viewer_count,
  s.peak_viewers,
  s.total_views,
  s.created_at,
  -- Duration in seconds (null if not ended)
  case
    when s.ended_at is not null then extract(epoch from (s.ended_at - s.started_at))::integer
    when s.started_at is not null then extract(epoch from (now() - s.started_at))::integer
    else 0
  end as duration_seconds,
  -- Comment count
  (select count(*) from public.live_comments c where c.live_id = s.id and not c.is_deleted) as comment_count,
  -- Reaction count
  (select count(*) from public.live_reactions r where r.live_id = s.id) as reaction_count,
  -- Unique viewers
  (select count(distinct user_id) from public.live_viewers v where v.live_id = s.id) as unique_viewers
from public.live_streams s;

-- ===========================================================================
-- Storage bucket for live recordings
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('live-recordings', 'live-recordings', false)
on conflict (id) do nothing;

-- Only authenticated users can upload to live-recordings
create policy "Users can upload live recordings"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'live-recordings');

-- Only the host can view their own recordings
create policy "Hosts can view own recordings"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'live-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
