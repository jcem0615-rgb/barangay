-- Reference numbers were derived from count(*) of a department's existing
-- requests. Under READ COMMITTED that does not serialize: concurrent
-- submissions all read the same count, produce the same reference, and all but
-- one fail on the unique index. Measured: 6 of 8 simultaneous submissions
-- failed with a 500.
--
-- This counter is incremented atomically instead. The row lock taken by the
-- upsert serializes only submissions to the same department in the same year,
-- which is exactly the scope a reference number needs to be unique over.

create table request_counters (
  department_id text not null references departments(id) on delete cascade,
  year          int  not null,
  last_number    int  not null default 0,
  primary key (department_id, year)
);

-- Seed from existing rows so numbering continues rather than colliding with
-- references already issued.
insert into request_counters (department_id, year, last_number)
select department_id, extract(year from submitted_at)::int, count(*)
  from requests
 group by department_id, extract(year from submitted_at)::int
on conflict do nothing;
