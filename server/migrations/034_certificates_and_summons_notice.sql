-- Three things, in the order they were asked for.

-- 1. Telling the parties about a hearing.
--
-- The blotter deliberately notifies nobody: everywhere else in this app a
-- change writes a notification row in the same transaction, and here that would
-- mean telling somebody by push that they have been named in a live quarrel.
-- That rule is now relaxed for one case — a summons, where the whole point is
-- that two people have to know a date.
--
-- **It is relaxed without touching the rule that matters.** The parties are
-- still free text and still not linked to accounts, because a link would turn
-- this book into a way to look up what a named resident stands accused of. So
-- the reminder goes to a number or an address *the barangay typed in*, through
-- the same SMS and mail transports as everything else, and never through the
-- notifications table — which is keyed on a user id and would have required
-- finding an account to attach it to.
alter table blotter_entries
  add column respondent_contact text;

alter table blotter_summons
  -- That a reminder was sent, which is NOT that the summons was served.
  -- `served_at` above is the real record: the law wants personal service by the
  -- barangay, and a text message is a courtesy that makes the trip to serve it
  -- more likely to find somebody at home. Keeping them as two columns is the
  -- same reasoning that keeps service apart from outcome.
  add column notified_at   timestamptz,
  -- Which contacts it actually reached, and what failed. A reminder nobody can
  -- tell went nowhere is worse than none, because the barangay stops checking.
  add column notify_result text;

-- 2. A certificate catalogue that can be added to.
--
-- Until now `barangay_certificate_types` was seeded and then fixed: a barangay
-- could override the fee and nothing else, on the grounds that a clearance is
-- the same document everywhere and letting six offices invent their own would
-- make a resident's certificate depend on which street they live on.
--
-- That reasoning holds for the shared documents and does not hold for the ones
-- a particular barangay genuinely issues alone. So the column splits the two
-- rather than abandoning the rule:
--
--   barangay_id IS NULL  → the shared catalogue. The municipal administrator's
--                          to add, edit and withdraw; every barangay issues it.
--   barangay_id = 'x'    → barangay x's own. Theirs to manage, invisible to
--                          every other barangay and to residents elsewhere.
--
-- A barangay can therefore never edit or withdraw a shared document — the
-- statement that finds a row to change filters on its own barangay, so a shared
-- row is not found rather than refused, which is the rule the rest of that
-- console already follows.
alter table barangay_certificate_types
  add column barangay_id text references barangays(id) on delete cascade;

create index barangay_certificate_types_scope_idx
  on barangay_certificate_types (barangay_id, active);

-- Withdrawing is `active = false`, which the table already had. Nothing is ever
-- deleted: `barangay_requests.type_id` references this row, and a certificate
-- somebody was issued last year has to keep rendering its own name. A hard
-- delete would either orphan that request or refuse, and neither is what an
-- administrator means by "remove this from the list".
