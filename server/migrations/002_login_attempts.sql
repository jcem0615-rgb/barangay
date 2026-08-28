-- Login throttling.
--
-- Attempts are recorded in Postgres rather than in process memory so the limit
-- holds across restarts and across multiple API instances behind a load
-- balancer — an in-memory counter would reset on deploy and be trivially
-- sidestepped by spreading attempts over instances.

create table login_attempts (
  id           bigserial primary key,
  -- Lowercased. Recorded even for addresses with no account, so a locked
  -- response can't be used to discover which emails are registered.
  email        text,
  ip           text        not null,
  succeeded    boolean     not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_email_idx on login_attempts (email, attempted_at desc)
  where succeeded = false;
create index login_attempts_ip_idx on login_attempts (ip, attempted_at desc)
  where succeeded = false;
-- Supports the periodic purge of rows that have aged out of every window.
create index login_attempts_purge_idx on login_attempts (attempted_at);
