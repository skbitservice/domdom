-- 00011_realtime_notifications.sql
-- Step 8 (notifications): stream inbox changes to the browser.
--
-- postgres_changes only delivers rows for tables that are members of the
-- supabase_realtime publication. Realtime then enforces the table's SELECT
-- policy per subscriber, so a channel filtered on recipient_id = eq.<uid>
-- can only ever deliver the signed-in user's own notifications.
--
-- Idempotent: if the table is already a member (e.g. it was enabled from the
-- dashboard) Postgres raises 42710 (duplicate_object) — skip instead so
-- re-running this file against a provisioned database succeeds.

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
