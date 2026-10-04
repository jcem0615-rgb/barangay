-- Two facts the barangay tier was missing, both about the moment a resident has
-- to act on something.
--
-- 1. "Ready for pickup" was the one status that asks a resident to travel, and
--    the only information attached to it was the barangay's name. No hours, no
--    address, no number to ring first. The municipal side solved this with
--    office details on every department; a barangay had a captain and a
--    secretary and nothing else, because those are printed on certificates and
--    the contact details were never needed until something said "come and
--    collect it".
--
-- 2. A certificate was good forever, which no barangay certificate is. A
--    clearance is honoured for a few months and then wanted fresh, and the
--    document guide actively sends residents to the municipal permit counter
--    holding one. An app that quietly implies a two-year-old clearance still
--    counts makes exactly the wasted trip the guide exists to prevent.

-- The barangay hall, as a resident needs it.
--
-- Contact details only, plus the two offices whose holders change at every
-- barangay election. The barangay's *name* is not here and is not editable:
-- that is the register's, the same rule that stops a browser naming the
-- municipality. Who the captain is, where the hall is and what it answers are
-- facts the barangay itself knows and the hall cannot maintain for 73 of them.
alter table barangays
  add column hall_address text,
  add column office_hours text,
  add column phone      text,
  add column email      text;

-- How long the document is good for once it has been issued.
--
-- Null means the barangay states no validity, which is a different thing from
-- "forever" and is said in those words on the screen. A deployment sets these
-- from its own practice; see DEPLOY.md.
alter table barangay_certificate_types
  add column validity_days integer
    check (validity_days is null or (validity_days > 0 and validity_days <= 3650));

-- When this particular certificate lapses.
--
-- Stamped when the barangay marks it ready, not when it is collected and not
-- when it was requested. `ready` is the point at which the secretary has
-- actually prepared and dated the paper, and the paper is what a bank reads —
-- so a resident who collects three weeks later has a certificate already three
-- weeks into its life, and the app says the same thing the document does.
-- Dating it from collection would have the app claim more validity than the
-- certificate carries, which is the one error here that costs somebody a trip.
--
-- Frozen onto the row like the fee, so changing a type's validity never rewrites
-- what an issued certificate says. A date rather than a timestamp: a certificate
-- lapses on a day, not at an hour.
alter table barangay_requests
  add column valid_until date;
