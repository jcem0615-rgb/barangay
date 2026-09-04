-- Sectoral registries and poverty-reduction programmes.
--
-- These are the memberships a Philippine LGU actually keeps on a resident:
-- 4Ps and the Listahanan indigent register on the poverty-reduction side, and
-- the sectoral lists (senior citizen, PWD, solo parent, farmer/fisherfolk,
-- indigenous peoples) that carry statutory discounts and priority lanes.
--
-- Membership is issued, never self-declared: a senior-citizen or 4Ps badge is
-- worth real money at a counter, so only the registering office may write one.

create table sectoral_programs (
  code          text primary key,
  name          text not null,
  -- 'poverty_reduction' | 'sectoral' — the ID groups them under two headings.
  kind          text not null,
  short_name    text not null,
  description   text not null,
  -- What the resident is entitled to. Shown under the badge on the digital ID.
  benefit       text not null,
  -- Registering office, e.g. 'Municipal Social Welfare and Development Office'.
  issuing_office text not null,
  -- Label for the programme's own number ('OSCA ID No.'), null when it has none.
  id_label      text,
  -- Solo-parent and PWD IDs are renewable; 4Ps and RSBSA entries are not.
  expires       boolean not null default false,
  sort_order    int not null default 0
);

create table resident_programs (
  user_id      uuid not null references users(id) on delete cascade,
  program_code text not null references sectoral_programs(code) on delete cascade,
  -- The number printed on the physical ID, when the programme issues one.
  reference_no text,
  enrolled_on  date not null default current_date,
  -- Null means it does not lapse; a past date renders as expired, not missing,
  -- so a resident can see they need to renew rather than assume it was dropped.
  valid_until  date,
  granted_by   uuid references users(id) on delete set null,
  granted_at   timestamptz not null default now(),
  note         text,
  primary key (user_id, program_code)
);

create index resident_programs_user_idx on resident_programs (user_id);
