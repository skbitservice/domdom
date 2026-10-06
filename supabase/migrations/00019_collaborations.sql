-- 00019_collaborations.sql
-- Collab Posts & Collab Reels: invitations, acceptance and shared ownership.
--
-- One content row (posts / reels) is shared by design — a collaboration never
-- copies content, it only adds a `collaborators` row pointing at the same
-- content id, so likes / comments / shares / saves stay attached to the
-- original post or reel and appear on both profiles.

-- ===========================================================================
-- app_settings: configurable platform limits (admin-editable)
-- ===========================================================================
create table public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values ('max_collaborators', '5')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- Settings are non-secret platform configuration (like follow counts).
create policy "Settings are readable"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "Admins insert settings"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update settings"
  on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete settings"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- collaborators
-- ===========================================================================
create table public.collaborators (
  id              uuid primary key default gen_random_uuid(),
  content_type    text not null check (content_type in ('post', 'reel')),
  content_id      uuid not null,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  collaborator_id uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected', 'removed')),
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  removed_at      timestamptz,
  constraint collaborators_no_self check (owner_id <> collaborator_id)
);

-- One active (pending or accepted) collaboration per user per content —
-- this is the database-level duplicate-invitation guard.
create unique index collaborators_active_unique
  on public.collaborators (content_type, content_id, collaborator_id)
  where status in ('pending', 'accepted');

create index collaborators_content_idx
  on public.collaborators (content_type, content_id, status);
create index collaborators_collaborator_idx
  on public.collaborators (collaborator_id, status);
create index collaborators_owner_idx
  on public.collaborators (owner_id, status);

-- ===========================================================================
-- helper functions
-- ===========================================================================

-- Owner of a polymorphic content row (post or reel). SECURITY DEFINER so the
-- trigger can read the content table regardless of the caller's RLS rights.
create or replace function public.collab_content_owner(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'post' then (select user_id from public.posts where id = p_id)
    when 'reel' then (select user_id from public.reels where id = p_id)
  end;
$$;

-- Configurable per-content collaborator cap (app_settings.max_collaborators,
-- default 5). Change it from the admin dashboard or SQL — no deploy needed.
create or replace function public.max_collaborators()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value::int from public.app_settings where key = 'max_collaborators'),
    5
  );
$$;

-- ===========================================================================
-- triggers
-- ===========================================================================

-- INSERT guard: only the content creator may invite, the invitee must be a
-- real, not-banned account, blocked users can never be invited, duplicates
-- are refused and the collaborator cap is enforced.
create or replace function public.guard_collaborator_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_accepted_count integer;
begin
  v_owner := public.collab_content_owner(new.content_type, new.content_id);
  if v_owner is null then
    raise exception 'Content not found';
  end if;
  if v_owner <> new.owner_id or new.owner_id <> auth.uid() then
    raise exception 'Only the content creator can invite collaborators';
  end if;
  if new.owner_id = new.collaborator_id then
    raise exception 'You cannot collaborate with yourself';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.collaborator_id and not p.is_banned
  ) then
    raise exception 'This account cannot be invited';
  end if;
  if public.is_blocked(new.owner_id, new.collaborator_id) then
    raise exception 'You cannot invite a blocked user';
  end if;
  if exists (
    select 1 from public.collaborators c
    where c.content_type = new.content_type
      and c.content_id = new.content_id
      and c.collaborator_id = new.collaborator_id
      and c.status in ('pending', 'accepted')
  ) then
    raise exception 'This user is already invited to this content';
  end if;

  select count(*) into v_accepted_count
  from public.collaborators
  where content_type = new.content_type
    and content_id = new.content_id
    and status = 'accepted';
  if v_accepted_count >= public.max_collaborators() then
    raise exception 'This content already has the maximum number of collaborators';
  end if;

  return new;
end;
$$;

create trigger collaborators_guard_insert
  before insert on public.collaborators
  for each row execute function public.guard_collaborator_insert();

-- UPDATE guard: membership is immutable; status transitions are restricted
-- to the right party — only the invitee accepts or rejects, only the owner
-- removes (and the collaborator may leave).
create or replace function public.guard_collaborator_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.content_type is distinct from old.content_type
     or new.content_id is distinct from old.content_id
     or new.owner_id is distinct from old.owner_id
     or new.collaborator_id is distinct from old.collaborator_id then
    raise exception 'Collaboration membership cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      if old.status <> 'pending' or auth.uid() is null or auth.uid() <> old.collaborator_id then
        raise exception 'Only the invited collaborator can accept';
      end if;
      new.accepted_at := now();
    elsif new.status = 'rejected' then
      if old.status <> 'pending' or auth.uid() is null or auth.uid() <> old.collaborator_id then
        raise exception 'Only the invited collaborator can reject';
      end if;
    elsif new.status = 'removed' then
      if old.status <> 'accepted' or auth.uid() is null
         or (auth.uid() <> old.owner_id and auth.uid() <> old.collaborator_id) then
        raise exception 'Only the content owner can remove a collaborator';
      end if;
      new.removed_at := now();
    else
      raise exception 'Invalid collaboration status';
    end if;
  end if;

  return new;
end;
$$;

create trigger collaborators_guard_update
  before update on public.collaborators
  for each row execute function public.guard_collaborator_update();

-- Content deletion removes the collaboration from BOTH profiles: the cleanup
-- runs when the original post/reel row is deleted (creator-only action — RLS
-- on posts/reels already restricts the delete to the owner).
create or replace function public.cleanup_collaborators()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.collaborators
  where content_type = tg_argv[0] and content_id = old.id;
  return old;
end;
$$;

create trigger posts_cleanup_collaborators
  after delete on public.posts
  for each row execute function public.cleanup_collaborators('post');

create trigger reels_cleanup_collaborators
  after delete on public.reels
  for each row execute function public.cleanup_collaborators('reel');

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.collaborators enable row level security;

-- Collaboration membership is public information (like follows): it is shown
-- on both profiles and in the post/reel header.
create policy "Collaborations are readable"
  on public.collaborators
  for select
  to anon, authenticated
  using (true);

-- Only the content creator may invite (the trigger re-checks every rule).
create policy "Creator invites collaborators"
  on public.collaborators
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.collab_content_owner(content_type, content_id) = auth.uid()
  );

-- Accept / reject / remove are guarded by the UPDATE trigger to the right
-- party; RLS only asks that the caller is one of the two participants.
create policy "Owner or collaborator update"
  on public.collaborators
  for update
  to authenticated
  using (owner_id = auth.uid() or collaborator_id = auth.uid())
  with check (owner_id = auth.uid() or collaborator_id = auth.uid());

-- Owner removes a collaborator; a collaborator can also leave on their own.
create policy "Owner or collaborator delete"
  on public.collaborators
  for delete
  to authenticated
  using (owner_id = auth.uid() or collaborator_id = auth.uid());

-- ===========================================================================
-- notifications: collaboration types
-- ===========================================================================
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'like', 'comment', 'follow', 'follow_request', 'mention',
      'message', 'story_reply', 'reel_like', 'share',
      'collab_invite', 'collab_accept'
    ));

-- collab_invite / collab_accept always carry post_id or reel_id, so the
-- existing notifications_target_present check already covers them.
