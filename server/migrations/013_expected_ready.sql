-- Telling a resident when their document will be ready.
--
-- `processing_time` is prose for the counter ("3–5 working days"); these are the
-- same promise as numbers, so a date can be worked out instead of asking the
-- resident to count weekends themselves.
alter table services add column processing_days_min int not null default 0
  check (processing_days_min >= 0);
alter table services add column processing_days_max int not null default 0
  check (processing_days_max >= processing_days_min);

-- The estimate is re-based when the resident pays: an office is not late
-- because a permit sat unpaid for a week, and a date that ignores that blames
-- the office for the resident's own delay.
alter table requests add column paid_at timestamptz;

-- Backfill from the audit trail, which has recorded every payment all along.
update requests r
   set paid_at = e.created_at
  from (
    select request_id, min(created_at) as created_at
      from request_events where event_type = 'paid' group by request_id
  ) e
 where e.request_id = r.id and r.paid_at is null;

-- Non-working days. National holidays move every year by proclamation, and a
-- municipality declares its own — a founding anniversary or fiesta closes the
-- hall as surely as Christmas. Both live here so a wrong date is a row to fix
-- rather than a release to cut.
create table holidays (
  observed_on date primary key,
  name        text not null,
  -- true for a day this municipality declared, false for a national one.
  is_local    boolean not null default false
);
