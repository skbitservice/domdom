-- 00010_follow_notification_cleanup.sql
-- Step 3 (follow system): keep follow notifications in sync with follows rows.
--
-- Why a trigger instead of client-side deletes:
--   PostgreSQL applies the table's SELECT policy to DELETE targets as well,
--   and notifications are readable by the RECIPIENT only. So the actor
--   (e.g. someone who just unfollowed) can never delete the notification
--   they generated — a client-side cleanup DELETE matches 0 rows silently.
--   The trigger runs with SECURITY DEFINER (table-owner rights) so the
--   lifecycle stays consistent no matter who removes the follow row:
--   unfollow, declined request, or block (which clears follows both ways).

create or replace function public.on_follow_deleted()
returns trigger
language plpgsql
security definer
-- Deliberately empty search_path: every object below is schema-qualified.
set search_path = ''
as $$
begin
  delete from public.notifications
   where actor_id = old.follower_id
     and recipient_id = old.following_id
     and type in ('follow', 'follow_request');
  return old;
end;
$$;

-- Re-runnable: a previous partial apply may have created the trigger
-- without recording the migration.
drop trigger if exists follows_cleanup_notifications on public.follows;

-- Fires for every row removal: unfollow, decline, block cleanup.
create trigger follows_cleanup_notifications
  after delete on public.follows
  for each row
  execute function public.on_follow_deleted();
