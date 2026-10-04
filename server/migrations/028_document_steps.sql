-- How to get a document, in order.
--
-- `requirements` already said what to bring. It did not say where any of it
-- comes from, or which to get first — which is the question that actually costs
-- a resident a trip, because a Barangay Business Clearance has to exist before
-- the BOSS will look at a business permit and nothing in a flat checklist says
-- so.
--
-- jsonb rather than a steps table: a step is only ever read as a whole ordered
-- list belonging to one document, never queried across documents, and ordering
-- is the array's own. A table would buy a sort_order column and a join for
-- nothing.
alter table services
  add column steps jsonb not null default '[]'::jsonb;

alter table barangay_certificate_types
  add column steps jsonb not null default '[]'::jsonb;
