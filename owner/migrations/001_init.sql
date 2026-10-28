-- The owner's registry.
--
-- This database belongs to the firm that sells the portal, not to any LGU,
-- and the separation is the whole point: it holds *about* deployments, never
-- anything *from* them. There is no resident here, no request, no certificate
-- and no row copied out of a customer's database — the only thing this service
-- ever reads from one is the counts its /api/ops/status endpoint publishes.
--
-- Keeping it in its own database rather than as tables inside a deployment is
-- the same decision as one-deployment-one-municipality: two things that share
-- no rows cannot leak into each other.

create table owner_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  name           text not null,
  password_hash  text not null,
  -- Who may change the registry. 'viewer' can read every deployment and print
  -- its poster but cannot add, edit or decommission one. Two directors do not
  -- need a role system; an accountant who should see the list does.
  role           text not null default 'owner' check (role in ('owner', 'viewer')),
  created_at     timestamptz not null default now(),
  deactivated_at timestamptz
);

create table deployments (
  id            uuid primary key default gen_random_uuid(),
  -- The handle everything else refers to. Short, lowercase, stable: it names
  -- the database, the env file and the container, so it is chosen once.
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  tier          text not null check (tier in ('municipal', 'barangay')),

  -- Identity, as the deployment itself will report it. These are compared
  -- against what the instance answers with, so a database wired to the wrong
  -- instance shows up here as a mismatch rather than going unnoticed.
  municipality_code     text not null,
  municipality_name     text not null,
  municipality_province text not null,
  -- Barangay tier only. The roster id and the name as the register has it.
  barangay_id   text,
  barangay_name text,

  -- Where residents actually reach it. The download QR is built from this and
  -- so is every certificate's verification link, which is why changing it
  -- after documents have been issued is called out in the UI.
  public_url    text not null,

  status        text not null default 'draft'
                check (status in ('draft', 'provisioning', 'live', 'suspended', 'decommissioned')),

  -- The bearer token for this deployment's /api/ops/status, encrypted at rest.
  -- It cannot be hashed like a password: this service has to *present* it. So
  -- it is sealed with OWNER_TOKEN_KEY and a leak of the database alone does
  -- not hand somebody a working token for every customer.
  ops_token_sealed text,

  contact_name  text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  notes         text not null default '',

  -- The last successful probe, kept on the row so the list renders without
  -- joining the history for every line.
  last_status   jsonb,
  last_seen_at  timestamptz,
  last_error    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  decommissioned_at timestamptz,
  decommission_reason text,

  -- A barangay deployment names a barangay; a municipal one must not.
  constraint barangay_fields_match_tier check (
    (tier = 'barangay'  and barangay_id is not null and barangay_name is not null) or
    (tier = 'municipal' and barangay_id is null     and barangay_name is null)
  )
);

-- One deployment per place. Two rows for the same barangay, or two for the
-- same municipality's hall, means somebody is about to point a second
-- instance at a database that already belongs to one.
create unique index deployments_place_idx
  on deployments (municipality_code, coalesce(barangay_id, '—'));

-- What was done to the registry, and by whom.
--
-- Every write is recorded in the same transaction as the change, with the row
-- as it was — the same rule and the same reasoning as admin_audit one level
-- down. An owner can point a customer's URL anywhere or decommission them by
-- mistake, and the only defence is a record that still has the old value.
create table deployment_events (
  id            bigserial primary key,
  deployment_id uuid references deployments(id) on delete set null,
  -- Kept as text as well, because a removed deployment leaves events behind
  -- and "which customer was that?" has to still have an answer.
  deployment_slug text not null,
  kind          text not null,
  summary       text not null,
  before        jsonb,
  after         jsonb,
  actor_id      uuid,
  actor_name    text not null default 'system',
  created_at    timestamptz not null default now()
);

create index deployment_events_deployment_idx
  on deployment_events (deployment_id, created_at desc);

-- Probe history: one row per check, so a deployment that is flapping looks
-- different from one that has been down since Tuesday.
create table deployment_checks (
  id            bigserial primary key,
  deployment_id uuid not null references deployments(id) on delete cascade,
  ok            boolean not null,
  http_status   int,
  error         text,
  -- The counts as reported. Stored so growth over time is answerable without
  -- a second system, and small enough that a year of hourly checks is fine.
  payload       jsonb,
  duration_ms   int,
  checked_at    timestamptz not null default now()
);

create index deployment_checks_deployment_idx
  on deployment_checks (deployment_id, checked_at desc);

create table owner_sessions (
  token_hash  text primary key,
  user_id     uuid not null references owner_users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index owner_sessions_user_idx on owner_sessions (user_id);
