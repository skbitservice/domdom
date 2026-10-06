-- 00001_profiles.sql
-- Step 2: profiles, admin directory, shared helpers.
-- Apply with `supabase db push` (CLI) or paste into the SQL editor.

-- ===========================================================================
-- profiles — one row per auth.users row, created automatically by trigger.
-- ===========================================================================
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                constraint profiles_username_format check (username ~ '^[a-z0-9._]{3,30}$')
                constraint profiles_username_edges check (
                  username !~ '^\.' and username !~ '\.$' and username !~ '\.\.'
                ),
  full_name     text constraint profiles_full_name_len check (char_length(full_name) <= 60),
  bio           text constraint profiles_bio_len check (char_length(bio) <= 160),
  avatar_url    text,
  cover_url     text,
  website       text constraint profiles_website_len check (char_length(website) <= 200),
  is_private    boolean not null default false,
  is_verified   boolean not null default false,
  is_banned     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ===========================================================================
-- admin_users — who may use admin/moderation powers. Seeded manually only.
-- ===========================================================================
create table public.admin_users (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin', 'moderator', 'support')),
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- shared helpers
-- ===========================================================================

-- bumped automatically by the set_updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- SECURITY DEFINER so policies can read admin_users without RLS recursion.
-- Admin power is therefore decided here, in the database — never in the UI.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role in ('admin', 'moderator')
  );
$$;

-- Create a profile automatically after signup. Username comes from the
-- signup metadata when provided, otherwise from the email local part;
-- it is normalised to the allowed charset and made unique.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate     text;
  attempt       integer := 0;
begin
  base_username := lower(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  base_username := regexp_replace(base_username, '[^a-z0-9._]', '', 'g');
  base_username := trim(base_username, '.');
  base_username := left(base_username, 24);

  if char_length(base_username) < 3 then
    base_username := left(coalesce(base_username, '') || 'user', 30);
  end if;

  candidate := base_username;
  while exists (select 1 from public.profiles p where p.username = candidate)
        and attempt < 100 loop
    attempt := attempt + 1;
    candidate := left(base_username, 24) || attempt::text;
  end loop;

  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    candidate,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );

  return new;
end;
$$;

-- Users may edit their own row, but must never grant themselves
-- is_verified / is_banned. trusted roles (service role ⇒ auth.uid() is null,
-- or an admin) may change those flags.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;

  if new.is_verified is distinct from old.is_verified
     or new.is_banned is distinct from old.is_banned then
    if auth.uid() is not null and not public.is_admin() then
      new.is_verified := old.is_verified;
      new.is_banned := old.is_banned;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_protect_system_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ===========================================================================
-- indexes
-- ===========================================================================
create index profiles_full_name_idx on public.profiles (full_name);
create index profiles_created_at_idx on public.profiles (created_at desc);

-- ===========================================================================
-- row level security
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;

-- SELECT is intentionally public: a social network's directory (username,
-- avatar, bio, stats) must be readable by signed-out visitors too — this is
-- the one deliberate "public read" policy in the schema. Every mutation is
-- owner-only or admin-only, and banned/verified flags are trigger-protected.
create policy "Profiles are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy: profiles are only created by the signup trigger
-- (SECURITY DEFINER bypasses RLS as the table owner).
-- No DELETE policy: account deletion is an admin/service-role operation.

-- Admins see their own role row (used to render admin UI); membership itself
-- is granted manually by the project owner — clients can never insert here.
create policy "Read own admin role"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());
