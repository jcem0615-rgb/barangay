-- Emergency hotlines, printed on the digital ID.
--
-- A physical government ID carries a number to ring when something goes wrong,
-- and the digital one should too. These belong to the municipality — every LGU
-- has its own MDRRMO, police station and fire station — so they are rows to
-- seed rather than constants in the app, exactly like office addresses.
--
-- The national hotlines are included because a resident in trouble should not
-- have to know which level of government answers which emergency.

create table emergency_contacts (
  id          text primary key,
  -- What the resident is looking for: "Fire", "Ambulance", "Police".
  label       text not null,
  -- Who actually answers it, spelled out for someone who does not know the
  -- acronym: "Bureau of Fire Protection — San Fernando".
  agency      text not null,
  phone       text not null,
  -- Nationwide numbers are grouped apart, so a resident can tell at a glance
  -- which will still answer if the municipal line is down.
  is_national boolean not null default false,
  sort_order  int not null default 0
);
