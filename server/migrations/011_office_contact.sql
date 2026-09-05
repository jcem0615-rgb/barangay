-- Where to find an office when the app cannot help.
--
-- A citizen portal that can only be used inside itself is a dead end: someone
-- whose permit is stuck needs an address, an opening time and a number to ring.
-- These live on the department so they are catalogue data like everything else
-- an office publishes, and are edited by reseeding rather than in code.

alter table departments add column address text;
alter table departments add column hours   text;
alter table departments add column phone   text;
alter table departments add column email   text;
