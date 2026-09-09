-- Editing the municipal facts that rot.
--
-- Emergency hotlines, the holiday calendar and each office's address and hours
-- were seeded and then unreachable: correcting a wrong number meant editing
-- mockData.ts and reseeding the database. That is not a thing a municipality
-- can do, so in practice the numbers stay wrong. A hotline that rings nowhere
-- is worse than none at all, because a resident trusts it in the moment they
-- can least afford to.

-- Who changed what, and what it was before.
--
-- These rows are the whole safety net for this feature: an administrator can
-- now quietly point the fire hotline anywhere, and the only defence against a
-- mistake nobody notices is a record of the change with the old value still in
-- it. Append-only by convention — nothing in the app updates or deletes here.
create table admin_audit (
  id          bigserial primary key,
  actor_id    uuid not null references users(id),
  -- Kept alongside the id rather than joined at read time: an account can be
  -- renamed or removed, and the log must still say who did this.
  actor_name  text not null,
  -- 'hotline.create', 'holiday.delete', 'office.update', …
  action      text not null,
  -- The row acted on, in that table's own terms (a hotline id, a date, an
  -- office id).
  target      text not null,
  -- Null on a create; null on a delete's `after`.
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_recent on admin_audit (created_at desc, id desc);

-- Hotlines are now edited, so the columns that were only ever written by the
-- seed need to hold up against a form.
alter table emergency_contacts
  add constraint emergency_contacts_label_not_blank check (length(btrim(label)) > 0),
  add constraint emergency_contacts_agency_not_blank check (length(btrim(agency)) > 0),
  add constraint emergency_contacts_phone_not_blank check (length(btrim(phone)) > 0);

alter table holidays
  add constraint holidays_name_not_blank check (length(btrim(name)) > 0);
