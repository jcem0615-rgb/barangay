-- Supporting documents a resident attaches to a request.
--
-- Only metadata lives here. The bytes go to the storage backend (a directory
-- today, object storage later) keyed by storage_key — unlike released
-- documents, these are resident-supplied, arbitrarily many, and can be large,
-- which is exactly what a database is the wrong place for.

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests(id) on delete cascade,
  uploaded_by  uuid not null references users(id) on delete cascade,
  -- Which of the service's stated requirements this file is meant to satisfy.
  -- Free text rather than a foreign key: requirements are part of the service
  -- definition and are edited over time, and an attachment should keep the
  -- label it was filed under.
  requirement  text,
  file_name    text    not null,
  content_type text    not null,
  byte_size    integer not null check (byte_size > 0),
  -- Opaque, server-generated. Never derived from the uploaded filename, which
  -- would put a caller-controlled string into a filesystem path.
  storage_key  text    not null unique,
  -- SHA-256 of the stored bytes, so corruption or substitution is detectable.
  checksum     text    not null,
  created_at   timestamptz not null default now()
);

create index attachments_request_idx on attachments (request_id, created_at);
