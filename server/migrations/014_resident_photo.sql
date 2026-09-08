-- The portrait on a resident's digital ID.
--
-- A government ID that carries no face is not one a counter clerk can check
-- against the person holding it, which is most of what the digital ID is for.
--
-- Only the key is stored here; the bytes live in the same object store as
-- request attachments, so a photo is deleted the same way and an S3-backed
-- store would pick both up at once.
alter table resident_profiles add column photo_key  text;
alter table resident_profiles add column photo_type text;
alter table resident_profiles add column photo_updated_at timestamptz;
