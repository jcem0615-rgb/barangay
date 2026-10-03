-- The barangay tier.
--
-- Until now this app was the municipal hall only, which left out the counter
-- most residents actually use: a barangay clearance or a certificate of
-- indigency, from an office two streets away. Both tiers now live here, kept
-- apart on screen so nobody has to know which level of government owns what
-- before they can start.

create table barangays (
  id                text primary key,
  name              text not null,
  -- Which municipality's barangay this is. A barangay belongs to exactly one,
  -- and the residency rules already settled which municipality this deployment
  -- serves.
  municipality_code text not null,
  -- Printed on every certificate the barangay issues, which is why they are
  -- fields rather than a setting somebody edits in the database.
  captain           text,
  secretary         text,
  created_at        timestamptz not null default now()
);

-- Which barangay a resident lives in, and which one a barangay officer works
-- for. One column serves both because the question is the same: whose barangay
-- is this account's.
--
-- Null for municipal staff and for residents who registered before barangays
-- existed — the app asks them the next time they request a barangay service
-- rather than guessing from the free-text barangay name they typed.
alter table users add column barangay_id text references barangays(id);
create index users_barangay_idx on users (barangay_id);

-- Barangay staff are their own roles, not municipal staff with an extra flag.
-- The shells they see are different, the data they may touch is different, and
-- a role that means two things is the kind that leaks one into the other.
--
-- Added here and used from the seed, which runs in a separate transaction:
-- Postgres will not let a value be added and used in the same one.
alter type user_role add value if not exists 'barangay_admin';
alter type user_role add value if not exists 'barangay_officer';

-- What a barangay issues. Shared across barangays — a clearance is the same
-- document in all of them — with the fee as the one thing a barangay overrides,
-- because that genuinely varies and the rest does not.
create table barangay_certificate_types (
  id           text primary key,
  name         text not null,
  description  text not null,
  fee_centavos integer not null default 0 check (fee_centavos >= 0),
  purpose_hint text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true
);

create table barangay_certificate_fees (
  barangay_id  text not null references barangays(id) on delete cascade,
  type_id      text not null references barangay_certificate_types(id) on delete cascade,
  fee_centavos integer not null check (fee_centavos >= 0),
  primary key (barangay_id, type_id)
);

create type barangay_request_status as enum (
  'pending', 'processing', 'ready', 'released', 'rejected'
);

create table barangay_requests (
  id           uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  -- The barangay that will issue it. Every query a barangay officer makes is
  -- filtered on this, and it is set from the resident's own record rather than
  -- from anything the request body says.
  barangay_id  text not null references barangays(id),
  resident_id  uuid not null references users(id) on delete cascade,
  type_id      text not null references barangay_certificate_types(id),
  purpose      text not null,
  -- Read off the type (or the barangay's override) when the request was made,
  -- so a later fee change does not silently rewrite what somebody was quoted.
  fee_centavos integer not null default 0 check (fee_centavos >= 0),
  status       barangay_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  handled_by   uuid references users(id) on delete set null,
  -- The reason, when it was refused; the note, when it was not.
  note         text
);

create index barangay_requests_queue_idx
  on barangay_requests (barangay_id, status, requested_at);
create index barangay_requests_resident_idx
  on barangay_requests (resident_id, requested_at desc);

-- Reference numbers come from a counter, like every other number in this app:
-- a cancelled request must not free its number.
--
-- One counter for the whole municipality rather than one per barangay. Numbering
-- per barangay reads nicer from inside one, but it makes BRGY-2026-00001 mean
-- six different requests, and `reference_no` above promises it means one. A
-- reference is quoted down a phone and typed into a search box, so it has to
-- identify a request on its own; how many a barangay has issued is a count, and
-- the summary already answers that.
create table barangay_counters (
  year        integer primary key,
  last_number integer not null default 0
);
