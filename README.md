# eBarangay Portal

A mobile-first Progressive Web App for the residents of a Philippine **barangay**
to get the documents they actually need in a year — a clearance, a certificate
of residency, a certificate of indigency — from the office two streets away,
and for barangay staff to work the requests those residents send them.

> **This repository is a split.** It is the barangay half of
> `jcem0615-rgb/LGU`, separated so it can be worked on on its own and
> integrated back later. Read [SPLIT.md](SPLIT.md) first — it records what
> differs from upstream (four files), what deliberately does not, and how to
> merge in either direction.

## Features

### For residents

- **Certificate requests** — barangay clearance, certificate of residency,
  certificate of indigency, and whatever else the barangay has added to its own
  catalogue
- **Citizen Digital ID** — name, barangay, live programme badges, and a
  single-use QR verification code a counter can check
- **Status tracking** — pending → processing → ready → released, where `ready`
  means "come and collect it" and is enforced server-side, so nobody is told to
  make the trip before the certificate is printed
- **Notice board** — what the barangay has announced, with urgent notices
  reaching every resident's phone
- **Blotter and incident reporting** into the barangay's own book
- **Offline drafts** — forms filled without a connection are saved to IndexedDB
  on-device and sync automatically once you are back online
- **Installable PWA** — web manifest + service worker (Workbox) for offline
  app-shell caching
- **Bilingual** — the resident side is translated; certificate names are not,
  exactly as "Cedula" is not

### For barangay staff

- **Certificate queue** — set the fee, advance a request, or reject it with a
  reason the resident can read
- **Record of Barangay Inhabitants** — the household register
- **Blotter** — the book, with who may open it decided per barangay
- **The hall** — address, hours, phone, seal, and the signatories printed on
  every certificate
- **Council view** for kagawads — the barangay's figures, not a lighter
  officer's console
- **Three roles** — officer, administrator, kagawad — hidden in the UI *and*
  refused by the API, in that order of importance
- **Audit trail** — every status change records who made it and when

## Getting started

The app needs the API running. See `server/README.md`, then:

```bash
# API
cd server && cp .env.example .env && npm install
npm run migrate && npm run seed && npm start
```

```bash
# Web app (another terminal)
npm install
echo "VITE_API_URL=http://localhost:4000/api" > .env.local
npm run dev
```

Open the printed local URL and resize your browser to ~390–430px wide (or use
dev tools' device toolbar) for the intended mobile frame. Desktop widths get a
centered, boxed layout.

**The web app you get is the barangay one; the local API is not.** The build is
barangay by default, but `server/.env.example` leaves `DEPLOYMENT_TIER`
commented out, because `npm run seed` seeds a municipality and the server
refuses to start when the tier and the database disagree. To run the barangay
tier locally, uncomment both lines in `server/.env` and reseed:

```bash
cd server && DEPLOYMENT_TIER=barangay BARANGAY_ID=poblacion npm run provision
```

[SPLIT.md](SPLIT.md) explains why the tier is deployment configuration rather
than a code default.

## Build

```bash
npm run build   # outputs to dist/ — the barangay product, by default
```

```bash
npm run preview # serve the production build locally
```

There is no flag to remember. Upstream this build needed `VITE_PRODUCT=barangay`
and `VITE_DEMO_TIER=barangay` set together, and forgetting them shipped the
municipal app's name and icon; here `barangay` is the default and
`VITE_PRODUCT=municipal` is the opt-out. See [SPLIT.md](SPLIT.md).

## Tech stack

**Web** React 19 · TypeScript · Vite · Tailwind CSS v4 · lucide-react · idb-keyval · vite-plugin-pwa
**API** Node · Express 5 · PostgreSQL · JWT · bcrypt · zod

See `CLAUDE.md` for architecture notes, data flow, and where to extend this;
`server/BARANGAY-TIER.md` for what the barangay tier is and is not.

## Deployment

```bash
docker compose up --build -d
```

```bash
docker compose run --rm app npm run migrate
```

```bash
docker compose run --rm app npm run seed
```

See [DEPLOY.md](DEPLOY.md) for hosting, configuration, and the pre-launch
checklist — in particular *Standing up a barangay*, which is what this
repository deploys.

### Where the demos live

| Product | Repository | Vercel project |
| --- | --- | --- |
| eBarangay Portal | `jcem0615-rgb/barangay` (this one) | `barangay` |
| eLGU Citizen Portal | `jcem0615-rgb/LGU` | `elgu-citizen-portal` / `lgu` |

`render.yaml` here deploys the barangay demo only. The municipal demo and the
owner portal are applied from the eLGU repository — see [SPLIT.md](SPLIT.md).
