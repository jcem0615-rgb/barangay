-- Half-finished applications.
--
-- Deliberately its own table rather than a 'draft' row in `requests`. A draft is
-- something the resident has not submitted and no office has been asked to look
-- at; keeping it out of `requests` means it cannot appear in a department queue
-- through a query that forgot to exclude it. The separation is the guarantee,
-- not a `status <> 'draft'` clause that every future query has to remember.
--
-- It also keeps reference numbers honest: a number is drawn from
-- request_counters when the resident actually submits, so a draft never
-- consumes one or shows a number that means nothing yet.

create table request_drafts (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid not null references users(id) on delete cascade,
  service_id  text not null references services(id) on delete cascade,
  form_values jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One draft per service per resident: tapping a service resumes what you had
  -- rather than starting a fresh copy each time and leaving a pile behind.
  unique (resident_id, service_id)
);

create index request_drafts_resident_idx on request_drafts (resident_id, updated_at desc);
