-- The electronic official receipt.
--
-- A payment settled, the request moved on, and the resident was left with a
-- reference number and nothing to show anybody. Every other thing this app
-- issues — a released document, a certificate, a queue number — produces
-- something the resident can hold; money, which is the one transaction they are
-- most likely to be asked to prove, produced nothing.
--
-- What this is and is not, stated here because it is the sort of thing that
-- gets assumed later: this is the portal's own receipt for a payment the server
-- confirmed. A Philippine LGU's Official Receipt is an *accountable form*, and
-- issuing one electronically is something the municipality must be authorised
-- to do — BIR accreditation where it applies, COA concurrence for the form
-- itself. Nothing here grants that authority. `receipt_form_label` below is
-- deliberately null by default so the receipt cites no accountable form number
-- until the municipality fills in the one it was actually issued.

-- ---------------------------------------------------------------------------
-- What the municipality prints on it
--
-- The single-row municipality table already carries what the register decides —
-- the code, the name and the province — and those stay where they are: what a
-- place is called is not a thing an administrator retypes, which is the same
-- rule the barangay's own name follows one tier down.
--
-- Everything added here is the opposite: facts the municipality knows, that
-- change with an election or an office move, and that no seed can keep correct.
-- ---------------------------------------------------------------------------
alter table municipality
  -- The hall, as it should read on a receipt somebody files for seven years.
  add column address            text,
  add column phone              text,
  add column email              text,
  add column website            text,
  -- Printed on official receipts in the Philippines as a matter of course.
  add column tin                text,
  -- Who the receipt is issued over. A treasurer's name is on every OR, and it
  -- changes without warning.
  add column treasurer_name     text,
  add column treasurer_title    text not null default 'Municipal Treasurer',
  -- The series. One counter for the municipality, like every other number here.
  add column receipt_prefix     text not null default 'OR'
    check (receipt_prefix ~ '^[A-Z][A-Z0-9-]{0,11}$'),
  -- The accountable form the municipality is authorised to cite, if any. Null
  -- prints nothing: a form number this app invented would be worse than a
  -- receipt that claims to be no form at all.
  add column receipt_form_label text,
  -- The municipality's own words at the foot of the receipt.
  add column receipt_footer     text,
  -- The seal. An uploaded image, in the same object store as a resident's ID
  -- portrait, because a seal is a small picture and the store already exists.
  add column seal_key           text,
  add column seal_type          text,
  add column seal_updated_at    timestamptz;

-- ---------------------------------------------------------------------------
-- The series
--
-- One counter for the whole municipality, for the reason every other counter
-- here is: a receipt number is read down a phone and typed into a search box,
-- so it has to identify one payment. Per-office numbering would make OR-2026-
-- 000001 mean six different receipts.
--
-- A counter rather than count(*): concurrent settlements all read the same
-- count and all but one collide on the unique index. The row lock the upsert
-- takes serialises exactly the scope the number must be unique over.
-- ---------------------------------------------------------------------------
create table receipt_counters (
  year        int not null primary key,
  last_number int not null default 0
);

-- ---------------------------------------------------------------------------
-- The receipts
--
-- Written in the same transaction that settles the payment. A settled payment
-- always has a receipt and there is no half state where money arrived and
-- nothing says so — the same rule notifications follow everywhere else here.
-- ---------------------------------------------------------------------------
create table receipts (
  id             uuid primary key default gen_random_uuid(),
  -- One receipt per payment, as a database guarantee rather than something the
  -- settlement code has to remember. A gateway retrying its callback is normal
  -- behaviour, and this is what makes the retry harmless here too.
  payment_id     uuid not null unique references payments(id) on delete cascade,
  request_id     uuid not null references requests(id) on delete cascade,
  receipt_no     text not null unique,
  -- Looked up by anyone holding the printout, like a released document's.
  verification_code text not null unique,

  -- Everything below is frozen at issue.
  --
  -- A receipt is a record of what was said at the time. Re-rendering it from
  -- the municipality's current row would quietly reprint last year's receipt
  -- over this year's treasurer's name and this year's seal, which is the one
  -- thing a receipt must never do. Same reasoning as the fee frozen onto a
  -- barangay request and the validity period frozen onto a certificate.
  issued_to          text not null,
  issued_to_address  text,
  particulars        text not null,
  amount_centavos    int  not null check (amount_centavos >= 0),
  payment_method     text,
  provider           text not null,
  provider_ref       text,
  -- The municipality's details exactly as printed, for the verification screen
  -- and for anyone asking later what this receipt actually said.
  issuer             jsonb not null,
  issued_at          timestamptz not null default now(),

  -- The rendered PDF, like `documents`. Stored rather than re-rendered for the
  -- reason above.
  file_name  text   not null,
  content    bytea  not null,
  byte_size  int    not null
);

create index receipts_request_idx on receipts (request_id);
create index receipts_issued_idx  on receipts (issued_at desc);
