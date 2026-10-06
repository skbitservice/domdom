-- 00017_comment_notifications.sql
-- Commenting on a post notifies its owner; deleting the comment withdraws
-- that notification.
--
-- Same pattern as 00016: the notification is inserted by the client, but
-- the withdrawal must go through a SECURITY DEFINER trigger because the
-- comment author can never SELECT the notification (recipient-only RLS).
-- The trigger also handles cascades (post deletion, account deletion).

create or replace function public.comments_cleanup_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
   where type = 'comment'
     and comment_id = old.id
     and actor_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists comments_cleanup_notifications on public.comments;
create trigger comments_cleanup_notifications
  after delete on public.comments
  for each row
  execute function public.comments_cleanup_notification();

revoke all on function public.comments_cleanup_notification() from public;
grant execute on function public.comments_cleanup_notification() to postgres, service_role;
