-- Counting checks, and being able to revoke.
--
-- The QR and the public check caught the altered printout. Neither touches the
-- other half: a photocopy carries a genuine code and verifies genuinely, and
-- nothing printed can change that. These two tables are what can.
--
--   1. A row per check. The signal that a copy is circulating is not in any one
--      verification — it is that the same code was checked far more often than a
--      document gets checked. That is only visible if the checks are counted.
--
--   2. A revocation. Detecting a copy is worth little if nothing can be done
--      about it, and the same column answers the larger case: a permit that was
--      cancelled, superseded or issued in error went on verifying as genuine for
--      ever.

-- Who checked is deliberately NOT recorded.
--
-- The endpoint is public and unauthenticated, so the only thing there would be
-- to store is an IP address and a user agent — which would turn a verification
-- log into a record of who looked at whose permit, held for ever, on an
-- endpoint anybody can reach. The count and the times are the whole signal a
-- copy produces; the identity of the checker is not needed for it and is a
-- liability to keep. A deployment that later wants to localise a cluster of
-- checks is making a privacy decision, not adding a column.
create table document_verifications (
  id         bigserial primary key,
  -- Which of the three kinds, and the row inside it. Not a foreign key: one
  -- column cannot reference three tables, and a check that outlived whatever it
  -- was checking is still a check that happened.
  kind       text        not null check (kind in ('document', 'receipt', 'barangay_certificate')),
  subject_id uuid        not null,
  checked_at timestamptz not null default now()
);

-- The count for one document, which is what both the verify page and the
-- console read.
create index document_verifications_subject_idx
  on document_verifications (kind, subject_id, checked_at desc);

-- "What has been checked unusually often lately", which is the console's query.
create index document_verifications_recent_idx on document_verifications (checked_at desc);

-- Revocation lives on the document, not on the request.
--
-- The request really was completed — the office did the work and released
-- something. What is no longer good is the paper. Keeping it here means the
-- workflow state machine, the queues, the filters and the reports do not have
-- to learn a new status, and `completed` goes on meaning what it has always
-- meant.
alter table documents
  add column revoked_at     timestamptz,
  add column revoked_by     uuid references users(id) on delete set null,
  add column revoked_reason text;

alter table barangay_documents
  add column revoked_at     timestamptz,
  add column revoked_by     uuid references users(id) on delete set null,
  add column revoked_reason text;

-- A receipt is deliberately absent from both of these. It records that money
-- arrived, and money that arrived cannot be un-received: revoking one would be
-- the app asserting something it knows to be false. A reversed payment is a
-- refund, which this app does not do.
