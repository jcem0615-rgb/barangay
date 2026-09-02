-- Telling residents when something happens to their request.
--
-- Every notification is recorded here first, then delivered outward. The row is
-- the record: if email or SMS fails, the resident still sees it in the app, and
-- a failed send never costs the office its action.

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- Delivery preferences. Email is on by default because it is the address they
-- registered with; SMS is off until a number is supplied and confirmed by use.
alter table users add column notify_email boolean not null default true;
alter table users add column notify_sms boolean not null default false;
alter table resident_profiles add column phone text;
