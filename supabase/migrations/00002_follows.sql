-- 00002_follows.sql
-- Follow graph (with private-account follow requests) and the block list.

-- ===========================================================================
-- follows
-- ===========================================================================
create table public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_unique_pair unique (follower_id, following_id)
);

-- ===========================================================================
-- blocked_users
-- ===========================================================================
create table public.blocked_users (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);

-- ===========================================================================
-- helpers used by later policies
-- ===========================================================================

-- Has `target` accepted a follow from the current user?
create or replace function public.is_follower(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows f
    where f.following_id = target
      and f.follower_id = auth.uid()
      and f.status = 'accepted'
  );
$$;

-- Symmetric block check: returns true when either user blocked the other.
-- Safe with a NULL argument (signed-out visitors are never "blocked").
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocked_users bu
    where (bu.blocker_id = a and bu.blocked_id = b)
       or (bu.blocker_id = b and bu.blocked_id = a)
  );
$$;

-- ===========================================================================
-- triggers
-- ===========================================================================

-- Decide request status server-side: public account ⇒ instantly accepted,
-- private account ⇒ pending until the recipient accepts.
create or replace function public.set_follow_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.following_id and p.is_private) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end;
$$;

-- Only the recipient of a follow request may change its status
-- (accept / decline). The follower can only create or delete the row.
-- auth.uid() IS NULL means a trusted server-side role — allowed.
create or replace function public.guard_follow_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and auth.uid() <> old.following_id then
    raise exception 'Only the follow recipient can change the request status';
  end if;

  new.follower_id := old.follower_id;
  new.following_id := old.following_id;
  return new;
end;
$$;

create trigger follows_set_status
  before insert on public.follows
  for each row execute function public.set_follow_status();

create trigger follows_guard_update
  before update on public.follows
  for each row execute function public.guard_follow_update();

-- ===========================================================================
-- indexes
-- ===========================================================================
create index follows_follower_idx on public.follows (follower_id, status);
create index follows_following_idx on public.follows (following_id, status);
create index blocks_blocker_idx on public.blocked_users (blocker_id);
create index blocks_blocked_idx on public.blocked_users (blocked_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.follows enable row level security;
alter table public.blocked_users enable row level security;

-- Follower counts and follow lists are public information (they appear on
-- every profile), like any social network. Rows can only be created and
-- removed by the follower; status changes are trigger-guarded to the
-- recipient — so nobody can approve their own follow request.
create policy "Follow relationships are readable"
  on public.follows
  for select
  to anon, authenticated
  using (true);

create policy "Follow as yourself"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and not public.is_blocked(auth.uid(), following_id)
    and not exists (select 1 from public.profiles p where p.id = follower_id and p.is_banned)
  );

create policy "Update own follow rows"
  on public.follows
  for update
  to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid())
  with check (follower_id = auth.uid() or following_id = auth.uid());

create policy "Unfollow or remove follower"
  on public.follows
  for delete
  to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

-- Block list: only the blocker can see and manage their own entries.
create policy "Read own blocks"
  on public.blocked_users
  for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "Block as yourself"
  on public.blocked_users
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "Unblock as yourself"
  on public.blocked_users
  for delete
  to authenticated
  using (blocker_id = auth.uid());
