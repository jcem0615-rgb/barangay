-- Household records: the Record of Barangay Inhabitants.
--
-- The Local Government Code makes the barangay secretary keep an updated record
-- of every inhabitant of the barangay, and in practice it is what a barangay
-- actually works from — who to feed, who to evacuate, how many seniors live on
-- which purok. It has been a notebook or a spreadsheet on somebody's laptop.
--
-- **This is a directory of everyone, which is the thing the rest of this app
-- deliberately refuses to be.** The municipal side has no resident lookup on
-- purpose — programme enrolment is reached through a request precisely so that
-- no endpoint lists residents to search. The register is the one place that
-- rule cannot hold, because listing inhabitants is the whole function. So the
-- containment is the barangay boundary: a barangay keeps its own book, every
-- statement filters on the account's own barangay, and nothing here is readable
-- by the municipality, by another barangay, or by any resident.
--
-- Members are **not** linked to resident accounts. The paper register is the
-- barangay's own compilation of who lives where, and keeping it that way is
-- what stops this becoming a view onto the user table — which would hand a
-- barangay clerk a way to look up any account in the municipality.

create type household_status as enum ('active', 'moved', 'archived');

create table households (
  id           uuid primary key default gen_random_uuid(),
  barangay_id  text not null references barangays(id),
  -- Numbered within the barangay, unlike every other reference in this app.
  -- A certificate reference is quoted down a phone and typed into a municipal
  -- search box, so it has to identify one thing municipality-wide. A household
  -- number is an index into one barangay's own book and is never said outside
  -- it — "household 142" means the 142nd here, which is what a purok leader
  -- expects it to mean.
  household_no integer not null,

  -- Where it is. `purok` is the sub-division a barangay actually organises by;
  -- relief lists and evacuation are planned on it rather than on street names,
  -- which many barangays do not have.
  address      text not null,
  purok        text,

  head_name    text not null,
  contact      text,
  notes        text,

  status       household_status not null default 'active',
  -- Why it stopped being active. A register keeps its history: a household that
  -- moved away is not deleted, because next year's figures have to be
  -- comparable with this year's.
  status_note  text,

  recorded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (barangay_id, household_no)
);

create index households_book_idx on households (barangay_id, status, household_no);

create table household_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  -- Denormalised so a member can never be read through the wrong barangay even
  -- if a future query forgets the join, the same reason the summons table
  -- carries it.
  barangay_id   text not null references barangays(id),

  full_name     text not null,
  birth_date    date,
  sex           text check (sex in ('female', 'male')),
  -- To the head of the household, in the words the register uses.
  relationship  text not null,
  civil_status  text,
  occupation    text,

  -- The barangay's own note, for its own planning, and **not** the sectoral
  -- register. A PWD or 4Ps record that carries a statutory discount or a cash
  -- grant is issued by CSWDO and lives in `resident_programs`; a tick here is
  -- what the barangay wrote down when it visited. Keeping them apart is what
  -- stops a barangay clerk's checkbox reading as an entitlement at a counter.
  is_pwd        boolean not null default false,
  is_four_ps    boolean not null default false,
  is_voter      boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index household_members_household_idx on household_members (household_id);
create index household_members_name_idx on household_members (barangay_id, full_name);

-- Household numbers come from a counter per barangay, so a household that moved
-- away does not free its number for the next one — the same rule every other
-- number in this app follows, and here it is what keeps last year's figures
-- comparable with this year's.
create table household_counters (
  barangay_id text primary key references barangays(id) on delete cascade,
  last_number integer not null default 0
);
