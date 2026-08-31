-- Released e-documents.
--
-- The PDF bytes are stored rather than regenerated on demand: a released
-- clearance is a record of what the LGU issued at that moment. If it were
-- rebuilt from the request row, a later edit to that row would silently change
-- a document a resident already holds.
--
-- These are small (tens of KB) and there is at most one per completed request,
-- so bytea is appropriate here. Resident-uploaded attachments would not be —
-- those belong in object storage.

create table documents (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null unique references requests(id) on delete cascade,
  -- Printed on the document and used by the public verification endpoint.
  -- Long and random so the endpoint cannot be enumerated.
  verification_code text not null unique,
  file_name         text not null,
  content           bytea not null,
  byte_size         integer not null,
  issued_at         timestamptz not null default now(),
  issued_by         uuid references users(id) on delete set null
);

create index documents_verification_idx on documents (verification_code);
