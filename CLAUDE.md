# CLAUDE.md — eLGU Citizen Portal

Handoff notes for continuing this project in Claude Code.

## What this is

A mobile-first PWA for residents of a Philippine municipality to transact with the
LGU's own offices: Business Permits & Licensing (BOSS), Social Welfare (CSWDO), the Local
Civil Registrar, the Treasurer's Office, the Office of the Building Official, and the
Municipal Health Office. Barangay-level services are deliberately out of scope — this is the
municipal tier.

Both sides of the system live here: the resident PWA and the staff-facing department
console, backed by a real Node + Postgres API with accounts and roles (`server/`).
PhilSys verification and payment settlement are still simulated.

## Stack

- **Vite 8 + React 19 + TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` — no `tailwind.config.js`; all design tokens
  (colors, fonts) live in `src/index.css` under `@theme`.
- **lucide-react** for icons
- **idb-keyval** for the offline submission outbox (`src/lib/db.ts`)
- **vite-plugin-pwa** for the web manifest + generated service worker (Workbox, `NetworkFirst`
  for documents, precache for the app shell)
- No router library — navigation is a simple in-memory stack (`src/lib/nav.tsx`) since this
  is a single-session app shell, not a multi-URL site. Swap in `react-router` if deep-linking
  to individual screens becomes a requirement.
- **Backend**: Node + Express + Postgres in `server/` (see `server/README.md`). The app will
  not function without it — there is no offline demo mode.

## Project structure

```
src/
  types.ts              Domain model: ServiceDefinition, Application, ResidentProfile, etc.
  data/mockData.ts       Resident profile, 6 service categories, 17 services, 2 seed applications,
                         and DATA_VERSION (bump to rebuild existing on-device stores)
  lib/
    nav.tsx               Screen stack + useNav()
    appData.tsx            React context wrapping useApplications()
    useApplications.ts     Loads/saves Application records via db.ts, auto-syncs offline drafts
    db.ts                  idb-keyval wrapper (IndexedDB, store name "elgu-citizen-portal")
    useOnlineStatus.ts      navigator.onLine + online/offline listeners
    icons.ts                lucide icon name -> component lookup
    qrPattern.ts             Deterministic pseudo-QR grid generator (seeded, no external dep)
  components/            Reusable UI: IDCard, WorkflowTracker, StatusPill, FormField, etc.
  screens/                One component per Screen variant in nav.tsx
  App.tsx                 Providers + ScreenRouter switch + bottom nav visibility
```

## Design tokens (in `src/index.css`)

- Navy `--color-navy-800: #1e3a8a` (primary), `--color-navy-950` for near-black text
- Gold `--color-gold-500: #fbbf24` (accent, used sparingly — status, seal ring, CTAs)
- Canvas `--color-slate-canvas: #f1f4f9`
- Display type: **Plus Jakarta Sans** (`.font-display`, loaded via Google Fonts in `index.html`)
- Body type: **Inter**
- Signature visual: the `.seal-ring` (guilloché ring, government-security-print reference) and
  `.id-texture` classes behind the Digital ID card — this is the one deliberate flourish; keep
  everything else restrained if you extend the UI.

## Two shells, one bundle

`App.tsx` renders by the role the server reports on `/auth/me`:

- no session → `SignIn` (residents can self-register; staff use issued accounts)
- `resident` → the mobile PWA shell
- `staff` / `admin` → `StaffConsole`, the desk-width department queue

Roles are a server-side fact. The shell is a rendering convenience, never a control —
the API refuses cross-role and cross-department access on its own.

## Data flow / how offline works

The **API is the source of truth**. `useApplications` loads a resident's requests from
`GET /api/requests`; the office catalogue comes from `GET /api/catalogue` via
`CatalogueProvider`. `src/data/mockData.ts` is now only the *authoring* source for that
catalogue — `server/src/seed.ts` imports it to seed the database, and the app reads it back
from the server at runtime.

IndexedDB (`src/lib/db.ts`) is now an **outbox**, not a store: submitting while offline
queues a `PendingSubmission` on-device and shows it in the list immediately. When the
`online` event fires, `flushOutbox` POSTs each queued item oldest-first, passing its original
timestamp so the server records when the resident actually filled it in. A submission the
server rejects with a 4xx is dropped rather than retried forever.

Workflow progression belongs to the server. Staff call assess / advance / reject; the
resident calls pay. The client never sets `currentStepIndex` itself. Paying moves a
request to the final step but does not close it — the office advances it once more, and
that release step renders and stores the PDF (`server/src/documents.ts`).

## Adding a new service

## Adding a new service

Everything about a service (fields, requirements, fee, processing time) is data, not code.
Add an entry to `SERVICES` in `src/data/mockData.ts` with a `ServiceField[]` — `ServiceForm.tsx`
renders any combination of `text` / `select` / `date` / `textarea` / `number` fields
automatically, no new screen needed. If a category needs an icon not already in
`src/lib/icons.ts`, import it from `lucide-react` and register it there.

## Known simplifications (intentional, flag if scope grows)

- **PhilSys sync** and the **QR code** are visual only — `qrPattern.ts` renders a
  deterministic but non-scannable pattern. A production build would call a real PhilSys
  verification API and render a scannable QR.
- **Payment** records that a resident chose a method and marks the request paid. There is no
  gateway integration: no redirect, no webhook, no settlement. Wiring a real one means
  server-side webhook verification — never mark a request paid from the client.
- **Document release** produces a real PDF with a verification code, but it is not
  digitally signed. A production system would sign it so tampering is detectable
  rather than relying on the code lookup alone.
- **Attachments** are type-checked by magic number, scanned by clamd when
  `CLAMAV_HOST` is set, and served only as downloads. Scanning is off by default
  in development and **fails closed** when configured — see `server/README.md`.
- **Drafts** have no API endpoint yet. `ApplicationStatus` still includes `draft` and the
  request list still has a Drafts tab, but nothing writes one; the Save Draft button was
  removed rather than left lying about what it did.
- **Sessions** are 12-hour JWTs with no refresh or general revocation list. Signing out
  clears the token client-side; it stays valid until it expires. The one exception is a
  password change, which `users.password_changed_at` enforces on every request.
- **Reset links** need real mail (`SMTP_URL`). On the default console transport the link
  is only logged, so no resident can actually recover an account.
- **Login throttling** is per-account (5 failures / 15 min) and per-IP (20 / 15 min),
  recorded in Postgres so it survives restarts and spans instances. Set `TRUST_PROXY` to
  the real number of proxies in front of the API, or the per-IP limit counts the load
  balancer instead of the client. A locked account rejects the correct password too, which
  means an attacker who knows an address can keep that resident out for 15 minutes at a
  time — the accepted trade for not leaving accounts guessable.
- **Required fields** are enforced in the client only. The API rejects undeclared
  fields and over-long values, but not a submission missing a required one.
- Navigation stack resets on reload (in-memory, not URL-based).

## Deployment

One container: the API serves the built SPA same-origin, so there is no CORS in
production. `Dockerfile` builds the web app and runs the API; `docker-compose.yml`
brings up Postgres alongside it. See `DEPLOY.md` for configuration and the
pre-launch checklist.

Node 22 strips TypeScript natively, so the server has no build step and `tsx` is
only a dev dependency. The container runs `node src/index.ts` directly rather
than through a wrapper — a wrapper process swallows SIGTERM, which would defeat
the graceful shutdown in `src/index.ts`.

## Commands

Two processes: the API and the web app.

```bash
# 1. API (needs Postgres running)
cd server
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run migrate && npm run seed
npm start                     # http://localhost:4000

# 2. Web app, in another terminal
npm install
echo "VITE_API_URL=http://localhost:4000/api" > .env.local
npm run dev                   # http://localhost:5173
```

Seeded staff logins are `<office>@sanfernando.gov.ph` (treasury, bpls, obo, lcr, cswdo,
health) with the password printed by `npm run seed`. Residents register in the app.

```bash
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
```

## Suggested next steps

1. Replace mock icons in `public/icons/` with a real LGU seal / wordmark.
2. Add a real QR/barcode library if the ID needs to be scannable by counter staff.
3. Add basic form persistence-on-blur (currently drafts only save on explicit "Save Draft" tap).
4. Consider `react-router` if screens need shareable URLs.
5. Wire a real backend once one exists — the `Application` type and `db.ts` interface are
   already shaped to make that a drop-in swap.
