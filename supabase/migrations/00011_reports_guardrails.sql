-- 00011_reports_guardrails.sql
-- Server-side guarantees for the moderation workflow (Step 10).
-- RLS already decides *who* may act; these constraints decide *what* is
-- recorded, so a buggy or malicious client cannot corrupt the queue.

-- ===========================================================================
-- 1. You cannot report yourself
-- ===========================================================================
alter table public.reports
  drop constraint if exists reports_no_self;

alter table public.reports
  add constraint reports_no_self
  check (target_type <> 'user' or target_id <> reporter_id);

-- ===========================================================================
-- 2. One open report per reporter per target
--    Resolved/rejected reports may repeat — the same target can be reported
--    again later, by then under different circumstances.
-- ===========================================================================
drop index if exists public.reports_open_duplicate_idx;

create unique index reports_open_duplicate_idx
  on public.reports (reporter_id, target_type, target_id)
  where status in ('pending', 'under_review');

-- ===========================================================================
-- 3. Closing a report stamps who closed it and when; reopening clears both
-- ===========================================================================
create or replace function public.reports_finalize()
returns trigger
language plpgsql
as $$
begin
  -- A report is filed once: only the workflow status may change.
  if new.reporter_id is distinct from old.reporter_id
     or new.target_type is distinct from old.target_type
     or new.target_id   is distinct from old.target_id
     or new.reason      is distinct from old.reason
     or new.created_at  is distinct from old.created_at then
    raise exception 'Reports are immutable except for their status';
  end if;

  if new.status in ('resolved', 'rejected') then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  elsif new.status in ('pending', 'under_review') then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_finalize on public.reports;

create trigger reports_finalize
  before update of status on public.reports
  for each row
  execute function public.reports_finalize();
