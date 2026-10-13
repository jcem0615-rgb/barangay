-- The barangay certificate, as a document somebody can actually hold.
--
-- Until now the barangay tier stopped one step short of the municipal one. A
-- request reached `released`, the resident was told to collect it, and the
-- barangay printed its own paper as it always had — so the one tier most
-- residents actually deal with was the tier whose output the app could not
-- verify, could not reproduce if the paper was lost, and could not show a bank
-- or an employer.
--
-- This closes that: the same shape as `documents` on the municipal side, kept
-- in its own table for the same reason `barangay_requests` is separate from
-- `requests` — a barangay row cannot appear in a municipal query through a
-- join somebody forgot to scope.

-- ---------------------------------------------------------------------------
-- The barangay's seal
--
-- A certificate without the barangay's own seal reads as unofficial, and no
-- seed can guess what it looks like. Same store, same rules and the same
-- narrow type set as the municipal seal: PNG and JPEG only, because those are
-- the two the PDF writer embeds, and a seal that cannot be drawn is worse than
-- none — nothing would say so until a resident opened a blank-looking
-- certificate.
-- ---------------------------------------------------------------------------
alter table barangays
  add column seal_key        text,
  add column seal_type       text,
  add column seal_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- The issued certificates
--
-- Written in the same transaction that moves the request to `released`.
--
-- `released` and not `ready`, deliberately. `ready` means the secretary has
-- prepared and dated the paper; `released` means the barangay has handed it
-- over — and the barangay takes its fee at the hall on collection, because
-- nothing is paid online at this tier. A PDF available at `ready` would hand a
-- resident the certificate without their ever collecting or paying for it,
-- which removes the only payment point the barangay has.
-- ---------------------------------------------------------------------------
create table barangay_documents (
  id           uuid primary key default gen_random_uuid(),
  -- One per request, as a database guarantee rather than something the release
  -- path has to remember. A status set to `released` twice cannot mint two.
  request_id   uuid not null unique references barangay_requests(id) on delete cascade,
  -- Looked up by whoever is holding the printout, like a municipal document's
  -- and a receipt's. The same public endpoint answers for all three.
  verification_code text not null unique,
  -- Which barangay issued it. Denormalised from the request on purpose: every
  -- read of this table from a barangay console filters on it, and a scope that
  -- depends on a join is a scope somebody can drop.
  barangay_id  text not null references barangays(id),
  issued_at    timestamptz not null default now(),
  issued_by    uuid references users(id) on delete set null,
  -- The rendered PDF, like `documents`. Stored rather than re-rendered: the
  -- certificate names the captain and the secretary who were in office when it
  -- was issued, and re-rendering it after an election would quietly reissue it
  -- over somebody else's name. Same reasoning as the receipt.
  file_name    text  not null,
  content      bytea not null,
  byte_size    integer not null
);

create index barangay_documents_barangay_idx
  on barangay_documents (barangay_id, issued_at desc);
