-- 00006_chat.sql
-- Direct/group conversations and messages.
-- Private Realtime channels will be authorized against these same policies
-- in Step 7 (realtime.messages policies are added there).

-- ===========================================================================
-- conversations
-- ===========================================================================
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'direct' check (type in ('direct', 'group')),
  -- Deviation from the sketch, added for security: without a creator there is
  -- no way to authorize the first member insert. Nullable so service-role
  -- backfills keep working.
  created_by uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  message_type    text not null default 'text'
                  check (message_type in ('text', 'image', 'video', 'file', 'voice')),
  content         text constraint messages_content_len check (char_length(content) <= 4000),
  media_url       text,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  constraint messages_content_or_media check (content is not null or media_url is not null)
);

-- ===========================================================================
-- helpers
-- ===========================================================================
-- SECURITY DEFINER on purpose: policies for conversations /
-- conversation_members / messages all ask this one question. A normal
-- (RLS-recurring) subquery against conversation_members from a policy on
-- conversation_members would be rejected as infinite recursion.
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conv
      and cm.user_id = auth.uid()
  );
$$;

-- ===========================================================================
-- indexes (chat hot path: messages of one conversation, oldest → newest)
-- ===========================================================================
create index conversation_members_user_idx on public.conversation_members (user_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Read: members only (covers conversation rows and member rows, so a
-- conversation list can render avatars/usernames of the other side).
create policy "Members read conversations"
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_member(id));

-- Write: the authenticated creator (default auth.uid() fills it on insert).
create policy "Create own conversation"
  on public.conversations
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Members update conversations"
  on public.conversations
  for update
  to authenticated
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

create policy "Members read member rows"
  on public.conversation_members
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

-- Insert: yourself always; add others only to conversations you created.
-- (Direct chat flow: insert conversation → insert own row → insert the
-- other user's row. The conversation is visible after your own row exists.)
create policy "Join or add members"
  on public.conversation_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

create policy "Update own membership"
  on public.conversation_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Leave or dissolve own membership"
  on public.conversation_members
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

-- Messages: strict member-only read/write, sender must be yourself.
create policy "Members read messages"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members send messages as themselves"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

create policy "Edit own messages"
  on public.messages
  for update
  to authenticated
  using (sender_id = auth.uid() and deleted_at is null)
  with check (sender_id = auth.uid());

create policy "Delete own messages"
  on public.messages
  for delete
  to authenticated
  using (sender_id = auth.uid());
