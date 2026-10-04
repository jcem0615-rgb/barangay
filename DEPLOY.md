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
| `PUBLIC_URL` | **yes, if mailing** | Address residents reach; reset and notification links use it |
| `SMS_TRANSPORT` | optional | `http` plus `SMS_URL`/`SMS_API_KEY` to text residents |

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
- [ ] `PAYMENT_PROVIDER` is a real gateway, **not** `mock`, and `PAYMENT_SECRET` comes
      from a secret store
- [ ] A test payment has been taken end to end, and the treasury's **Payments** tab shows
      it with the gateway's own reference beside it
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
- [ ] **Somebody has decided who in each barangay may open the blotter.** It names people
      accused of things and found guilty of nothing, and every account with a
      `barangay_officer` or `barangay_admin` role for that barangay can read the whole book.
      Issue those accounts to the people who actually hold the office, and revoke them when
      they leave — the app has no finer permission than the role
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
- **A barangay certificate produces no document.** The request reaches "released" and the
  resident is told to collect it; the barangay prints its own certificate as it always has,
  and nothing in the app verifies one. The municipal side renders a signed-at-release PDF
  with a verification code; the barangay side does not.
- **Nothing is paid online at the barangay.** The fee is quoted in the app and settled at
  the barangay hall on collection.
- **Sessions** are 12-hour JWTs with no refresh or revocation list. Signing out
  clears the token client-side; it stays valid until it expires.
