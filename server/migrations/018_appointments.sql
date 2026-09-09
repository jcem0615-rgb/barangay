-- Booking a slot at the counter.
--
-- The app already saves a resident the paperwork; it does not yet save them the
-- queue. Plenty of municipal business still needs a person at a window — a
-- document collected in person, a permit signed, an interview for assistance —
-- and the way that works today is that everyone arrives at eight and waits.
--
-- An appointment is with an office, about a service, and optionally about a
-- request the office already holds.

-- What an office can take in a day. One row per office, rather than a row per
-- weekday: an LGU counter keeps the same hours all week, and the shape that
-- actually varies between offices is how many people they can see at once.
create table office_booking (
  department_id text primary key references departments(id) on delete cascade,
  -- An office that cannot take appointments says so, rather than publishing
  -- slots nobody is standing behind.
  enabled       boolean not null default true,
  opens         time not null default '08:00',
  closes        time not null default '16:00',
  slot_minutes  int  not null default 30,
  -- How many residents the office can see in one slot — the number of windows
  -- it can actually staff, which is the whole constraint being modelled.
  capacity      int  not null default 4,
  -- How far ahead booking opens. An office does not know its staffing three
  -- months out, and a slot promised that far ahead is not a promise.
  horizon_days  int  not null default 21,
  constraint office_booking_hours check (opens < closes),
  constraint office_booking_slot check (slot_minutes between 5 and 240),
  constraint office_booking_capacity check (capacity between 1 and 200),
  constraint office_booking_horizon check (horizon_days between 1 and 180)
);

create table appointments (
  id            uuid primary key default gen_random_uuid(),
  resident_id   uuid not null references users(id) on delete cascade,
  department_id text not null references departments(id),
  service_id    text not null references services(id),
  -- Set when the visit is about something the office already holds. Nulled
  -- rather than cascaded if that request goes away: the resident is still
  -- coming, and the office still has a slot filled.
  request_id    uuid references requests(id) on delete set null,
  scheduled_on  date not null,
  start_time    time not null,
  -- What the resident is called at the window: MTO-007. Drawn from a counter so
  -- a cancellation never hands the same number to somebody else.
  queue_no      text not null,
  -- booked → arrived → served, or no_show, or cancelled.
  status        text not null default 'booked',
  note          text,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  arrived_at    timestamptz,
  closed_at     timestamptz,
  constraint appointments_status check (status in ('booked', 'arrived', 'served', 'no_show', 'cancelled'))
);

-- The staff day view: one office, one day, in time order.
create index appointments_day on appointments (department_id, scheduled_on, start_time, queue_no);
-- A resident's own list, and the check that they are not already booked here.
create index appointments_resident on appointments (resident_id, scheduled_on desc);

-- Queue numbers, per office per day. Separate from the appointment rows so a
-- cancelled booking does not free its number for reuse — two people answering
-- to MTO-007 on the same morning is exactly the confusion a queue number exists
-- to prevent.
create table appointment_counters (
  department_id text not null references departments(id) on delete cascade,
  on_date       date not null,
  issued        int  not null default 0,
  primary key (department_id, on_date)
);

-- Every office starts bookable, with hours matching what the catalogue already
-- publishes. An office that cannot staff this turns itself off.
insert into office_booking (department_id)
select id from departments on conflict do nothing;
