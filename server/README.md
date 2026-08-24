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

## Workflow

`Submitted → Municipal Treasury Assessment → Payment → e-Document Release`

The server owns progression. Staff move a request forward; the **Payment** step
is the resident's to complete, and `advance` refuses to step over an unpaid fee.
Every transition is appended to `request_events` with the actor who made it, so
a request's history is auditable rather than inferred.

## Tests

```bash
npm run test:e2e   # needs the server running against a migrated, seeded database
```

Covers registration and login, request submission, the full assess → pay →
release path, rejection, and the access rules: one department cannot read or act
on another's requests, and one resident cannot read another's.

## Notes

- Fees are stored as integer centavos and exposed as pesos, so amounts stay exact.
- Passwords are bcrypt-hashed (cost 12). Login compares a hash even when the email
  is unknown, so responses don't reveal which accounts exist.
- Tokens carry only a user id; the user, role, and department assignments are
  re-read from the database on every request, so revoking access takes effect at once.
