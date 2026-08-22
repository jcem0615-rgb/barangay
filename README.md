# eLGU Citizen Portal

A mobile-first Progressive Web App for residents of a Philippine Local Government Unit (LGU)
to transact with its municipal offices — from one pocket app, with offline draft support.

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

## Getting started

```bash
npm install
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

React 19 · TypeScript · Vite · Tailwind CSS v4 · lucide-react · idb-keyval (IndexedDB) ·
vite-plugin-pwa

See `CLAUDE.md` for architecture notes, data flow, and where to extend this.
