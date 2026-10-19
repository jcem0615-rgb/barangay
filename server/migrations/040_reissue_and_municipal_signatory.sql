-- Two things, both of which the last release left standing.
--
--   1. A withdrawal could not be undone. Revoking a document is final, which is
--      the right shape for a counter — "withdrawn, then not" is not something a
--      clerk can act on — but a document withdrawn *in error* stranded the
--      resident completely: no route re-released a completed request, so they
--      had to file again and, where there was a fee, pay again.
--
--   2. The municipality had a seal and no signature of its own. Each office's
--      head signs what that office releases and the treasurer signs a receipt;
--      the hall itself — the mayor, or whoever it names — signed nothing.

-- ---------------------------------------------------------------------------
-- Reissue
--
-- A reissue does NOT lift the revocation. The withdrawn document stays
-- withdrawn and goes on verifying as withdrawn for ever, because the paper is
-- out there and a counter holding it has to be told not to accept it. What a
-- reissue does is mint a *new* document: a new verification code, a new
-- rendered PDF, the seal and the signatures as they are today.
--
-- So a request may now hold more than one document, which is why the uniqueness
-- on request_id has to go. What replaces it is narrower and is the thing that
-- actually mattered: at most one document per request that is not withdrawn.
-- A partial unique index makes that a database guarantee rather than something
-- the reissue path has to remember, exactly as the one-settled-payment index
-- does.
alter table documents drop constraint documents_request_id_key;
alter table barangay_documents drop constraint barangay_documents_request_id_key;

create unique index documents_live_idx
  on documents (request_id) where revoked_at is null;
create unique index barangay_documents_live_idx
  on barangay_documents (request_id) where revoked_at is null;

-- Every read that wants "the current document for this request" orders by this.
create index documents_request_idx on documents (request_id, issued_at desc);
create index barangay_documents_request_idx
  on barangay_documents (request_id, issued_at desc);

-- Which document this one replaces.
--
-- Derivable from the timestamps, and deliberately not left that way: the public
-- check has to tell a counter holding a withdrawn printout whether a
-- replacement exists, and "there is a later row" is a weaker statement than
-- "this row was issued to replace that one". It also records the lineage, so a
-- document withdrawn and reissued twice reads as a chain rather than as three
-- unrelated papers.
alter table documents
  add column reissue_of uuid references documents(id) on delete set null;
alter table barangay_documents
  add column reissue_of uuid references barangay_documents(id) on delete set null;

create index documents_reissue_idx on documents (reissue_of);
create index barangay_documents_reissue_idx on barangay_documents (reissue_of);

-- A receipt is absent from this, as it is from the revocation columns, and for
-- the same reason: it records that money arrived. There is nothing to withdraw
-- and therefore nothing to reissue.

-- ---------------------------------------------------------------------------
-- The municipality's own signatory
--
-- Beside the municipal seal rather than in the catalogue, because who signs for
-- the hall is a fact about the hall — the same kind of fact as its address and
-- its telephone number, and the same decision the barangay already made by
-- putting its captain and its secretary on the `barangays` row.
--
-- It is a *second* block on a released document, beside the releasing office's
-- head. That an office has exactly one signatory was a documented limitation,
-- and a mayor signing a business permit alongside the licensing officer is the
-- ordinary arrangement it could not express.
--
-- The title is seeded and the name is not, which is the rule the office heads
-- already follow: a title is a fact about the office and survives an election,
-- while a name is a person who has never held it here. A document prints the
-- rule and the title with nothing over it until the hall fills a name in —
-- which is also what happens when the hall would rather sign by hand, or would
-- rather the mayor did not appear on every document it releases.
alter table municipality
  add column signatory_name            text,
  add column signatory_title           text not null default 'Municipal Mayor',
  add column signatory_signature_key   text,
  add column signatory_signature_type  text,
  add column signatory_signature_updated_at timestamptz;
