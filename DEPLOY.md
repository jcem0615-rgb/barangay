# Deploying the eLGU Citizen Portal

The app ships as **one container**: the API serves the built web app from the
same origin. That means no CORS to configure in production, one thing to deploy,
and no chance of the web build and the API drifting apart.

## What you need

| | |
|---|---|
| A host that runs containers | Fly.io, Railway, Render, a VPS with Docker, or any Kubernetes |
| Managed PostgreSQL 16+ | Neon, Supabase, RDS, or the `db` service in `docker-compose.yml` |
| A domain with TLS | Required — sessions travel as bearer tokens |

## Try the whole stack locally first

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))" > .env
docker compose up --build -d
docker compose run --rm app npm run migrate
docker compose run --rm app npm run seed
```

Open <http://localhost:4000>. Residents register in the app; the seed prints the
staff logins.

## Configuration

Everything is environment variables. Only the first two are required.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | `postgres://user:pass@host:5432/elgu` |
| `JWT_SECRET` | **yes** | The server refuses to start without it. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `TRUST_PROXY` | behind a proxy | Number of reverse proxies in front of the app. **Read the section below.** |
| `PORT` | no | Defaults to 4000 |
| `NODE_ENV` | no | Set to `production` |
| `CORS_ORIGIN` | only if split | Leave unset when the API serves the web app |
| `PGPOOL_MAX` | no | Connections per instance, default 10 |
| `SERVE_WEB` | no | `false` to run API-only |
| `VAPID_PUBLIC_KEY` | for push | Generate a pair: `npx web-push generate-vapid-keys`. Without both keys push is simply off, and the app's notification switch does not appear. |
| `VAPID_PRIVATE_KEY` | for push | Keep it secret, like `JWT_SECRET`. Changing it invalidates every existing subscription, and every device has to be turned on again. |
| `VAPID_SUBJECT` | for push | `mailto:` for whoever a push service should contact about this sender. Defaults to the DPO address. |
| `UPLOAD_DIR` | **in a container** | Must be a mounted volume, or uploads are lost on deploy |
| `CLAMAV_HOST` | **for public traffic** | clamd for scanning uploads. Unset = no scanning |
| `SMTP_URL` | **for public traffic** | Password reset links go nowhere without it |
| `MAX_EVIDENCE_MB` | no | Largest incident evidence file, default 512. Half an hour of 1080p phone video is 1–2 GB, so raise it only if storage and bandwidth can take it |
| `PAYMENT_PROVIDER` | **to take money** | The gateway. `mock` is the development provider and **must not** be deployed — it exposes a route that settles a payment without one being made |
| `PAYMENT_SECRET` | **to take money** | The secret the gateway signs callbacks with. The server refuses to start in production without it |
| `PUBLIC_URL` | **yes** | Address residents reach. Reset and notification links use it, and so does the QR printed on every document — see the checklist, because that one is frozen into each PDF at issue |
| `SMS_TRANSPORT` | optional | `http` plus `SMS_URL`/`SMS_API_KEY` to text residents |
| `MUNICIPALITY_ADDRESS` | for receipts | The hall's address as it should read on an official receipt |
| `MUNICIPALITY_PHONE` | for receipts | Printed on the receipt. Ring it before you set it |
| `MUNICIPALITY_EMAIL` | for receipts | Printed on the receipt |
| `MUNICIPALITY_WEBSITE` | for receipts | Printed on the receipt |
| `MUNICIPALITY_TIN` | for receipts | The municipality's own TIN. **The seeded one is invented** |
| `MUNICIPALITY_TREASURER` | for receipts | The name a receipt is issued over. Changes with the office |
| `MUNICIPALITY_TREASURER_TITLE` | no | Defaults to `Municipal Treasurer` |
| `RECEIPT_PREFIX` | no | Series prefix, default `OR`. Capitals, digits and hyphens |
| `RECEIPT_FORM_LABEL` | no | The accountable form the LGU was issued, e.g. `Accountable Form No. 51`. **Leave unset unless you have one** |
| `RECEIPT_FOOTER` | no | The municipality's own note at the foot of the receipt |

All of the receipt variables are seeded **into blanks only**. The Municipality tab is
where they are corrected, and a reseed that overwrote a treasurer's name every time
somebody ran it would make the editing screen a lie. Set them here for a fresh
deployment; change them in the app afterwards.

### TRUST_PROXY is not optional guesswork

Login rate limiting counts failures per client IP, and Express only reads
`X-Forwarded-For` when `trust proxy` is set. Getting this wrong breaks the
protection in one of two ways:

- **Too low** (0 behind a load balancer): every request appears to come from the
  balancer. One resident mistyping their password 20 times locks out the entire
  municipality.
- **Too high** (more hops than exist): a client can forge `X-Forwarded-For` and
  present a fresh IP on every attempt, walking straight past the limit.

Set it to the actual number of proxies between the internet and the container —
usually `1` behind a single load balancer or ingress.

## Deploy

1. **Provision Postgres** and get its connection string. Require TLS if the
   provider offers it.
2. **Set the environment variables** above in your host's secret store. Never
   commit `JWT_SECRET` — rotating it signs every existing session out, which is
   the correct response if it ever leaks.
3. **Run migrations** before the new version takes traffic:
   ```bash
   npm run migrate     # inside the container, or as a release step
   ```
   Migrations are tracked in `schema_migrations` and each runs in a transaction,
   so re-running is safe and a failed one leaves nothing half-applied.
4. **Seed the catalogue** on first deploy only:
   ```bash
   npm run seed
   ```
   Re-running is safe — offices and services are upserted and existing staff
   accounts are left alone. Change `SEED_PASSWORD` from the default, or create
   staff accounts yourself and skip seeding them.
5. **Point the health check** at `GET /api/health`. It verifies Postgres, so an
   instance that cannot reach its database reports 503 and drops out of rotation
   instead of serving errors.
6. **Terminate TLS** at your load balancer and redirect HTTP to HTTPS. The app
   sends HSTS, which only means anything over HTTPS.

## Before you take real submissions

- [ ] `JWT_SECRET` is a fresh random value from a secret store, not a file
- [ ] `TRUST_PROXY` matches the real proxy count
- [ ] Seeded staff passwords have been changed, `admin@malasiqui.gov.ph` first
- [ ] Staff onboarding goes through the Accounts tab, not the database
- [ ] Postgres has automated backups with a tested restore
- [ ] TLS is enforced and HTTP redirects
- [ ] You have somewhere to read `console.error` output
- [ ] `UPLOAD_DIR` points at persistent storage, not the container filesystem
- [ ] `CLAMAV_HOST` is set and `/api/health` reports `virusScanning: enabled`
- [ ] `SMTP_URL` and `PUBLIC_URL` are set, and a test reset email actually arrives
- [ ] **`PUBLIC_URL` is the address the public actually reaches, and it has been checked
      by scanning a real document with a phone.** The QR on every permit, receipt and
      certificate is built from it, and the rendered PDF is *stored* rather than re-made —
      so a wrong value is baked into every document issued under it and cannot be corrected
      afterwards without reissuing them. This is the one setting here that a later fix does
      not reach backwards. Scan one before the first real release, not after
- [ ] Somebody has scanned a released document with an ordinary phone, landed on the check,
      and read what it says — including the line about a photocopy verifying too. A counter
      that reads a green tick as "this document is the only one" has been taught the wrong
      thing by the screen rather than by the forger
- [ ] **Somebody owns reading Municipality → Document checks**, and knows it is a prompt
      rather than proof. A busy permit and a copied one look identical in that list; an
      administrator who treats the top of it as evidence will withdraw a genuine document
      from a resident who did nothing wrong
- [ ] **The offices know that withdrawing a document cannot be undone** and that there is
      no reissue route — a mistake means the resident files again, and pays again where
      there is a fee. Agree who may do it before anybody can
- [ ] `PAYMENT_PROVIDER` is a real gateway, **not** `mock`, and `PAYMENT_SECRET` comes
      from a secret store
- [ ] A test payment has been taken end to end, and the treasury's **Payments** tab shows
      it with the gateway's own reference beside it
- [ ] **The official receipt is this municipality's.** Open **Municipality → Official
      receipt** and set the hall's address, telephone, email, **the real TIN** (the seeded
      one is invented) and the treasurer's name, then upload the municipal seal as a PNG
      or JPEG. A test payment's receipt has been downloaded and read end to end by
      somebody from the treasury
- [ ] **Who signs what each office releases is named, and the signature on file is theirs
      to use.** Open **Municipality → Office details** and set each office's head and title;
      upload a signature only where its owner has agreed to it being printed. A signature
      here is a *picture* of one and not a digital signature — it makes a document look the
      way a counter expects and makes nothing tamper-evident, so the verification code is
      still what proves the paper. Every upload and removal is in **What changed** with the
      name of whoever did it; make sure somebody actually reads that
- [ ] **A released document has been downloaded and read with the seal and the signature
      on it.** An office with a signature and no name prints a mark over a blank rule,
      which is worse than printing neither
- [ ] **Somebody with the authority to say so has decided whether this receipt is an
      Official Receipt.** It is numbered, verifiable and frozen at issue, but an LGU's OR
      is an accountable form: issuing one electronically needs BIR accreditation where it
      applies and COA concurrence for the form. Leave the accountable form number blank
      until the municipality has been issued one — a number nobody authorised is worse
      than none — and tell the treasury in writing what the app does and does not claim
- [ ] Every municipal hotline, **the electric cooperative included**, has been **rung** and answered by the office it names —
      the seed ships invented numbers under a real town's name, and 911 and 143 are the
      only two that are correct as published
- [ ] Office addresses, hours, phones and emails are the municipality's own, not the
      seeded placeholders (fix them in the **Municipality** tab, not by reseeding)
- [ ] The holiday calendar matches this year's proclamation and carries the local days
- [ ] The electric cooperative named in the hotlines is the one that actually serves this
      municipality — Pangasinan is split between more than one
- [ ] `UPLOAD_DIR` has room for incident video, and somebody owns deleting old evidence
- [ ] **Every document's step-by-step route matches the office's Citizen's Charter.** The
      seed ships a plausible ordering for all 17 municipal services and 6 barangay
      certificates — which document to get first, and who issues it — written from common
      practice rather than from this municipality's charter. Sit down with each office and
      reconcile them. A resident who follows a wrong order makes exactly the wasted trip
      the guide exists to prevent, and the municipality's name on the screen is why they
      trusted it
- [ ] **Each barangay has uploaded its own seal** (Barangay console → Hall), and somebody
      has walked one certificate through to "released" and read the resulting PDF. It carries
      the Punong Barangay and the Barangay Secretary from that barangay's own row — check
      both names are the people currently holding those offices, because they are printed on
      every certificate it releases and they change at every barangay election
- [ ] **The two signatures on that certificate are the ones those two officials agreed to
      use**, and somebody has told them it is being printed. Same tab, same caveat as the
      municipal side: a picture of a signature is not a digital signature, every upload is
      recorded against the account that made it, and an election means replacing both. A
      barangay that would rather sign by hand uploads neither — the certificate then prints
      the rule and the title, which is what it did before
- [ ] **Each barangay has read the attestation on every certificate it issues and accepted
      the wording**, in the Certificates tab. The seeded text is placeholder wording, not any
      barangay's own form, and it is what goes out over the Punong Barangay's name. The one
      line with a real legal source is the first-time jobseeker certificate's reference to
      RA 11261
- [ ] **Somebody has told the barangay clerks that the app does not check what a certificate
      attests.** A clearance saying "no pending case" is the office's statement; nothing
      cross-references the blotter, and the release screen says so
- [ ] **Somebody has decided who in each barangay may open the blotter.** It names people
      accused of things and found guilty of nothing, and every account with a
      `barangay_officer` or `barangay_admin` role for that barangay can read the whole book.
      Issue those accounts to the people who actually hold the office, and revoke them when
      they leave — the app has no finer permission than the role
- [ ] **The register of inhabitants has a lawful basis and a retention period.** It is a
      list of every resident with their age, household and what the barangay noted about
      them — the largest concentration of personal data in the deployment. The DPO should
      sign off on why it is held and for how long, and the same accounts that may open the
      blotter can read all of it
- [ ] **The retention of blotter entries matches the LGU's own records policy**, and
      somebody owns deleting what is past it. Nothing here expires an entry, and a book of
      accusations kept forever is a liability rather than a record
- [ ] **The Filipino routes have been read by somebody who speaks it**, not only the
      English. Both are authored in `mockData.ts` and a wrong instruction translates
      perfectly well; the Filipino is the version most residents will actually read
- [ ] **The barangay roster is the municipality's real one.** The seed ships six sample
      barangays with invented captains and secretaries; Malasiqui has 73. Take the list from
      the PSGC listing for this municipality, and get the officials' names from the hall —
      they are printed on every certificate and they change at every barangay election
- [ ] Each barangay's certificate fees match what it actually charges (set them in that
      barangay's own console, not by reseeding), and the free ones are still free —
      indigency and the first-time jobseeker certificate are free by law
- [ ] Every barangay has at least one account that someone there can actually sign into, and
      the seeded barangay passwords have been changed like the municipal ones
- [ ] **Each barangay administrator knows they now issue their own clerks and kagawads**,
      and what the difference is: a clerk reads the register of inhabitants and the blotter,
      a kagawad reads counts and no individual resident. Issuing the wrong one hands a
      councillor the barangay's most personal records. An administrator account still comes
      from the municipal hall, so make sure somebody there can act when a barangay's only
      administrator leaves office after an election
- [ ] **Revoking happens the day somebody leaves office**, not at the end of the term.
      Nothing here expires an account, a barangay election replaces the whole council, and
      a kagawad who lost a seat keeps reading the barangay's figures until a person revokes
      them
- [ ] **Every barangay hall's address, hours and phone are its real ones.** They are
      seeded as invented placeholders, exactly like the hotlines, and they are what a
      resident is shown the moment a certificate is marked ready for pickup — so a wrong
      line sends somebody to a closed hall, which is the trip this app exists to save
      them. Ring each number. Each barangay administrator can correct their own in the
      console, which is the right way to do it for seventy-three of them
- [ ] **Each certificate's validity period matches what offices here actually honour.**
      `validityDays` in `mockData.ts` is a placeholder on the same footing as the fees;
      nothing in law sets most of them. The exception is the first-time jobseeker
      certificate's one year (RA 11261) — and note that the same law's one-time-availment
      rule is **not** enforced by this app, so a barangay that cares about it still checks
      by hand
- [ ] **Somebody in each barangay knows that an urgent notice rings every resident's
      phone**, and that only the administrator account can post one. A notice marked urgent
      writes a notification to every resident of that barangay and the text goes out on a
      lock screen as written — this is the one place in the app where a typo reaches
      everybody at once, and there is no recall. The board itself seeds empty, so nothing
      has to be cleared; the two sample notices are the clickable demo's only

## Standing up a second municipality

**One deployment serves one municipality, with its own database.** That is the isolation
model, and it is the reason there is no `municipality_id` on every table: two towns never
share a row, so there is no query that could forget to scope it and no portal-wide
administrator who can see across. The whole guarantee costs one check rather than a
discipline every future query has to keep.

What it costs instead is that a second LGU is an operational act. This used to mean a
*fork* — the town's name and its barangay roster were TypeScript literals — and
`server/src/deployment.ts` is what makes it configuration:

```bash
MUNICIPALITY_CODE=bugallon-pangasinan     # the identity every account is stamped with
MUNICIPALITY_NAME=Bugallon
MUNICIPALITY_PROVINCE=Pangasinan
BARANGAY_ROSTER=/etc/elgu/bugallon-barangays.json
ADMIN_EMAIL=admin@bugallon.gov.ph
ADMIN_NAME="Office of the Mayor — Administrator"
SEED_PASSWORD=…                            # required in production
npm run provision                          # migrate, then seed
```

The roster file is a JSON array, which is the shape a PSGC listing exports to and the shape
a hall can maintain without a developer:

```json
[
  { "id": "poblacion", "name": "Poblacion", "captain": "Hon. …", "secretary": "…",
    "hallAddress": "…", "officeHours": "Mon–Fri, 8:00am–5:00pm",
    "phone": "(075) …", "email": "poblacion@bugallon.gov.ph" },
  { "id": "salasa", "name": "Salasa" }
]
```

Only `id` and `name` are required; the rest can be filled in later from each barangay's own
console. **A malformed roster stops the provision rather than seeding part of it** — half a
roster means residents of the missing barangays cannot register at all, and nothing in the
running app would say why.

**Provisioning a real LGU creates the administrator and nobody else.** The six sample office
logins and the barangay ones all share a single password, which is right for clicking
through a development copy and wrong for a town, so `SEED_SAMPLE_ACCOUNTS` is off whenever
`NODE_ENV=production`. The hall then issues its own staff from the Accounts tab and each
barangay issues its own clerks and kagawads — both of which mail an invitation rather than
setting a password anybody has seen.

**The instance refuses to serve a database that is not its own.** Nothing in the app can
leak one municipality into another, because they share no rows; the one way it could happen
is the wrong database reaching the wrong instance — a restore into the wrong environment, a
copied `DATABASE_URL`, a staging box pointed at production. That mistake is silent by
nature and what it produces is a console full of residents nobody in that hall has any
business seeing. So the server compares the `municipality` row against `MUNICIPALITY_CODE`
on the way up and **exits rather than starting**, naming both sides:

```
This database belongs to a different municipality.
  the database holds: Malasiqui (malasiqui-pangasinan)
  this instance is for: Bugallon (bugallon-pangasinan)
```

A database with no municipality row has simply not been seeded yet, which is the normal
state between `migrate` and `seed` and not a mismatch. A deployment that sets no
`MUNICIPALITY_CODE` is a development copy on the sample data, where there is nothing to
confuse. Every boot prints which municipality it is serving, because that is the question
somebody asks exactly when they are about to get it wrong.

**Changing `MUNICIPALITY_CODE` on a live deployment is not a rename.** Every account is
stamped with the old code and sign-in refuses an account from another register, so it would
lock out every resident at once. The name and province are safe to correct; the code is not.

### Per-municipality checklist

Everything in the pre-launch list above applies to each deployment separately — the
hotlines, the holiday calendar, the office details, the document routes, the certificate
validity periods and the barangay hall details are all per-town data and none of it carries
over. In particular:

- [ ] `MUNICIPALITY_CODE` is this town's and is final before anybody registers
- [ ] The barangay roster is the real PSGC list, not the sample six
- [ ] `SEED_PASSWORD` came from a secret store, and the administrator changed it on first
      sign-in
- [ ] Every hotline has been rung — see the main checklist; none of Malasiqui's numbers
      apply anywhere else
- [ ] `DATABASE_URL` points at this town's database and nothing else's, and a restore
      procedure exists that cannot cross them
- [ ] The receipt details and the seal are this town's — none of the seeded ones apply
      anywhere else, and the TIN least of all
- [ ] No signature has been carried over from another deployment. A scanned signature is
      the one uploaded thing that names a specific person; it belongs to the town that
      obtained it

## Scaling

The app is stateless — sessions are JWTs and rate-limit counters live in
Postgres — so running several instances behind a load balancer works with no
extra coordination. Raise `PGPOOL_MAX` only alongside Postgres's own
`max_connections`: instances × `PGPOOL_MAX` must stay under it.

## The clickable demo (Vercel)

`vercel.json` builds the **demo**, not the real app: `VITE_DEMO=1 npm run build`
produces a bundle that answers every API call in the visitor's own browser
(`src/lib/demoServer.ts`), so it needs no Postgres, no API and no secrets. That is
the only thing this repository can put on a static host — the real deployment is
the container above, and nothing in `vercel.json` applies to it.

What a demo visitor gets is a private copy: state lives in that browser's
localStorage, so nothing one visitor does is visible to the next, switching
between the resident app and the staff console means signing out rather than
opening a second window, and uploads exist only until the browser is cleared.
Treat it as a walkthrough, never as a pilot — a municipality evaluating this
should run the container against a real database before putting a resident near
it.

## Still simulated

Deploying does not make these real, and residents will notice:

- **Payment** has the whole architecture — server-priced intents, signed webhooks,
  idempotent settlement, amount checking, a reconciliation view — but the only
  provider implemented is the development mock, which takes no money. Implement
  `PaymentProvider` for your gateway and set `PAYMENT_PROVIDER` and `PAYMENT_SECRET`.
  **Deploying with `PAYMENT_PROVIDER=mock` makes every permit free**, because the
  mock's own route settles a payment nobody made.
- **PhilSys verification** and the ID **QR code** are visual only.
- **A barangay certificate's wording is authored, and nothing verifies it.** Each type
  carries its own attestation text, and the app prints what it was given: a clearance saying
  the holder has no pending case says so because the office releasing it says so, not
  because anything looked at the blotter. The seeded wording is placeholder content like the
  hotlines — reconcile each with the barangay's own form. The *municipal* document is still
  generic across all seventeen services.
- **Nothing is paid online at the barangay.** The fee is quoted in the app and settled at
  the barangay hall on collection, so no electronic receipt is issued for it — the app
  never saw that money, and a receipt for a payment it cannot confirm would be an
  assertion rather than a record.
- **The electronic official receipt is real but is not an accredited accountable form.**
  It is issued in the settling transaction, numbered from one municipal series, carries a
  verification code anybody can check, and is frozen against later edits. Whether it
  stands as this municipality's Official Receipt is a question of authority the app
  cannot grant — see the pre-launch checklist. Nothing issues a receipt for cash taken
  over a counter.
- **Sessions** are 12-hour JWTs with no refresh or revocation list. Signing out
  clears the token client-side; it stays valid until it expires.
