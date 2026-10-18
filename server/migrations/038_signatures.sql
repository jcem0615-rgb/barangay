-- The e-seal and the e-signature.
--
-- The seal already existed in two places — the municipality's, printed on an
-- official receipt, and each barangay's, printed on a certificate. Neither tier
-- had a signature, so every document this app issues came out with a name over
-- a ruled line and nothing on it. The names were already there; what was
-- missing was the mark.
--
-- A signature is stored exactly like a seal: a key into the object store, the
-- content type decided from the leading bytes, and when it was uploaded. It is
-- drawn into the PDF at the moment the document is issued and the PDF is kept,
-- so replacing a signature never reaches back into one somebody is holding.
--
-- **This is a picture of a signature, not a digital signature.** It makes the
-- paper look the way a counter expects; it does not make tampering detectable.
-- The verification code is still the only thing that proves a document, which
-- is why every screen that uploads one says so.

-- The treasurer signs the receipt. The name and title are already on this row.
alter table municipality
  add column treasurer_signature_key        text,
  add column treasurer_signature_type       text,
  add column treasurer_signature_updated_at timestamptz;

-- An office's head signs what that office releases.
--
-- Per office rather than one signatory for the whole hall, because a released
-- document already names the office that released it: the Civil Registrar signs
-- a civil registry document and the Treasurer signs a cedula, and a single
-- municipal signature on both would be wrong on at least one of them. Who holds
-- an office is the same kind of fact as how to reach it, which is why it sits
-- beside the address rather than in the service catalogue.
alter table departments
  add column head_name            text,
  add column head_title           text,
  add column signature_key        text,
  add column signature_type       text,
  add column signature_updated_at timestamptz;

-- The two officials a barangay certificate already goes out over.
alter table barangays
  add column captain_signature_key         text,
  add column captain_signature_type        text,
  add column captain_signature_updated_at  timestamptz,
  add column secretary_signature_key       text,
  add column secretary_signature_type      text,
  add column secretary_signature_updated_at timestamptz;
