-- ===========================================================================
-- 0015 · Chat: the creator was left out of their own group
-- ===========================================================================
-- Found while verifying Step 7 in the browser: create_group_chat (00012)
-- inserted only the *other* members, so the creator got no membership row.
-- list_my_conversations then returned nothing for the group it had just
-- created and the thread rendered "This conversation is not available."
--
-- Migration files are tracked by filename only (scripts/apply-migrations.mjs),
-- so 00012 cannot be re-applied — the corrected function is replaced here and
-- the groups already created by the bug are repaired below.
-- ===========================================================================

-- Same rules as 00012 (name length, real accounts, no self, no blocked pairs,
-- 50 people max) with one change: the membership insert now covers me plus
-- everyone I picked.
create or replace function public.create_group_chat(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  members uuid[];
  conv uuid;
begin
  if me is null then
    raise exception 'You must be signed in to create a group.';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 60 then
    raise exception 'Group names must be 1–60 characters.';
  end if;

  select coalesce(
    array_agg(distinct t.member_id)
      filter (where t.member_id is not null and t.member_id <> me),
    '{}'
  )
  into members
  from unnest(p_member_ids) as t(member_id);

  if coalesce(array_length(members, 1), 0) = 0 then
    raise exception 'Choose at least one person to add.';
  end if;
  if array_length(members, 1) > 49 then
    raise exception 'A group can hold up to 50 people.';
  end if;
  if exists (
    select 1
    from unnest(members) as t(member_id)
    where not exists (select 1 from public.profiles p where p.id = t.member_id)
  ) then
    raise exception 'One of the selected accounts no longer exists.';
  end if;
  if exists (
    select 1
    from unnest(members) as t(member_id)
    join public.blocked_users b
      on (b.blocker_id = me and b.blocked_id = t.member_id)
      or (b.blocker_id = t.member_id and b.blocked_id = me)
  ) then
    raise exception 'You cannot add this account to a group.';
  end if;

  insert into public.conversations (type, created_by, name)
  values ('group', me, clean_name)
  returning id into conv;

  -- The fix: everyone I picked *and* me.
  insert into public.conversation_members (conversation_id, user_id)
  select conv, t.member_id
  from unnest(array_append(members, me)) as t(member_id);

  return conv;
end;
$$;

grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Repair: give every group the membership row its creator should always have.
-- Scoped to groups (the only path that had the bug) so service-role DM
-- backfills that set created_by without joining the creator are untouched.
-- Runs as the migration role, which owns the tables, so RLS does not apply.
-- ---------------------------------------------------------------------------
insert into public.conversation_members (conversation_id, user_id, joined_at)
select c.id, c.created_by, now()
from public.conversations c
where c.type = 'group'
  and c.created_by is not null
  and not exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = c.id
      and m.user_id = c.created_by
  )
on conflict do nothing;
