# CLAUDE.md — eLGU Citizen Portal

Handoff notes for continuing this project in Claude Code.

## What this is

A mobile-first PWA for residents of a Philippine city/municipality to transact with the
LGU's own offices: Business Permits & Licensing (BOSS), Social Welfare (CSWDO), the Local
Civil Registrar, the Treasurer's Office, the Office of the Building Official, and the City
Health Office. Barangay-level services are deliberately out of scope — this is the
municipal tier. Built as a functional prototype — realistic UX and data flow, no real
backend or PhilSys integration.

## Stack

- **Vite 8 + React 19 + TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` — no `tailwind.config.js`; all design tokens
  (colors, fonts) live in `src/index.css` under `@theme`.
- **lucide-react** for icons
- **idb-keyval** for IndexedDB-backed offline storage (`src/lib/db.ts`)
- **vite-plugin-pwa** for the web manifest + generated service worker (Workbox, `NetworkFirst`
  for documents, precache for the app shell)
- No router library — navigation is a simple in-memory stack (`src/lib/nav.tsx`) since this
  is a single-session app shell, not a multi-URL site. Swap in `react-router` if deep-linking
  to individual screens becomes a requirement.

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

## Data flow / how offline works

`Application` records are the single source of truth for anything a citizen has submitted or
drafted. They live in IndexedDB via `db.ts`, loaded into a React context on boot
(`useApplications`). Submitting a form while `navigator.onLine` is `false` sets
`isOfflineDraft: true` on the record; when the `online` event fires, `useApplications` sweeps
IndexedDB and flips any pending offline records to synced. This is a **client-side simulation**
— there is no real backend, so "sync" just clears the flag. Wiring a real API: replace the
`upsert`/`getAllApplications` calls in `useApplications.ts` with fetch calls, keep IndexedDB as
the offline queue, and reconcile on reconnect (e.g. POST anything still flagged
`isOfflineDraft`).

## Adding a new service

Everything about a service (fields, requirements, fee, processing time) is data, not code.
Add an entry to `SERVICES` in `src/data/mockData.ts` with a `ServiceField[]` — `ServiceForm.tsx`
renders any combination of `text` / `select` / `date` / `textarea` / `number` fields
automatically, no new screen needed. If a category needs an icon not already in
`src/lib/icons.ts`, import it from `lucide-react` and register it there.

## Known simplifications (intentional, flag if scope grows)

- **PhilSys sync** and the **QR code** are visual only — `qrPattern.ts` renders a deterministic
  but non-scannable pattern seeded from a string. A production build would call an actual
  PhilSys verification API and render a real QR (e.g. via `qrcode` npm package).
- **Payment gateways** (GCash / Maya / Landbank Online) are a UI simulation with a fake
  processing delay — no PCI-relevant code, no real redirect/webhook handling. Real integration
  means server-side webhook verification; do not attempt to "complete" payment purely
  client-side in production.
- **Workflow progression** (Submitted → City Treasury Assessment → Payment → e-Document
  Release) is only advanced automatically at seed time and after a simulated payment.
  There's no backend actor moving the treasury step forward — that would come from real
  staff-facing tooling on the LGU side. `currentStepIndex` is an index into
  `WORKFLOW_STEPS`, so changing that array invalidates stored records; bump `DATA_VERSION`
  when you do.
- Navigation stack resets on reload (in-memory, not URL-based) — acceptable for a kiosk-style
  PWA session but worth revisiting if citizens expect to share/bookmark a specific application's
  URL.

## Commands

```bash
npm install
npm run dev       # http://localhost:5173
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
