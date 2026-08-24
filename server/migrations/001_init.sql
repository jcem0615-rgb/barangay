-- eLGU Citizen Portal — initial schema
-- Residents and municipal staff share one users table; role decides which shell
-- the app renders and which rows the API will hand back.

create extension if not exists pgcrypto;

create type user_role as enum ('resident', 'staff', 'admin');
create type request_status as enum (
  'draft', 'submitted', 'in_progress', 'for_payment', 'completed', 'rejected'
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null,
  password_hash text        not null,
  role          user_role   not null,
  full_name     text        not null,
  created_at    timestamptz not null default now()
);
-- Emails are compared case-insensitively; store as typed, match as lowered.
create unique index users_email_lower_key on users (lower(email));

create table resident_profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  philsys_id   text,
  barangay     text,
  municipality text,
  province     text,
  birth_date   date,
  address      text
);

create table departments (
  id          text primary key,
  name        text not null,
  office_name text not null,
  description text not null,
  icon        text not null,
  sort_order  int  not null default 0
);

-- A staff member can serve more than one office (small LGUs share people).
create table staff_assignments (
  user_id       uuid not null references users(id) on delete cascade,
  department_id text not null references departments(id) on delete cascade,
  position      text,
  primary key (user_id, department_id)
);

create table services (
  id                text primary key,
  department_id     text    not null references departments(id) on delete cascade,
  name              text    not null,
  short_description text    not null,
  processing_time   text    not null,
  -- Money is stored in centavos so fees stay exact; the API exposes pesos.
  fee_centavos      integer not null default 0 check (fee_centavos >= 0),
  requires_payment  boolean not null default false,
  requirements      jsonb   not null default '[]'::jsonb,
  fields            jsonb   not null default '[]'::jsonb,
  active            boolean not null default true
);

create table requests (
  id                 uuid primary key default gen_random_uuid(),
  reference_no       text unique not null,
  resident_id        uuid    not null references users(id) on delete cascade,
  service_id         text    not null references services(id),
  department_id      text    not null references departments(id),
  status             request_status not null default 'submitted',
  current_step_index int     not null default 0 check (current_step_index >= 0),
  fee_centavos       integer not null default 0 check (fee_centavos >= 0),
  paid               boolean not null default false,
  payment_method     text,
  form_values        jsonb   not null default '{}'::jsonb,
  rejection_reason   text,
  submitted_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index requests_resident_idx   on requests (resident_id, submitted_at desc);
create index requests_dept_queue_idx on requests (department_id, status, submitted_at);

-- Every status change is appended here, so a request's history is auditable
-- rather than inferred from its current row.
create table request_events (
  id         bigserial primary key,
  request_id uuid not null references requests(id) on delete cascade,
  actor_id   uuid references users(id) on delete set null,
  event_type text not null,
  from_step  int,
  to_step    int,
  note       text,
  created_at timestamptz not null default now()
);

create index request_events_request_idx on request_events (request_id, created_at);
