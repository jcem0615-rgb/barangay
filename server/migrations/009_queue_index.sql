-- The queue now pages by keyset on (submitted_at, id) within a department, so
-- the index has to match that ordering or every page after the first degrades
-- into a sort of the whole department's history.

create index requests_dept_keyset_idx on requests (department_id, submitted_at, id);

-- Search matches a reference number off a printout. Postgres cannot use a plain
-- btree for a leading-wildcard ILIKE, so this supports it directly.
create extension if not exists pg_trgm;
create index requests_reference_trgm_idx on requests using gin (reference_no gin_trgm_ops);
