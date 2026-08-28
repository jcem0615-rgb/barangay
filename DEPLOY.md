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
- [ ] Seeded staff passwords have been changed
- [ ] Postgres has automated backups with a tested restore
- [ ] TLS is enforced and HTTP redirects
- [ ] You have somewhere to read `console.error` output

## Scaling

The app is stateless — sessions are JWTs and rate-limit counters live in
Postgres — so running several instances behind a load balancer works with no
extra coordination. Raise `PGPOOL_MAX` only alongside Postgres's own
`max_connections`: instances × `PGPOOL_MAX` must stay under it.

## Still simulated

Deploying does not make these real, and residents will notice:

- **Payment** records a chosen method and marks the request paid. There is no
  gateway, redirect, or webhook. Wiring a real one means verifying the webhook
  server-side — never mark a request paid from the client.
- **PhilSys verification** and the ID **QR code** are visual only.
- **Sessions** are 12-hour JWTs with no refresh or revocation list. Signing out
  clears the token client-side; it stays valid until it expires.
