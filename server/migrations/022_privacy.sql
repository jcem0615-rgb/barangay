-- The Data Privacy Act rights a resident can exercise themselves.
--
-- RA 10173 gives a data subject the right to be informed, to access, to
-- correct, to erasure or blocking, and to data portability. The privacy notice
-- already describes those; this is what makes them things a resident can
-- actually do rather than read about.
--
-- Erasure is the one that cannot be absolute, and pretending otherwise would be
-- the dishonest option. A released business permit is a public record the
-- municipality is required to keep, and a permit with no applicant on it is not
-- a record. So closing an account erases everything the app holds for its own
-- convenience and keeps what the law requires — and tells the resident, by
-- name, which is which.
create table privacy_closures (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  -- Kept alongside the id: the account is deactivated and its contact details
  -- erased, so without this there is no way to answer "who asked for this".
  requested_name text not null,
  reason         text,
  -- What the app deleted immediately, and what it had to keep. Written at the
  -- time so the record says what was true then, not what today's rules would do.
  erased         jsonb not null,
  retained       jsonb not null,
  created_at     timestamptz not null default now(),
  -- Set when the Data Protection Officer has reviewed it.
  reviewed_at    timestamptz,
  reviewed_by    uuid references users(id),
  note           text
);

create index privacy_closures_open on privacy_closures (reviewed_at nulls first, created_at);
