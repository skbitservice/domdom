-- 00012_chat_realtime.sql
-- Step 7 (chat): group titles, conversation RPCs, live delivery and the
-- realtime authorization the 00006 header promised.
--
-- Every statement is idempotent so the file can be re-run against an already
-- provisioned database (it is only recorded in public.domdom_migrations after
-- it succeeds).

-- ===========================================================================
-- conversations: group titles (direct conversations keep name = null)
-- ===========================================================================
alter table public.conversations
  add column if not exists name text;

alter table public.conversations
  drop constraint if exists conversations_name_len;

alter table public.conversations
  add constraint conversations_name_len
  check (name is null or char_length(btrim(name)) between 1 and 60);

-- ===========================================================================
-- notifications: point a 'message' notification at the conversation it came
-- from, so the inbox can deep-link straight into the thread. Nullable: every
-- other notification type never sets it.
-- ===========================================================================
alter table public.notifications
  add column if not exists conversation_id uuid
  references public.conversations (id) on delete cascade;

-- ===========================================================================
-- live delivery: postgres_changes only streams tables that are members of the
-- supabase_realtime publication. Realtime then checks the table's SELECT
-- policy per subscriber (00006), so a channel filtered on conversation_id can
-- only deliver rows that subscriber may read — no extra policy needed here.
-- Idempotent: adding a table twice raises 42710, so check first.
-- ===========================================================================
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_members'
    ) then
      alter publication supabase_realtime add table public.conversation_members;
    end if;
  end if;
end
$$;

-- ===========================================================================
-- private channel authorization (typing indicators, presence)
-- ===========================================================================
-- Broadcasts on a private channel are authorized against realtime.messages —
-- this is what the header of 00006 referred to.
--
-- Never "alter table ... enable row level security" here: RLS is already on
-- and the realtime schema is locked down, so that statement fails with
-- "must be owner of table messages" and would abort everything after it
-- (Supabase docs → Realtime Authorization).
--
-- The topic is the channel name the client asks for, e.g.
-- "conversation:<uuid>"; the membership test below is deliberately written
-- with a text comparison so a malformed topic yields "not a member" instead
-- of a cast error.

drop policy if exists "conversation members can receive channel events"
  on realtime.messages;

create policy "conversation members can receive channel events"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) like 'conversation:%'
    and exists (
      select 1
      from public.conversation_members cm
      where cm.user_id = auth.uid()
        and cm.conversation_id::text = split_part((select realtime.topic()), ':', 2)
    )
  );

drop policy if exists "conversation members can publish channel events"
  on realtime.messages;

create policy "conversation members can publish channel events"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (select realtime.topic()) like 'conversation:%'
    and exists (
      select 1
      from public.conversation_members cm
      where cm.user_id = auth.uid()
        and cm.conversation_id::text = split_part((select realtime.topic()), ':', 2)
    )
  );

-- ===========================================================================
-- messages: block guard
-- ===========================================================================
-- Step 3 lets a block remove every follow row between two accounts, but chat
-- rows are older than the block. Without this guard a blocked pair could
-- still talk through an existing thread, so the sender's own INSERT refuses
-- instead — 42501, exactly like an RLS violation, before any row is written.
create or replace function public.messages_block_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.conversation_members cm
    join public.blocked_users b
      on (b.blocker_id = cm.user_id and b.blocked_id = new.sender_id)
      or (b.blocker_id = new.sender_id and b.blocked_id = cm.user_id)
    where cm.conversation_id = new.conversation_id
  ) then
    raise exception 'You cannot send messages in this conversation.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_block_guard on public.messages;

create trigger messages_block_guard
  before insert on public.messages
  for each row
  execute function public.messages_block_guard();

-- ===========================================================================
-- messages: notify once per conversation, not once per message
-- ===========================================================================
-- BEFORE INSERT, so "are there any messages yet?" still sees the empty
-- conversation — the first message notifies every other member with a
-- 'message' notification that deep-links to the thread. Later messages stay
-- silent: an inbox that pings for every line of a conversation is worse than
-- no inbox at all.
create or replace function public.messages_notify_new_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.messages m where m.conversation_id = new.conversation_id
  ) then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, conversation_id)
  select cm.user_id, new.sender_id, 'message', new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists messages_notify_new_conversation on public.messages;

create trigger messages_notify_new_conversation
  before insert on public.messages
  for each row
  execute function public.messages_notify_new_conversation();

-- ===========================================================================
-- messages: deleting a message destroys its content
-- ===========================================================================
-- The UI soft-deletes (deleted_at) so every member sees a tombstone instead
-- of a bubble vanishing, but the tombstone must not keep the text: relax the
-- 00006 check just enough that a deleted row may hold neither content nor
-- media. Rows that are not deleted behave exactly as before.
alter table public.messages
  drop constraint if exists messages_content_or_media;

alter table public.messages
  add constraint messages_content_or_media
  check (deleted_at is not null or content is not null or media_url is not null);

-- ===========================================================================
-- RPC: my conversations, newest activity first
-- ===========================================================================
-- One round trip for the inbox: my membership row, the last message and the
-- unread count are all computed in the database. SECURITY INVOKER on purpose
-- — every row still has to pass the RLS policies of 00006, so this function
-- cannot leak a conversation the caller is not a member of.
create or replace function public.list_my_conversations(p_conversation_id uuid default null)
returns table (
  conversation_id uuid,
  conversation_type text,
  conversation_name text,
  created_by uuid,
  created_at timestamptz,
  last_read_at timestamptz,
  last_message_at timestamptz,
  last_message text,
  last_message_sender_id uuid,
  unread_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.type,
    c.name,
    c.created_by,
    c.created_at,
    mine.last_read_at,
    last_msg.created_at,
    last_msg.content,
    last_msg.sender_id,
    coalesce(unread.cnt, 0)
  from public.conversation_members mine
  join public.conversations c
    on c.id = mine.conversation_id
  left join lateral (
    select m.created_at, m.content, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  left join lateral (
    select count(*) as cnt
    from public.messages m
    where m.conversation_id = c.id
      and m.sender_id <> mine.user_id
      and m.created_at > coalesce(mine.last_read_at, timestamptz '-infinity')
  ) unread on true
  where mine.user_id = auth.uid()
    and (p_conversation_id is null or c.id = p_conversation_id)
  order by coalesce(last_msg.created_at, c.created_at) desc;
$$;

grant execute on function public.list_my_conversations(uuid) to authenticated;

-- ===========================================================================
-- RPC: unread message total for the nav badge
-- ===========================================================================
create or replace function public.unread_message_count()
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from public.messages m
  join public.conversation_members mine
    on mine.conversation_id = m.conversation_id
   and mine.user_id = auth.uid()
  where m.sender_id <> auth.uid()
    and (mine.last_read_at is null or m.created_at > mine.last_read_at);
$$;

grant execute on function public.unread_message_count() to authenticated;

-- ===========================================================================
-- RPC: open (or reuse) a direct conversation
-- ===========================================================================
-- SECURITY DEFINER because the client would otherwise need three writes in a
-- row (conversation → my membership → theirs) and two racing clients could
-- create the same thread twice. Everything the caller cannot be trusted with
-- is re-checked here, and the advisory lock serialises the find-or-create.
create or replace function public.start_conversation_with(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  conv uuid;
begin
  if me is null then
    raise exception 'You must be signed in to start a conversation.';
  end if;
  if p_target is null or p_target = me then
    raise exception 'You cannot start a conversation with that account.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'That account no longer exists.';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = me and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = me)
  ) then
    raise exception 'You cannot message this account.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'domdom_direct:' || least(me, p_target)::text || ':' || greatest(me, p_target)::text,
      0
    )
  );

  select c.id into existing
  from public.conversations c
  where c.type = 'direct'
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = me
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = p_target
    )
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.conversations (type, created_by)
  values ('direct', me)
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me), (conv, p_target);

  return conv;
end;
$$;

grant execute on function public.start_conversation_with(uuid) to authenticated;

-- ===========================================================================
-- RPC: create a group conversation
-- ===========================================================================
-- Only the creator may add other people (policy "Join or add members" in
-- 00006), so this runs as definer with the membership rules spelled out:
-- real accounts, no self, no blocked pairs, 50 people max.
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

  insert into public.conversation_members (conversation_id, user_id)
  select conv, t.member_id
  from unnest(members) as t(member_id);

  return conv;
end;
$$;

grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
