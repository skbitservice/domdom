-- 00007_notifications_reports.sql
-- Notifications, user reports and the report workflow.

-- ===========================================================================
-- notifications
-- ===========================================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- Null actor = system-generated (e.g. auto moderation), written server-side.
  actor_id     uuid references public.profiles (id) on delete cascade,
  type         text not null
               check (type in (
                 'like', 'comment', 'follow', 'follow_request', 'mention',
                 'message', 'story_reply', 'reel_like'
               )),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  reel_id      uuid references public.reels (id) on delete cascade,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint notifications_target_present
    check (post_id is not null or comment_id is not null or reel_id is not null
           or type in ('follow', 'follow_request', 'mention', 'message', 'story_reply')),
  constraint notifications_no_self check (
    actor_id is null or actor_id <> recipient_id
  )
);

-- ===========================================================================
-- reports
-- ===========================================================================
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null
               check (target_type in ('user', 'post', 'comment', 'reel', 'story', 'message')),
  target_id    uuid not null,
  reason       text not null
               check (reason in (
                 'spam', 'harassment', 'hate', 'nudity', 'violence',
                 'scam', 'fake_account', 'copyright', 'other'
               )),
  description  text constraint reports_description_len check (char_length(description) <= 1000),
  status       text not null default 'pending'
               check (status in ('pending', 'under_review', 'resolved', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null
);

-- ===========================================================================
-- indexes
-- ===========================================================================
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id) where is_read = false;
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

-- Inbox: strictly recipient-only read and mark-as-read.
create policy "Read own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

create policy "Mark own notifications read"
  on public.notifications
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Anyone signed in may generate a notification for somebody else, but never
-- for themselves (constraint) and always as themselves (policy).
create policy "Notify as yourself"
  on public.notifications
  for insert
  to authenticated
  with check (actor_id = auth.uid() and recipient_id <> auth.uid());

-- Reports: the reporter sees their own reports; admins see and resolve all.
create policy "Read own or administered reports"
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

create policy "File reports as yourself"
  on public.reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Workflow transitions (pending → under_review → resolved/rejected) are
-- admin-only; reporters cannot edit a report after filing it.
create policy "Admins update reports"
  on public.reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete reports"
  on public.reports
  for delete
  to authenticated
  using (public.is_admin());
