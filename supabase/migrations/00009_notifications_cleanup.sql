-- 00009_notifications_cleanup.sql
-- Step 3 (follow system): notification lifecycle.
--
-- * The recipient must be able to delete their own inbox entries (also used
--   by Step 8's "mark/clear notifications").
-- * The actor must be able to withdraw the notification they generated —
--   when someone unfollows or a request is declined, the 'follow' /
--   'follow_request' row disappears instead of going stale.

-- Postgres has no "create policy if not exists"; drop first so re-running
-- this migration against an already-provisioned database succeeds and the
-- policy definition above stays authoritative.
drop policy if exists "Delete own or withdrawn notifications"
  on public.notifications;

create policy "Delete own or withdrawn notifications"
  on public.notifications
  for delete
  to authenticated
  using (recipient_id = auth.uid() or actor_id = auth.uid());
