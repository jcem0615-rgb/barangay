-- Where to push a notification for a resident.
--
-- The app tells residents it will let them know when a document is ready, and
-- until now that meant email and SMS — neither of which is configured in a
-- default install, so the promise was empty. A push subscription is per device
-- and per browser: the same person on a phone and a desktop is two rows, and
-- both should ring.
create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- The push service's URL for this browser. It is the identity of the
  -- subscription, so re-subscribing the same browser updates the row rather
  -- than quietly stacking up a second one that will ring twice.
  endpoint     text not null unique,
  -- The browser's public key and auth secret, which the payload is encrypted
  -- to. Without both, a push can only be a bare "something happened".
  p256dh       text not null,
  auth         text not null,
  -- So a resident can tell their phone from their laptop when revoking one.
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user on push_subscriptions (user_id);
