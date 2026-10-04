-- The barangay blotter, and the summons that come out of it.
--
-- This is Katarungang Pambarangay (RA 7160, Chapter 7): a dispute is brought to
-- the barangay, the Punong Barangay summons both sides, and most civil and
-- lesser criminal matters cannot be filed in court until that has been tried.
-- The blotter is the book it is all written in.
--
-- **This is the most defamatory data in the application.** A blotter entry names
-- a respondent — somebody accused of something, who has been found to have done
-- nothing at all. So it lives only in the barangay's own console: no resident
-- route reads it, no notification announces it, and nothing in the resident app
-- can discover that a name appears here. That is a deliberate inversion of the
-- rule everywhere else in this app, where a change notifies the resident in the
-- same transaction.
--
-- What this is NOT: the legal record. The prescribed KP forms, the Pangkat ng
-- Tagapagkasundo, the ten-day finality of an amicable settlement and the
-- Certificate to File Action are paper instruments with legal effect. This
-- records that the process happened and when; it does not conduct it and it
-- issues no certificate.

create type blotter_status as enum (
  -- Written in the book, nothing scheduled yet.
  'recorded',
  -- Summoned, hearing set, being mediated by the Punong Barangay.
  'mediation',
  -- The parties agreed. In law the settlement becomes final after ten days.
  'settled',
  -- Mediation failed, or a party would not appear. In law this is where a
  -- Certificate to File Action is issued, on paper, by the barangay.
  'unsettled',
  -- The complainant dropped it.
  'withdrawn',
  -- Not the barangay's to mediate: parties from different municipalities, an
  -- offence above the KP ceiling, a government party. Recorded so the book is
  -- complete, then sent where it belongs.
  'referred'
);

create table blotter_entries (
  id            uuid primary key default gen_random_uuid(),
  reference_no  text not null unique,
  -- Every query in the console filters on this, and it comes from the
  -- signed-in account's own row rather than from anything a caller passes.
  barangay_id   text not null references barangays(id),

  -- The parties are free text, deliberately, and not links to accounts.
  --
  -- A respondent usually has no account, and an app that matched them to one
  -- would become a place to look up what a named resident stands accused of.
  -- The barangay writes down who was in front of it, which is what the paper
  -- book holds too.
  complainant   text not null,
  complainant_contact text,
  respondent    text not null,
  respondent_address  text,

  -- What it is about, in the words of whoever brought it.
  nature        text not null,
  narrative     text not null,
  -- When the thing happened, which is not when it was reported.
  occurred_at   timestamptz,

  status        blotter_status not null default 'recorded',
  -- Why it ended the way it did: the terms agreed, or where it was referred.
  outcome_note  text,

  recorded_by   uuid references users(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index blotter_entries_book_idx
  on blotter_entries (barangay_id, recorded_at desc);
create index blotter_entries_status_idx
  on blotter_entries (barangay_id, status);

-- A summons to appear.
--
-- Separate from the entry because there is usually more than one: the law
-- expects the barangay to try again when somebody does not turn up, and the
-- third failure to appear is the point at which the matter stops being the
-- barangay's. Keeping them as rows means the book shows how many times a party
-- was actually called, which a single "hearing date" column would lose.
create type summons_outcome as enum (
  'pending', 'appeared', 'failed_to_appear', 'rescheduled', 'cancelled'
);

create table blotter_summons (
  id           uuid primary key default gen_random_uuid(),
  blotter_id   uuid not null references blotter_entries(id) on delete cascade,
  -- Denormalised from the entry so every scoped query can filter without a
  -- join, and so a summons can never be read through the wrong barangay even
  -- if a future query forgets the join.
  barangay_id  text not null references barangays(id),
  -- 1 for the first calling, 2 for the second, and so on.
  sequence     integer not null check (sequence >= 1),
  hearing_at   timestamptz not null,
  venue        text not null,
  note         text,

  -- Service is personal and the barangay does it. The app records *that* it
  -- happened, because an unserved summons is not a summons, and it is the
  -- thing a captain is asked about later.
  served_at    timestamptz,
  served_note  text,

  outcome      summons_outcome not null default 'pending',
  issued_by    uuid references users(id) on delete set null,
  issued_at    timestamptz not null default now(),
  unique (blotter_id, sequence)
);

create index blotter_summons_entry_idx on blotter_summons (blotter_id, sequence);
create index blotter_summons_day_idx on blotter_summons (barangay_id, hearing_at);

-- Reference numbers from a counter, like every other number here: a withdrawn
-- entry must not free its number for the next one. One counter per municipality
-- for the same reason barangay requests have one — a reference is quoted aloud
-- and has to mean one thing.
create table blotter_counters (
  year        integer primary key,
  last_number integer not null default 0
);
