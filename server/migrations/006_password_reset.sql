-- Password reset.
--
-- Only a hash of each token is stored, so a database leak does not hand over
-- working reset links. Tokens are single-use and short-lived.

create table password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_user_idx on password_reset_tokens (user_id, created_at desc);

-- Sessions are stateless JWTs, so a reset alone would leave anyone already
-- holding a token signed in — exactly the person you are resetting to lock out.
-- Tokens issued before this moment are refused.
alter table users add column password_changed_at timestamptz not null default now();
