-- Deactivating an account instead of deleting it.
--
-- Staff appear in request_events as the actor on every assessment, advance and
-- rejection they made. Deleting someone who leaves would blank that history, so
-- access is revoked by marking the account instead.

alter table users add column deactivated_at timestamptz;

create index users_active_idx on users (id) where deactivated_at is null;
