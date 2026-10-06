-- 00016_post_like_notifications.sql
-- Liking a post notifies its owner; unliking withdraws that notification.
--
-- The notification itself is inserted by the client (policy "Notify as
-- yourself" in migration 00007) — but the *withdrawal* cannot be: a DELETE
-- target must pass the table's SELECT policy as well as its DELETE policy,
-- and notifications are only SELECTable by their recipient. The liker's own
-- DELETE would silently match 0 rows (PostgREST still answers 204) — exactly
-- the gotcha found in migration 00010. So the cleanup lives in a
-- SECURITY DEFINER trigger, which also keeps working when the like row is
-- removed by a cascade (block, account deletion, post deletion).

create or replace function public.posts_cleanup_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
   where type = 'like'
     and post_id = old.post_id
     and actor_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists likes_cleanup_notifications on public.likes;
create trigger likes_cleanup_notifications
  after delete on public.likes
  for each row
  execute function public.posts_cleanup_like_notification();

revoke all on function public.posts_cleanup_like_notification() from public;
grant execute on function public.posts_cleanup_like_notification() to postgres, service_role;
