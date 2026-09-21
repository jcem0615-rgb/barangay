-- Residency: one portal, one municipality — and one account per person in it.
--
-- Two rules that were previously nobody's job. A resident typed their
-- municipality into a free-text box that nothing ever read back, and a person
-- could register as many times as they had email addresses.

-- The municipality this deployment serves. Exactly one row, enforced by the
-- primary key: a second one would make "which municipality is this?" a question
-- with two answers, and every check below depends on it having one.
create table municipality (
  only_row  boolean primary key default true check (only_row),
  code      text        not null,
  name      text        not null,
  province  text        not null,
  seeded_at timestamptz not null default now()
);

-- Which municipality's register this account belongs to. Set by the server at
-- registration from the row above, never from the request body.
--
-- Null means the account predates this migration. Those were created by this
-- deployment, which has only ever served one municipality, so they are treated
-- as local; `npm run seed` backfills them with the served code.
alter table users add column municipality_code text;
create index users_municipality_code_idx on users (municipality_code);

-- The identity a duplicate would share: name, date of birth and mother's maiden
-- name, which is what a Philippine civil registry matches people on.
--
-- Only the hash is stored, like reset tokens and ID verification codes. The
-- mother's maiden name is an identity secret used as a security answer half the
-- country over; this app needs to compare it, never to read it, so it does not
-- keep it. See server/src/identity.ts for what that does and does not buy.
alter table resident_profiles add column identity_key text;

-- One database serves one municipality — that is what the single-row table
-- above settles — so the key needs no scope column to be correct. Partial,
-- because accounts registered before this migration have no key and must not
-- collide with each other.
create unique index resident_profiles_identity_key
  on resident_profiles (identity_key)
  where identity_key is not null;
