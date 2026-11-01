-- The barangay's own logo, and the one mark here that residents see.
--
-- 601: the next free number in this repository's reserved range. Upstream owns
-- 000-599; see SPLIT.md and `npm run check:migrations`.
--
-- ---------------------------------------------------------------------------
-- Why this is not just a fourth signature slot
--
-- The three marks `barangays` already carries — the seal and the Punong
-- Barangay's and the Secretary's signatures — are **printed onto paper and
-- seen by nobody else**. They exist for the PDF writer, they are console-only
-- reads, and the rules around them are about what a certificate looks like at
-- a bank.
--
-- A logo is the opposite. It is the barangay's face *in the app*: behind the
-- dashboard, behind the digital ID, and on the bar at the top. So it is the
-- one mark with a **resident read**, and that single difference is what the
-- route layout has to express — `GET /barangay/logo`, scoped to the barangay
-- on the resident's own row, beside the seal's console-only route rather than
-- folded into it.
--
-- It is still stored exactly like the others: a key into the same object store
-- as attachments and portraits, with the sniffed type beside it, so one
-- storage implementation covers every image this app holds.
--
-- ---------------------------------------------------------------------------
-- What it is deliberately not
--
-- **It does not change the installed app's icon**, and nothing here pretends
-- otherwise. A PWA's icon and name are read from the manifest *at install* and
-- baked into the home screen; `server/BARANGAY-TIER.md` says the same thing
-- about the product name, and it is why `VITE_PRODUCT` is the one build-time
-- flag in a codebase that otherwise decides everything at runtime. A barangay
-- that uploads its logo gets it everywhere the running app draws, and the icon
-- a resident already added to their home screen stays what it was.

alter table barangays
  add column logo_key        text,
  add column logo_type       text,
  add column logo_updated_at timestamptz;
