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
| `admin` | Read and act across all offices |

`POST /api/auth/register` only ever creates residents. Staff accounts are issued
by seeding or by an administrator — there is no self-service path to a staff role.

## Endpoints

| Method | Path | Who |
|---|---|---|
| `GET` | `/api/catalogue` | public — offices, services, workflow steps |
| `POST` | `/api/auth/register` | public — resident sign-up |
| `POST` | `/api/auth/login` | public |
| `GET` | `/api/auth/me` | signed in |
| `POST` | `/api/auth/forgot` | public — request a reset link |
| `POST` | `/api/auth/reset` | public — set a new password with a link's token |
| `POST` | `/api/requests` | resident — submit |
| `GET` | `/api/requests` | resident — own requests |
| `GET` | `/api/requests/:id` | resident — own request + history |
| `POST` | `/api/requests/:id/pay` | resident — settle an assessed fee |
| `GET` | `/api/staff/queue` | staff — their departments' requests |
| `GET` | `/api/staff/summary` | staff — counts by status |
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

## Workflow

`Submitted → Municipal Treasury Assessment → Payment → e-Document Release`

The server owns progression. Staff move a request forward; the **Payment** step
is the resident's to complete, and `advance` refuses to step over an unpaid fee.
Every transition is appended to `request_events` with the actor who made it, so
a request's history is auditable rather than inferred.

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
npm run test:antivirus    # scanning, against a mock clamd speaking INSTREAM
                          # (starts its own API on port 4100; no setup needed)
```

Covers registration and login, request submission, the full assess → pay →
release path, rejection, and the access rules: one department cannot read or act
on another's requests, and one resident cannot read another's.

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
