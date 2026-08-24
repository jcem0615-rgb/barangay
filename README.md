# eLGU Citizen Portal

A mobile-first Progressive Web App for residents of a Philippine Local Government Unit (LGU)
to transact with its municipal offices, and for municipal staff to work the requests those
residents send them.

## Features

- **Citizen Digital ID** — PhilSys sync status, barangay/municipality, and a QR verification card
- **Business Permits (BOSS)** — one-stop-shop application, occupational permit
- **Social Welfare** — AICS financial assistance, Senior Citizen / PWD ID, Solo Parent ID
- **Civil Registrar** — Birth, Marriage, and Death certificates, marriage license application
- **Treasurer's Office** — Cedula, real property tax assessment and tax clearance
- **Building & Zoning** — zoning clearance, building permit, certificate of occupancy
- **Health Office** — health certificate, sanitary permit
- **Multi-step workflow tracker** — Submitted → Municipal Treasury Assessment → Payment →
  e-Document Release
- **Handling office shown per request** — every request names the department working on it
- **Payment simulation** — GCash, Maya, Landbank Online
- **Offline drafts** — forms submitted without a connection are saved to IndexedDB on-device
  and sync automatically once you're back online
- **Installable PWA** — web manifest + service worker (Workbox) for offline app-shell caching
- **Department console** — staff sign in and see only their own office's queue, set the
  assessed fee, advance a request, or reject it with a reason
- **Accounts and roles** — residents register themselves; staff accounts are issued per office
- **Audit trail** — every status change records who made it and when

## Getting started

The app needs the API running. See `server/README.md`, then:

```bash
# API
cd server && cp .env.example .env && npm install
npm run migrate && npm run seed && npm start

# Web app (another terminal)
npm install
echo "VITE_API_URL=http://localhost:4000/api" > .env.local
npm run dev
```

Open the printed local URL and resize your browser to ~390–430px wide (or open dev tools'
device toolbar) for the intended mobile frame. Desktop widths get a centered, boxed layout.

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```

## Tech stack

**Web** React 19 · TypeScript · Vite · Tailwind CSS v4 · lucide-react · idb-keyval · vite-plugin-pwa
**API** Node · Express 5 · PostgreSQL · JWT · bcrypt · zod

See `CLAUDE.md` for architecture notes, data flow, and where to extend this.
