# eLGU API

Node + Postgres backend for the eLGU Citizen Portal. Serves both sides of the
system: residents submitting requests, and municipal staff working their
department's queue.

## Setup

```bash
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
npm install
npm run migrate           # applies migrations/*.sql, tracked in schema_migrations
npm run seed              # offices + services from the app's catalogue, plus demo staff
npm start                 # http://localhost:4000
```

`JWT_SECRET` has no default — the server refuses to start without one, so a
deployment can't accidentally run on a guessable signing key. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Roles

| Role | Can do |
|---|---|
| `resident` | Register themselves, submit requests, read **only their own**, pay an assessed fee |
| `staff` | Read and act on requests for **the offices they are assigned to** |
| `admin` | Everything staff can, across all offices, plus managing staff accounts |

`POST /api/auth/register` only ever creates residents. Staff accounts are issued
by an administrator (or the seed) — there is no self-service path to a staff role.

## Endpoints

| Method | Path | Who |
|---|---|---|
| `GET` | `/api/catalogue` | public — offices, services, programmes, emergency hotlines, holidays, workflow steps |
| `POST` | `/api/auth/register` | public — resident sign-up |
| `POST` | `/api/auth/login` | public |
| `GET` | `/api/auth/me` | signed in |
| `PUT` | `/api/auth/me/photo` | resident — set their ID portrait (multipart) |
| `GET` | `/api/auth/me/photo` | resident — their own portrait, served inline |
| `DELETE` | `/api/auth/me/photo` | resident — remove it |
| `POST` | `/api/auth/me/verification` | resident — a 90-second, single-use ID code |
| `POST` | `/api/staff/verify-id` | staff — check a code a resident is showing |
| `GET` | `/api/staff/verify-id/:id/photo` | staff — the face, for a check they just ran |
| `POST` | `/api/auth/forgot` | public — request a reset link |
| `POST` | `/api/auth/reset` | public — set a new password with a link's token |
| `POST` | `/api/requests` | resident — submit (optional `draftId` clears the draft) |
| `GET` | `/api/requests/drafts` | resident — their own half-filled forms |
| `PUT` | `/api/requests/drafts/:serviceId` | resident — save or overwrite one |
| `DELETE` | `/api/requests/drafts/:id` | resident — discard one |
| `GET` | `/api/requests` | resident — own requests |
| `GET` | `/api/requests/:id` | resident — own request + history |
| `POST` | `/api/requests/:id/pay` | resident — settle an assessed fee |
| `GET` | `/api/staff/queue` | staff — their departments' requests, paged (`limit`, `cursor`, `q`) |
| `GET` | `/api/staff/summary` | staff — counts by status |
| `GET` | `/api/staff/reports` | staff — what the office did over a period (`from`, `to`, `departmentId`, `format=csv`) |
| `GET` | `/api/appointments` | resident — their own bookings |
| `GET` | `/api/appointments/days` | resident — which days an office is open (`departmentId`) |
| `GET` | `/api/appointments/availability` | resident — the times on a day, and how full each is |
| `POST` | `/api/appointments` | resident — book a slot |
| `DELETE` | `/api/appointments/:id` | resident — cancel their own booking |
| `GET` | `/api/staff/appointments` | staff — the counter's day (`date`, `departmentId`) |
| `GET`/`PUT` | `/api/feedback` / `/api/feedback/:requestId` | resident — rate a finished transaction |
| `GET`/`POST` | `/api/feedback/complaints` | resident — their complaints, and file one |
| `GET` | `/api/staff/complaints` | staff — the office's complaints (`status`, `departmentId`) |
| `POST` | `/api/staff/complaints/:id/respond` | staff — reply, once |
| `POST` | `/api/staff/appointments/:id/:action` | staff — `arrived`, `served` or `no-show` |
| `GET` | `/api/staff/requests/:id` | staff — request + full audit trail |
| `POST` | `/api/staff/requests/:id/assess` | staff — set the fee due |
| `POST` | `/api/staff/requests/:id/advance` | staff — move one step forward |
| `POST` | `/api/staff/requests/:id/reject` | staff — close with a reason |
| `GET` | `/api/requests/:id/document` | resident — the released PDF for their own request |
| `GET` | `/api/staff/requests/:id/document` | staff — the released PDF, own departments only |
| `GET` | `/api/verify/:code` | public — confirm a document is genuine |
| `GET` | `/api/requests/:id/attachments` | resident — files on their own request |
| `POST` | `/api/requests/:id/attachments` | resident — attach a requirement (multipart) |
| `GET` | `/api/requests/:id/attachments/:aid` | resident — download their own file |
| `DELETE` | `/api/requests/:id/attachments/:aid` | resident — remove, while the request is open |
| `GET` | `/api/staff/requests/:id/attachments` | staff — what the resident supplied |
| `GET` | `/api/staff/requests/:id/attachments/:aid` | staff — download it |
| `GET` | `/api/staff/requests/:id/programs` | staff — the resident's programme record |
| `POST` | `/api/staff/requests/:id/programs` | CSWDO/admin — enrol or correct a record |
| `DELETE` | `/api/staff/requests/:id/programs/:code` | CSWDO/admin — remove a record |
| `GET` | `/api/notifications` | resident — their own, with an unread count |
| `POST` | `/api/notifications/:id/read` | resident — mark one read |
| `POST` | `/api/notifications/read-all` | resident — mark all read |
| `GET`/`PATCH` | `/api/notifications/preferences` | resident — channels and mobile number |
| `GET` | `/api/notifications/push-key` | resident — whether push is configured, and the VAPID public key |
| `GET`/`POST`/`DELETE` | `/api/notifications/push` | resident — this device's push subscription |
| `GET` | `/api/privacy/export` | resident — everything held about them, as a file |
| `PATCH` | `/api/privacy/profile` | resident — correct their own contact details |
| `GET` | `/api/privacy/closure-preview` | resident — what closing would erase and keep |
| `POST` | `/api/privacy/close` | resident — close the account |
| `GET`/`POST` | `/api/admin/hotlines` | admin — the emergency numbers on every digital ID |
| `PUT`/`DELETE` | `/api/admin/hotlines/:id` | admin — correct or withdraw one |
| `GET`/`POST` | `/api/admin/holidays` | admin — the working-day calendar (`year`); POST upserts a date |
| `DELETE` | `/api/admin/holidays/:date` | admin — undeclare a day |
| `GET` | `/api/admin/offices` | admin — each office's contact details |
| `PATCH` | `/api/admin/offices/:id` | admin — address, hours, phone, email only |
| `GET` | `/api/admin/audit` | admin — every change above, newest first, with the old value |
| `GET` | `/api/admin/staff` | admin — every staff and admin account |
| `POST` | `/api/admin/staff` | admin — create an account and mail an invitation |
| `PATCH` | `/api/admin/staff/:id` | admin — name, offices, position |
| `POST` | `/api/admin/staff/:id/deactivate` | admin — revoke access |
| `POST` | `/api/admin/staff/:id/reactivate` | admin — restore it |
| `POST` | `/api/admin/staff/:id/send-reset` | admin — mail a fresh link |

## Workflow

`Submitted → Municipal Treasury Assessment → Payment → e-Document Release`

The server owns progression. Staff move a request forward; the **Payment** step
is the resident's to complete, and `advance` refuses to step over an unpaid fee.
Every transition is appended to `request_events` with the actor who made it, so
a request's history is auditable rather than inferred.

## Payments

```
POST /api/payments/intents              resident; the server prices it
GET  /api/payments/intents/:reference   resident; what the screen polls
POST /api/payments/webhook/:provider    the gateway; signed, and the only thing that settles
GET  /api/staff/payments?from=&to=      treasury and admins; the reconciliation book
```

The amount is never in the request body — it is read off the request's assessment.
`POST /api/requests/:id/pay` is gone (410): it marked a request paid because the browser
said so.

The webhook is mounted **before** `express.json()` so the signature is checked against
the bytes that were sent. Re-serialising parsed JSON to verify a signature disagrees with
the sender about key order or whitespace eventually, and then every real payment fails
with no visible cause.

`payment_events` is unique on `(provider, event_id)` and a partial unique index allows one
settled payment per request, so a gateway retrying — which is normal, not an attack —
settles once. A callback for an amount that is not the one assessed is marked `mismatched`
and left for a human rather than settled.

`PAYMENT_PROVIDER=mock` is the development provider. It signs and verifies exactly as a
real gateway does, and exposes `POST /api/payments/mock/:reference/complete` to send the
callback a real one would — which is why it must never be deployed: that route settles a
payment nobody made. Adding a real gateway means implementing `PaymentProvider` in
`src/payments.ts` and setting `PAYMENT_PROVIDER` and `PAYMENT_SECRET`.

## Document release

Completing a request renders a PDF and stores it against that request. It
carries the office, the resident, the submitted fields, the fee, and a
verification code.

- The PDF **bytes are stored**, not regenerated on demand. A released clearance
  is a record of what was issued at that moment; rebuilding it from the request
  row would let a later edit silently change a document a resident already holds.
- One document per request (`documents.request_id` is unique), so re-completing
  cannot mint a second one with a different code.
- Verification codes are 16 characters of Crockford-style base32 (no I/L/O/U),
  long enough that `/api/verify/:code` cannot be walked.
- `/api/verify/:code` is deliberately public — whoever is checking already holds
  the document — and returns only what is needed to match the paper against the
  record.

Note that **paying carries a request to the final step but does not close it**.
The office still advances it, and that release step is what issues the document.

## Queue pagination

`GET /api/staff/queue` returns `{ items, nextCursor, total }`, 25 per page by
default and 100 at most. Pass `cursor` for the next page and `q` to search by
reference number, resident name or service.

**The cursor is keyset, not an offset.** A queue takes new requests constantly:
with `OFFSET`, a request arriving while a clerk reads page 1 shifts everything
down and page 2 repeats a row they have already seen. A cursor anchored to the
last row read is stable regardless of what arrives in between, and stays fast at
depth. `nextCursor` is null on the last page.

The cursor carries the timestamp as **text straight from Postgres**. A JS `Date`
keeps only milliseconds while `timestamptz` keeps microseconds, so round-tripping
through `toISOString()` truncates `.123456` to `.123` — the next page then starts
*before* the row it should start after and returns it twice. `test:pagination`
covers this.

The queue is oldest-first, which is what a queue should be, so a request just
submitted is at the back. Search is how a clerk finds a specific one.

## Notifications

A resident used to learn their fee had been assessed only by reopening the app.
Assessing, advancing, releasing and rejecting now all tell them.

- **The notification is written in the same transaction as the change it
  describes**, so a request cannot move without the resident being told.
- **Email and SMS are attempted afterwards**, outside the transaction and
  without blocking the response: a slow mail server must not make an office's
  Advance button hang, and a bounced message must never roll back the work. If
  delivery fails the notice is still in the app.
- Email is on by default (it is the address they registered with); SMS is off
  until a mobile number is supplied.

`SMS_TRANSPORT=http` posts to `SMS_URL`; the payload shape matches Semaphore,
which most Philippine LGUs use. Texts are trimmed to one 160-character segment
because they are billed per segment.

## Staff accounts

Administrators manage accounts from the console's **Accounts** tab. Before this
existed, onboarding a clerk meant editing the database by hand.

- **An administrator never sets or sees anyone's password.** A new account is
  created with an unusable random one and the person chooses their own through
  an emailed invitation link (valid a week, for someone starting next Monday).
  If the mail fails, the response says `invited: false` so the admin follows up
  rather than assuming it arrived.
- **Access is revoked by deactivating, not deleting.** Staff appear as the actor
  on every assessment and release they made; deleting them would blank that
  history. A deactivated account cannot sign in *and* cannot use an existing
  session — `authenticate` re-reads the account on every request.
- **Deactivating spends any outstanding invitation or reset link**, so one
  cannot be used to walk back in after access was removed.
- An administrator cannot deactivate their own account, which would lock the
  municipality out of its own administration.
- A staff account must serve at least one office; one with none would sign in to
  an empty queue.

The seed creates `admin@malasiqui.gov.ph`. Change its password immediately in
any real deployment.

## Password reset

`POST /auth/forgot` mails a single-use link; `POST /auth/reset` spends it.

- **Only a hash of the token is stored**, so a leaked database yields no working
  links. Tokens are single-use and expire in an hour, and a successful reset
  spends every other outstanding link for that account.
- **The response never reveals whether an account exists** — a known address, an
  unknown one and a malformed one all get the same 202. A send failure is logged
  rather than surfaced, for the same reason.
- **It shares the login rate-limit budget**, so it can't be used to spray
  addresses or flood an inbox.
- **A reset signs out existing sessions.** Sessions are stateless JWTs, so
  `users.password_changed_at` is checked on every request and anything issued
  earlier is refused — otherwise resetting would leave the very person you are
  locking out still signed in. Tokens carry `iatMs` because `iat`'s whole-second
  resolution cannot separate a session issued moments before a reset from one
  issued moments after.
- A successful reset clears the account's failed-login count, so someone locked
  out by an attacker can get straight back in.

**`MAIL_TRANSPORT=smtp` and `SMTP_URL` are required for anything public**, along
with `PUBLIC_URL` pointing at the address residents actually use. On the default
`console` transport the link is only logged, which means no resident can
actually recover their account.

## Attachments

Residents attach a file against each requirement the service states, so the
office can verify what was submitted instead of approving blind.

- **The bytes decide the type**, not the declared Content-Type or the filename:
  PDF, JPEG, PNG and HEIC are detected by magic number, and anything else is
  refused. HEIC matters — it is what an iPhone camera produces.
- **Files are never served inline.** A resident-supplied PDF can carry script,
  so serving one on our own origin would turn an upload into stored XSS.
  Everything goes out as `Content-Disposition: attachment` with `nosniff`.
- **Storage keys are server-generated**, never derived from the uploaded name,
  so a filename cannot shape a path. Names are also stripped of directory
  parts, control characters and quotes before being echoed back.
- 10 MB per file, 10 files per request. Closed requests accept no more.
- Metadata is in Postgres; bytes go to `UPLOAD_DIR` via `src/storage.ts`, whose
  interface (put/get/remove by opaque key) is deliberately narrow so S3 can
  replace it without touching the routes.

**`UPLOAD_DIR` must be a mounted volume in a container**, or every uploaded
requirement is lost on the next deploy.

### Virus scanning

Set `CLAMAV_HOST` and uploads are streamed to clamd before anything reaches
disk. Leave it unset and scanning is skipped, which is fine for development and
not for anything facing the public.

Two behaviours worth knowing:

- **It fails closed.** When scanning is configured but the scanner is down,
  times out, or answers with something unparseable, the upload is rejected with
  a 503 rather than accepted unscanned. An unavailable scanner must not quietly
  become no scanner.
- **Files are scanned in memory**, before `putFile`, so an infected upload never
  lands on disk at all. The rejection message doesn't name the signature.

`GET /api/health` reports `virusScanning: enabled|disabled`, so a deployment
that meant to scan but isn't is visible rather than silent.

`docker compose --profile antivirus up -d` starts a clamd alongside the app; set
`CLAMAV_HOST=clamav` to point at it. It is opt-in because the image downloads a
virus database and takes a few minutes to become ready.

## Login throttling

| Axis | Limit | Window |
|---|---|---|
| Per account | 5 failed attempts | 15 minutes |
| Per IP | 20 failed attempts | 15 minutes |

Both are needed. The account limit alone lets one client try a common password
against thousands of accounts; the IP limit alone lets a botnet grind a single
account from many addresses. Attempts are recorded in Postgres, not in process
memory, so the limit holds across restarts and across instances behind a load
balancer.

Details worth knowing:

- The throttle is checked **before** the password comparison, so a locked-out
  attacker cannot keep forcing expensive bcrypt work.
- Failures are recorded for addresses that have **no account**, so a `429`
  cannot be used to discover which emails are registered.
- A correct password clears that address's failures, so someone who mistyped
  twice in the morning isn't closer to a lockout in the afternoon.
- A blocked response carries `Retry-After` and tells the person when to retry.
- Registration shares the same budget, so sign-up can't be used to spray.

**`TRUST_PROXY` must match your deployment.** It is the number of reverse
proxies in front of this server (0 = directly exposed). Express only reads
`X-Forwarded-For` when it is set — leave it at 0 behind a load balancer and
every attempt is attributed to the balancer, so one resident's mistyping locks
out the whole municipality; set it too high on a directly-exposed server and a
client can forge the address the limit counts.

**Known trade-off:** because a locked account refuses the correct password too,
someone who knows a staff address can deliberately keep that account locked in
15-minute stretches. The alternative — letting a known-good password through —
would defeat the lockout entirely. If this becomes a problem in practice, the
usual answer is to add a second factor for staff rather than to loosen this.

## Tests

```bash
npm run test:e2e          # needs the server running against a migrated, seeded database
npm run test:rate-limit   # login throttling; run the server with TRUST_PROXY=1 to
                          # also exercise the per-IP axis
npm run test:hardening    # regressions for the issues found in the security pass
npm run test:documents    # release, download, access rules, and verification
npm run test:attachments  # upload validation, access rules, and lifecycle
npm run test:password-reset  # token handling, enumeration, session invalidation
npm run test:admin        # staff account management and its access boundaries
npm run test:notifications  # recording, delivery, preferences, and isolation
npm run test:pagination   # paging boundaries, cursor stability, and search
npm run test:programs     # sectoral registries: who may write, expiry, and isolation
npm run test:drafts       # drafts stay out of every queue, and clear on submit
npm run test:ready-dates  # working-day arithmetic, holidays, and the paused clock
npm run test:field-rules  # required fields, select/number/date types, draft exemption
npm run test:portrait     # ID photo: images only, own-photo scoping, replace and remove
npm run test:hotlines     # emergency numbers: published, dialable, grouped, unique
npm run test:id-verification  # single use, expiry, scoping, and what staff may see
npm run test:reports      # the two turnaround clocks, office scoping, and the CSV
npm run test:municipality # hotlines, holidays and office details: who may edit, and the audit
npm run test:appointments # the office calendar, capacity, queue numbers, and the counter's day
npm run test:feedback     # ratings, complaints, the working-day deadline, and the figures
npm run test:search       # the terms are published, and the matcher ranks the way a person expects
npm run test:push         # subscriptions, scoping, real VAPID signing, and the lock-screen rule
npm run test:privacy      # export, correction, and what closure really erases and really keeps
npm run test:antivirus    # scanning, against a mock clamd speaking INSTREAM
                          # (starts its own API on port 4100; no setup needed)
npm run test:payments     # signed webhooks, idempotency, amount checking, reconciliation
npm run test:incidents    # who may report, what counts as evidence, and the video ceiling
npm run test:residency    # one municipality per account, and one account per person
npm run test:barangay     # the barangay tier: the order, the roles, and the isolation
npm run test:document-steps  # the route to each document: live links, no cycles, no dead ends
npm run test:blotter      # the barangay book: who may open it, the roles, and that no resident can
npm run test:households   # the register of inhabitants: scoping, the figures, and no account links
npm run test:announcements  # the board: who may post, who may ring every phone, expiry on read
npm run test:barangay-office  # the hall's details, who may correct them, and when a certificate lapses
npm run test:kagawad      # the council's view: figures not people, and the escalation line
npm run test:certificates  # the catalogue: who owns which half, and the fee trail treasury reads
npm run test:deployment   # one deployment per municipality: config, roster, and the boot refusal
```

Run them one at a time, or clear `login_attempts` between them. Every suite signs
in — several deliberately with the wrong password — and the per-IP throttle counts
all of it against one address when the whole lot runs back to back from localhost.
A suite that fails with 429 or `Sign in to continue.` has been locked out rather
than broken, and passes on its own.

`test:payments` signs its own callbacks, so it needs the **same** `PAYMENT_SECRET`
the server is running with — the suite otherwise falls back to a default, every
signature it builds is refused, and the failures read as broken verification
rather than a mismatched secret:

```bash
PAYMENT_SECRET="$(grep '^PAYMENT_SECRET=' .env | cut -d= -f2-)" npm run test:payments
```

Covers registration and login, request submission, the full assess → pay →
release path, rejection, and the access rules: one department cannot read or act
on another's requests, and one resident cannot read another's.

## Attachment limits

`MAX_FILE_BYTES` is 10 MB and `MAX_FILES_PER_REQUEST` is 10, both in `src/uploads.ts`.
Multer enforces the byte cap at the transport layer and the error handler in `index.ts`
turns its `LIMIT_FILE_SIZE` into a 413 naming the limit; the file count is checked in the
route and returns 409. The browser checks the size first so a resident is not made to
upload 11 MB before being told, but the server is what makes the limit true.

Content type comes from magic bytes (`detectType`), never the filename or the declared
MIME type, and the stored name is rewritten to the detected extension. A photo taken with
the phone camera arrives as an ordinary multipart JPEG and needs no special handling.

## Emergency hotlines

`emergency_contacts` is seeded from `EMERGENCY_CONTACTS` in `src/data/mockData.ts` and
served on the public catalogue — a hotline should not require a session. Rows carry
`is_national` so the app can group municipal numbers apart from nationwide ones, and
`sort_order` for display; ids are stable strings so a reseed updates rather than
duplicates.

The client caches the whole catalogue in localStorage and renders from it when the API is
unreachable, which is the case these numbers exist for. Nothing server-side depends on
that, but it is why the payload is kept small enough to store.

The seeded municipal numbers are placeholders. Replace them before deploying.

## Verifying an ID

`id_verifications` holds hashed, 90-second, single-use codes. `consumeVerificationCode`
claims one in a single UPDATE, so two clerks racing the same code cannot both be told it is
valid; the outcome distinguishes unknown / expired / used because those mean different
things at a counter. Issuing retires anything the resident still has outstanding.

Reachable by any staff or admin — counter work is not department-scoped — but the response
carries only what a counter check needs: name, residency, the PhilSys number's last four,
and the *current* programme record. The portrait is a separate route, gated on the caller
having consumed a verification for that resident in the last five minutes, so staff cannot
browse faces. Every check records `verified_by`.

## The ID portrait

`resident_profiles.photo_key` points into the same object store as attachments.
`MAX_PORTRAIT_BYTES` is 4 MB and `PORTRAIT_TYPES` accepts only JPEG, PNG and HEIC, decided
by magic bytes: PDF sniffs cleanly but is not a picture, and SVG must never be served from
this origin because the portrait is sent `Content-Disposition: inline` for the ID to
render. Uploads are virus-scanned and fail closed exactly as attachments do, and the
previous file is deleted only after the new row commits.

Scoped to the caller throughout — there is no route for reading another resident's
portrait, and staff have none of their own (403). Responses carry `no-store`, so a shared
proxy never keeps a resident's face.

## Form validation

`checkFormValues` in `routes/requests.ts` takes a `complete` flag. Submissions pass
`true`: every required field must be filled, a `select` value must be one of its declared
options, a `number` must parse, and a `date` must be a real calendar day (`2026-02-31` is
refused, `2024-02-29` is not). Errors use the field's label, so the resident reads the same
words the form showed them.

Drafts pass `false` and are held only to the structural rules — declared field ids and
`MAX_FIELD_LENGTH`. A draft is unfinished by definition; validating it would reject the
resident's own half-typed input as they went.

The browser applies the same rules first. This is the backstop that makes them real, since
a caller can POST straight to the endpoint.

`test/fixtures.mjs` builds valid submissions from `/api/catalogue`, so test data cannot
drift from the catalogue it is filling in.

## Expected ready dates

`src/schedule.ts` counts working days, skipping weekends and every row in `holidays`.
`estimateReady` returns `{ expectedReady, awaitingResident }` and every serialized request
carries them (`withReadyDates` in `serialize.ts`, which fetches the cached holiday set once
per list rather than once per row).

The clock starts when the office took the work on — `submitted_at` for a free service,
`paid_at` for one the resident had to settle — and there is no estimate at all while a fee
is unpaid (`awaitingResident: true` instead) or once the request is closed. Quoting a date
the office cannot be held to would read as the office being slow when the delay is the
resident's.

`holidays` is seeded from `HOLIDAYS` in `src/data/mockData.ts` with 2026 Philippine dates
plus two sample local ones. Check them against the year's proclamation and replace the
local ones before deploying; `clearHolidayCache()` drops the 10-minute in-process cache if
you change them without a restart.

## Drafts

`request_drafts` is deliberately not a `draft` row in `requests`. A draft is something the
resident has not submitted and no office has been asked to look at; keeping it in its own
table means it cannot surface in a department queue through a query that forgot to exclude
it. That structural separation is the guarantee, not a `status <> 'draft'` clause every
future query has to remember — and the test suite asserts it against the real queue,
summary and admin endpoints.

It also keeps reference numbers honest: a number is drawn from `request_counters` when the
resident actually submits, so a draft never consumes one or shows a number that means
nothing yet.

`unique (resident_id, service_id)` gives one draft per service, so the save endpoint is an
idempotent PUT — autosave fires repeatedly and retrying is harmless. Drafts are held to the
same field rules as submissions (`checkFormValues`): a draft that could hold what a
submission would refuse just moves the rejection to a worse moment. Submitting deletes the
draft inside the insert's transaction, matched on `draftId` or the service, so a lost
response cannot leave both a request and its draft behind.

## Office contact details

`departments` carries `address`, `hours`, `phone` and `email`, seeded from
`src/data/mockData.ts` and published on `/api/catalogue`. The app's Help & support screen
is built from them, so an office that moves floors is a reseed rather than a release. The
seeded values are placeholders for a sample municipality — replace them before deploying.

## Sectoral programmes

`sectoral_programs` holds the catalogue (seeded from `src/data/mockData.ts`);
`resident_programs` holds who is on what. A membership is worth real money at a
counter — a senior-citizen record is a 20% statutory discount, 4Ps is a cash grant —
so `mayAdministerPrograms` in `src/programs.ts` restricts writes to staff assigned to
`REGISTRAR_DEPARTMENT` (`cswdo`) and to admins. Reading is open to any office that can
already open the request, because knowing someone is a senior citizen changes how any
counter serves them.

Writes are reached through a request the office is handling, so there is no
resident-search surface: `loadForStaff` still scopes the request to the caller's
departments, and the write check is applied on top of it. A Treasury clerk who can open
a request cannot enrol its resident in anything.

`expired` is derived in the query (`valid_until < current_date`), never stored, so a
lapsed record needs no nightly job to start reading as lapsed. Programmes that do not
lapse reject a `validUntil` outright rather than storing one that means nothing.

Grants and revocations notify the resident with `request_id` null — the notice is about
their record, not about a request.

## Security notes

- **Reference numbers** come from `request_counters`, incremented atomically per
  department and year. They were previously derived from `count(*)`, which does
  not serialize: 6 of 8 simultaneous submissions failed on the unique index.
  Re-check `test:hardening` before changing how they are issued.
- **Submitted form values** are checked against the fields the service actually
  declares, and capped at 2000 characters each. Without that, a caller could
  attach arbitrary keys that staff would be shown as if the resident had filled
  them in.
- **JWTs** are signed and verified with a pinned algorithm (`HS256`), so
  verification cannot be steered by the token's own header.
- **Seeding refuses the built-in password when `NODE_ENV=production`** — supply
  `SEED_PASSWORD` from a secret store. The seed never prints a supplied
  password, only the development default.

## Notes

- Fees are stored as integer centavos and exposed as pesos, so amounts stay exact.
- Passwords are bcrypt-hashed (cost 12). Login compares a hash even when the email
  is unknown, so responses don't reveal which accounts exist.
- Tokens carry only a user id; the user, role, and department assignments are
  re-read from the database on every request, so revoking access takes effect at once.
- `login_attempts` rows are purged opportunistically after a successful sign-in;
  the table is not expected to grow unbounded.
- Required-field enforcement is still client-side: the API rejects fields a
  service does not declare, but does not yet reject a submission that omits a
  required one. Staff can receive an incomplete application.
