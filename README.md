# eLGU Citizen Portal

A mobile-first Progressive Web App for residents of a Philippine Local Government Unit (LGU)
to transact with Barangay, Business Permits & Licensing (BOSS), Social Welfare (CSWDO), and the
Local Civil Registrar — from one pocket app, with offline draft support.

## Features

- **Citizen Digital ID** — PhilSys sync status, barangay/city, and a QR verification card
- **Barangay services** — Clearance, Certificate of Indigency, Residency Verification
- **Business Permits (BOSS)** — one-stop-shop application with tax assessment and payment
- **Social Welfare** — AICS financial assistance, Senior Citizen / PWD ID issuance
- **Civil Registrar** — Birth, Marriage, and Death certificate requests
- **Multi-step workflow tracker** — Submitted → Barangay Verification → City Treasury
  Assessment → Payment → e-Document Release
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
