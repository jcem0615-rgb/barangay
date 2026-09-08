-- Proving a digital ID belongs to the person holding the phone.
--
-- The ID carries a face and the resident's programme entitlements, and those
-- entitlements are worth money at a counter — a senior-citizen record is a 20%
-- statutory discount, a 4Ps record is a cash grant. A card that can be
-- screenshotted and shown by someone else is therefore worth faking.
--
-- So the ID displays a code that lives for ninety seconds and is consumed the
-- first time it is checked. A screenshot is stale before it reaches a counter,
-- and a code that has already been used cannot be presented twice.
--
-- Only the hash is stored, like password reset tokens: a leaked table yields no
-- usable codes.

create table id_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  code_hash    text not null unique,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Set the moment a staff member checks it; a second attempt then fails.
  consumed_at  timestamptz,
  -- Who checked it. Kept so a resident can be told who looked, and so a
  -- clerk running checks they have no business running is visible.
  verified_by  uuid references users(id) on delete set null
);

create index id_verifications_user_idx on id_verifications (user_id, issued_at desc);
-- Expired, unconsumed rows are noise; this makes the sweep cheap.
create index id_verifications_expiry_idx on id_verifications (expires_at) where consumed_at is null;
