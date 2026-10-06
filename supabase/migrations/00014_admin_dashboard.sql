-- 00014_admin_dashboard.sql
-- Step 11: the two account powers the admin dashboard needs.
--
-- Why functions and not a wider RLS policy: `profiles` lets people update
-- only their own row (`using (id = auth.uid())`), so an admin editing another
-- account matches zero rows — while simply opening that policy up would hand
-- every admin write access to *every* column (username, bio, avatar…), and a
-- bug in any policy could hand it to everyone. These SECURITY DEFINER
-- functions expose exactly two operations, each re-checking public.is_admin()
-- itself, so the database — never the dashboard — decides.

-- ===========================================================================
-- Ban / unban an account
-- ===========================================================================
create or replace function public.admin_set_ban(target uuid, banned boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change ban status' using errcode = '42501';
  end if;

  if banned then
    -- Nobody can ban themselves (that would be a self-service logout with
    -- extra steps), and accounts that hold admin rights are managed only
    -- through admin_users — never from the dashboard.
    if target = auth.uid() then
      raise exception 'You cannot ban your own account';
    end if;
    if exists (select 1 from public.admin_users a where a.user_id = target) then
      raise exception 'Accounts with admin rights are managed in admin_users, not here';
    end if;
  end if;

  update public.profiles
     set is_banned = banned
   where id = target
  returning * into updated;

  if not found then
    raise exception 'Account not found';
  end if;

  return updated;
end;
$$;

-- ===========================================================================
-- Grant / revoke the verified badge
-- ===========================================================================
create or replace function public.admin_set_verified(target uuid, verified boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change verification' using errcode = '42501';
  end if;

  if verified and target = auth.uid() then
    raise exception 'You cannot verify your own account';
  end if;

  update public.profiles
     set is_verified = verified
   where id = target
  returning * into updated;

  if not found then
    raise exception 'Account not found';
  end if;

  return updated;
end;
$$;

-- Both functions keep the protect_profile_columns trigger intact: it sees a
-- real admin (auth.uid() is still the caller's inside a SECURITY DEFINER
-- function, and is_admin() is true), so the flags are NOT reverted, while id
-- and created_at stay immutable as before.
