-- Feedback and complaints.
--
-- RA 11032 (the Ease of Doing Business and Efficient Government Service
-- Delivery Act) requires every government office to publish a Citizen's Charter
-- and to run a mechanism for feedback and complaints against it. The catalogue
-- is effectively the charter — services, fees, processing times, requirements,
-- all published and all what the app promises. This is the other half.
--
-- Note for whoever deploys this: the day counts below are placeholders. Set
-- them to the response times in this LGU's own Citizen's Charter.

-- How a finished transaction went. One per request: a rating is about a
-- transaction, and letting someone rate the same one five times makes the
-- figure meaningless.
create table feedback (
  request_id  uuid primary key references requests(id) on delete cascade,
  resident_id uuid not null references users(id) on delete cascade,
  -- 1 (very dissatisfied) to 5 (very satisfied). A full Client Satisfaction
  -- Measurement has prescribed dimensions; this is the single overall score.
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

create index feedback_department on feedback (created_at desc);

create table complaints (
  id            uuid primary key default gen_random_uuid(),
  -- Given to the resident so they can chase it, exactly like a request.
  reference_no  text not null unique,
  resident_id   uuid not null references users(id) on delete cascade,
  department_id text not null references departments(id),
  -- Set when the complaint is about something the office already holds.
  request_id    uuid references requests(id) on delete set null,
  category      text not null,
  body          text not null,
  status        text not null default 'open',
  -- The working-day deadline for the office to answer, computed at filing over
  -- the same calendar as everything else — an office is not late for a day the
  -- hall was shut.
  due_on        date not null,
  response      text,
  responded_by  uuid references users(id),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint complaints_status check (status in ('open', 'answered')),
  constraint complaints_category check (category in ('delay', 'conduct', 'fees', 'requirements', 'other'))
);

-- The office's own list, oldest first: a complaint that has been waiting
-- longest is the one to answer next.
create index complaints_queue on complaints (department_id, status, created_at);
create index complaints_resident on complaints (resident_id, created_at desc);

-- Reference numbers, per year, like requests.
create table complaint_counters (
  year   int primary key,
  issued int not null default 0
);
