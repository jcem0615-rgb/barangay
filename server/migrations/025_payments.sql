-- Payments that the server establishes rather than the browser asserting.
--
-- POST /requests/:id/pay used to mark a request paid because the browser said
-- so, which made a permit free to anyone who could open a developer console.
-- The flow is now intent -> provider -> signed callback, and only the callback
-- settles anything.
--
-- Numbered 025 rather than filling the 023 gap: 024 is already applied on
-- deployments that ran the residency migration, and a migration that sorts
-- before an applied one reads as history that was rewritten.

create type payment_status as enum (
  'pending',    -- intent created, resident sent to the provider
  'settled',    -- the provider confirmed, and the request is paid
  'failed',     -- the provider confirmed a failure
  'mismatched'  -- confirmed for an amount that is not the one we priced
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests(id) on delete cascade,
  resident_id     uuid not null references users(id) on delete cascade,
  -- Ours, and what the resident quotes at a counter.
  reference       text not null unique,
  -- The provider's own id for the same payment, which is what somebody
  -- reconciling a bank statement actually has in front of them.
  provider        text not null,
  provider_ref    text,
  method          text,
  -- Read off the request's assessment when the intent was created. The
  -- callback's figure is compared against this and never replaces it.
  amount_centavos int  not null check (amount_centavos >= 0),
  status          payment_status not null default 'pending',
  created_at      timestamptz not null default now(),
  settled_at      timestamptz,
  -- Why a payment ended up failed or mismatched, for whoever has to sort it out.
  note            text
);

create index payments_request_idx on payments (request_id);
create index payments_status_idx  on payments (status, created_at desc);

-- One settled payment per request, as a database guarantee rather than
-- something the code has to remember. A provider retrying a callback is normal
-- behaviour, not an attack, and this is what makes the retry harmless.
create unique index payments_one_settled_per_request
  on payments (request_id) where status = 'settled';

-- Every callback the server accepted or refused.
--
-- The refusals matter as much as the settlements: a run of them is either a
-- misconfigured provider or somebody trying it on, and neither is visible if
-- the server quietly drops them.
create table payment_events (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,
  -- The provider's event id. Unique with the provider, so the same event
  -- arriving three times is recorded once and settles once.
  event_id    text not null,
  payment_id  uuid references payments(id) on delete set null,
  accepted    boolean not null,
  reason      text,
  payload     jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index payment_events_received_idx on payment_events (received_at desc);
