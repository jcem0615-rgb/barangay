-- Reporting an incident, with evidence.
--
-- The hotlines are for the thing happening right now. This is the other half:
-- a flooded road, a downed line, a fire that is already out — something the
-- municipality needs to know about and act on, with a photograph or a video so
-- the office is not dispatching on a description alone.

create type incident_status as enum ('new', 'acknowledged', 'resolved', 'closed');

create table incident_reports (
  id           uuid primary key default gen_random_uuid(),
  -- Ours, and what a resident quotes when they ring to follow it up.
  reference_no text not null unique,
  reporter_id  uuid not null references users(id) on delete cascade,
  -- What kind of thing this is. Free text against a list the app offers rather
  -- than an enum: the list of things that go wrong in a municipality is not
  -- something a schema migration should be needed to extend.
  kind         text not null,
  description  text not null,
  -- Where it is, in the resident's own words. A municipality's landmarks are
  -- how people actually give directions, and a coordinate pair is no use to a
  -- driver who needs "the bridge past the public market".
  location     text,
  -- Optional, and only if the resident allowed it. Precise beats descriptive
  -- when it is there, and is absent far more often than not.
  latitude     double precision,
  longitude    double precision,
  status       incident_status not null default 'new',
  reported_at  timestamptz not null default now(),
  -- Who in the office picked it up, and what they did about it.
  handled_by   uuid references users(id) on delete set null,
  handled_at   timestamptz,
  office_note  text
);

create index incident_reports_status_idx   on incident_reports (status, reported_at desc);
create index incident_reports_reporter_idx on incident_reports (reporter_id, reported_at desc);

-- Evidence. Kept apart from `attachments` because that table hangs off a
-- request, and an incident is not one: nobody applied for anything, and there
-- is no fee, no workflow and no document at the end of it.
create table incident_evidence (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incident_reports(id) on delete cascade,
  uploaded_by  uuid not null references users(id) on delete cascade,
  file_name    text    not null,
  content_type text    not null,
  byte_size    bigint  not null check (byte_size > 0),
  -- Null for a photo. Seconds, for video, as the browser read it off the file.
  duration_seconds integer,
  -- Opaque and server-generated, never derived from the uploaded filename.
  storage_key  text    not null unique,
  checksum     text    not null,
  uploaded_at  timestamptz not null default now()
);

create index incident_evidence_incident_idx on incident_evidence (incident_id);

-- Reference numbers come from a counter, like request and queue numbers, so a
-- deleted report never frees its number for a second one to reuse.
create table incident_counters (
  year        integer primary key,
  last_number integer not null default 0
);
