-- A resident's complaint to their own barangay, with proof attached.
--
-- ---------------------------------------------------------------------------
-- Numbered 600 rather than 042, and that is the convention rather than a gap
--
-- This repository and the eLGU one both add migrations, and both were counting
-- from the same sequence — so the first time upstream reached 042 a merge would
-- have produced two different files claiming that number. The runner keys
-- `schema_migrations` on the **filename** and applies files in sorted order, so
-- a collision is not a conflict git would show: both files would be applied,
-- in alphabetical order of whatever each happened to be called.
--
-- **So the ranges are split. Upstream owns 000-599; this repository owns
-- 600-999.** New barangay migrations take the next free number from 600 up.
--
-- 600 rather than a letter prefix because the order has to stay right: this
-- file references `barangays(id)` and `users(id)` from 001 and 027, and
-- `600_` sorts after every `0xx_` while `b01_` would sort before them and
-- apply against tables that do not exist yet.
--
-- `npm run check:migrations` enforces both halves — no two files sharing a
-- number, and nothing this repository adds landing in upstream's range.
--
-- The barangay already had two books and neither was this one. The **blotter**
-- is Katarungang Pambarangay — a dispute brought to the counter and written
-- down by the secretary, so it starts with staff. The **notice board** runs the
-- other way, barangay to resident. What was missing was the direction a
-- resident actually needs most: something is wrong, here is a photograph of it,
-- and the captain should see it without my walking to the hall.
--
-- ---------------------------------------------------------------------------
-- What a complaint may say, and what follows from that
--
-- It is **free text and deliberately universal**: uncollected rubbish, a
-- streetlight out, a flooded path — or a neighbour, by name. That last one is
-- the whole reason the rules below exist, because it makes this table hold the
-- same kind of thing the blotter holds: somebody accused of something, who has
-- been found to have done nothing at all.
--
-- **But the resident wrote it, and that is the difference from the blotter.** A
-- blotter entry is the barangay's own account of a quarrel between two people,
-- so showing it to either of them discloses the other's side; a complaint is
-- its author's own words. Reading it back to that author discloses nothing they
-- do not already know, which is why — unlike the blotter — this one has a
-- resident read, a status they can follow, and a history they can see. What
-- would be wrong is the inverse, and it is what the schema refuses:
--
--   * **The person named is free text, never a link to an account.** Same rule
--     as the blotter's parties and the register's members, and for the same
--     reason: a foreign key here would turn this table into a way to ask what
--     a named resident stands accused of. There is no respondent column at all
--     — whoever is named is named inside `details`, as prose, where nothing can
--     query it.
--   * **Nobody is notified except the author.** The one notification this table
--     produces goes to `resident_id`, about their own complaint. Nothing
--     reaches the person complained about, because there is nothing to reach:
--     see above.
--   * **No other resident can read it**, and no route lists complaints by name,
--     by barangay, or at all, except the author's own and the barangay
--     console's own.
--
-- ---------------------------------------------------------------------------
-- Scoping
--
-- `barangay_id` is stamped from the signed-in resident's own row and every
-- console statement filters on the barangay from the signed-in staff account's
-- own row — so another barangay's complaint is *not found* rather than refused.
-- That is the structural rule the rest of that console already follows: there
-- is nowhere to name one.

create type barangay_complaint_status as enum (
  -- Filed by the resident; nobody at the hall has looked yet.
  'new',
  -- Somebody has read it and it is the barangay's to deal with.
  'acknowledged',
  -- Being worked on — the crew is out, the owner has been spoken to.
  'in_progress',
  -- Dealt with. Final.
  'resolved',
  -- Not the barangay's to act on, or nothing to act on. Final, and it has to
  -- say why: "closed" with no reason is the row somebody reconstructs from
  -- memory a year later with a resident in front of them asking what happened.
  'closed'
);

create table barangay_complaints (
  id           uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  -- From the resident's own row, never from the request body.
  barangay_id  text not null references barangays(id),
  resident_id  uuid not null references users(id) on delete cascade,
  -- A coarse bucket, for the figures the console leads with. Deliberately not
  -- an enum: what a barangay complains about is a per-town list, and a new
  -- bucket should be a value rather than a migration.
  category     text not null,
  -- Up to 1500 characters, which is the cap the deployment asked for and is
  -- enforced here as well as in the browser and the schema — a resident who
  -- types 1600 characters into a form that only warns loses the overflow
  -- silently, and this is the one field carrying what they actually want said.
  details      text not null check (length(details) between 1 and 1500),
  -- Where, in the resident's own words. There is no map pin: a barangay is a
  -- few streets and "the corner by the chapel" locates it better than a
  -- coordinate does, for the person who has to walk there.
  location     text,
  status       barangay_complaint_status not null default 'new',
  filed_at     timestamptz not null default now(),
  -- Who last moved it, and when. The full trail is in the history table.
  handled_by   uuid references users(id) on delete set null,
  handled_at   timestamptz,
  -- What the barangay told the resident. Shown to them, so it is written to be
  -- read by them.
  response     text
);

-- The console reads open-first then oldest-first, which is the order somebody
-- should work it; the resident reads their own, newest first.
create index barangay_complaints_queue_idx
  on barangay_complaints (barangay_id, status, filed_at);
create index barangay_complaints_resident_idx
  on barangay_complaints (resident_id, filed_at desc);

-- Reference numbers from a counter, like every other number in this app: a
-- complaint that was closed must not free its number for the next one. One
-- counter for the municipality rather than one per barangay, for the reason
-- `barangay_counters` gives — a reference is quoted down a phone and typed into
-- a search box, so `BCOM-2026-00001` has to mean one complaint.
create table barangay_complaint_counters (
  year        integer primary key,
  last_number integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Proof
--
-- The same shape as `incident_evidence`, because it is the same problem and
-- the pipeline behind it is already careful: type decided by magic bytes rather
-- than the filename, photos virus-scanned in memory, video streamed to disk and
-- hashed by streaming so a single upload cannot hold a gigabyte in memory.
--
-- What differs is the ceiling. Incident evidence allows thirty minutes, which a
-- phone cannot actually deliver inside the byte cap; a complaint allows **five**
-- (`MAX_COMPLAINT_VIDEO_SECONDS`). Five minutes of 1080p is a few hundred
-- megabytes, so for the first time the duration limit and the byte limit agree
-- about what will actually upload from a phone on mobile data.
create table barangay_complaint_evidence (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references barangay_complaints(id) on delete cascade,
  uploaded_by  uuid not null references users(id) on delete cascade,
  file_name    text    not null,
  content_type text    not null,
  byte_size    bigint  not null check (byte_size > 0),
  -- Null for a photograph. Seconds, as the browser read it off the file.
  duration_seconds integer,
  storage_key  text    not null unique,
  checksum     text    not null,
  uploaded_at  timestamptz not null default now()
);

create index barangay_complaint_evidence_idx
  on barangay_complaint_evidence (complaint_id, uploaded_at);

-- ---------------------------------------------------------------------------
-- The history, and why it is rows rather than columns
--
-- `handled_by` and `handled_at` say who touched it last, which is the wrong
-- question a week later. What a resident asks is "what has been done about it",
-- and what the barangay has to answer at an assembly is "how long did we take"
-- — both of which are a sequence, not a latest value. So every move writes a
-- row, **in the same transaction as the change**, which is the rule this app
-- follows for every notification and every audit entry: there is no half state
-- where the status moved and nothing records it.
--
-- `actor_name` is stored beside `actor_id` rather than joined at read time, the
-- same decision `admin_audit` makes: a clerk whose account is later revoked
-- must not erase who did what. `actor_id` goes null with the account; the name
-- stays.
--
-- The first row is the filing itself, with the resident as the actor, so the
-- trail starts where the complaint does rather than at the first staff action.
create table barangay_complaint_history (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references barangay_complaints(id) on delete cascade,
  -- Null on the filing row: nothing preceded it.
  from_status  barangay_complaint_status,
  to_status    barangay_complaint_status not null,
  -- What was said at this step. The response shown to the resident is the
  -- latest one of these that carries a note, kept on the parent row too so the
  -- common read needs no join.
  note         text,
  actor_id     uuid references users(id) on delete set null,
  actor_name   text not null,
  actor_role   text not null,
  created_at   timestamptz not null default now()
);

create index barangay_complaint_history_idx
  on barangay_complaint_history (complaint_id, created_at);
