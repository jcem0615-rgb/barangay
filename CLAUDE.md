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
  data/mockData.ts       Resident profile, 6 service categories, 17 services, 8 sectoral
                         programmes, 2 seed applications, and DATA_VERSION
  i18n/strings.ts        English + Filipino dictionaries (en is the source of truth)
  lib/
    i18n.tsx              I18nProvider + useT(); language persisted in localStorage
    textScale.tsx         TextScaleProvider + useTextScale(); drives --text-scale
    nav.tsx               Screen stack + useNav()
    appData.tsx            React context wrapping useApplications()
    useApplications.ts     Loads requests and drafts from the API, syncs the offline outbox
    useDraft.ts            Autosaves a half-filled form: device first, server debounced
    schedule.ts            Working-day arithmetic for the "apply today" quote only
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
- `admin` additionally gets its Accounts tab, for creating and revoking staff accounts

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

Staff actions notify the resident: the notification row is written inside the same
transaction as the change, and email/SMS are dispatched after it commits without
blocking the response (`server/src/notifications.ts`).

Workflow progression belongs to the server. Staff call assess / advance / reject; the
resident calls pay. The client never sets `currentStepIndex` itself. Paying moves a
request to the final step but does not close it — the office advances it once more, and
that release step renders and stores the PDF (`server/src/documents.ts`).

## Adding a new service

Everything about a service (fields, requirements, fee, processing time) is data, not code.
Add an entry to `SERVICES` in `src/data/mockData.ts` with a `ServiceField[]` (and a
`processingDaysMin`/`Max` matching its `processingTime` prose) — `ServiceForm.tsx`
renders any combination of `text` / `select` / `date` / `textarea` / `number` fields
automatically, no new screen needed. If a category needs an icon not already in
`src/lib/icons.ts`, import it from `lucide-react` and register it there.

## Language (English / Filipino)

The resident app ships in both. `src/i18n/strings.ts` holds two dictionaries; `en` is the
source of truth and `fil` is typed as `Record<StringKey, string>`, so adding an English
string without its Filipino counterpart is a compile error rather than a stray English
word in a Filipino screen. `src/lib/i18n.tsx` provides `I18nProvider` and `useT()`
(`const { t, language, setLanguage } = useT()`); `t('some.key', { name })` substitutes
`{name}` placeholders. The choice is stored in localStorage and, on a first visit, taken
from `navigator.language` (`fil`/`tl` -> Filipino). `LanguageToggle` sits in Profile and,
in a compact variant, on the sign-in screen so residents can switch before logging in.

Two deliberate boundaries:

- **The staff console stays English.** Municipal employees work in English-language
  government documents and forms; translating the queue would put staff and the paperwork
  in front of them in different languages.
- **Official document and office names are not translated** — "Cedula", "Building Permit",
  "Municipal Treasurer's Office". Those are what people say at the counter, and they come
  from the service catalogue (the server), not from the dictionaries. Service descriptions,
  requirements, and form field labels are catalogue data too, so they render in whatever
  language the catalogue was authored in.

## Attaching requirements

A service's `requirements` are a checklist on the request, and the resident supplies each
one two ways: **Take photo**, which hands the job to the phone's own camera app, or
**Attach file** for a PDF or picture they already have.

The camera is `<input type="file" accept="image/*" capture="environment">` rather than a
`getUserMedia` preview in the page. The native camera focuses, uses the flash and applies
the phone's processing, so the office gets a document photo it can actually read; an
in-page preview would be a worse picture and more code. `useHasCamera` hides the option
when `enumerateDevices` reports no `videoinput`, falling back to "this is a touch device"
where the API is unavailable (an insecure context), so a phone never loses the feature to
a failed capability check.

Photos are shrunk in the browser first (`src/lib/imageCompress.ts`): a document is scaled
to a 2000px long edge and re-encoded as JPEG, which turns a 6 MB phone photo into a few
hundred KB with no loss a clerk would notice. It is deliberately conservative — anything
canvas cannot decode (HEIC) passes through untouched, EXIF rotation is applied rather than
baked in, and a result that came out larger than the original is discarded.

**10 MB per file, at most 10 files per request**, enforced in `server/src/uploads.ts` and
checked again in the browser before the upload starts — the server's limit is the real one,
but discovering it after pushing 11 MB over a mobile connection is not a usable answer.
Type is decided by magic bytes, never the filename or the declared MIME type.

A service with requirements says so on the submit-success screen and offers to go straight
to the list, because the office cannot act until the files are in and nothing else in the
flow would tell the resident that.

## Verifying an ID at the counter

The card proves nothing on its own. It can be screenshotted, and the programme badges on it
are worth real money — a senior-citizen record is a 20% statutory discount, a 4Ps record is
a cash grant — so it is exactly the thing worth faking.

So the ID shows a code the resident reads out. It lives **ninety seconds** and is **consumed
the first time a clerk checks it**: a screenshot is stale before it reaches a window, and a
code passed along buys nothing. Issuing a new one retires any still outstanding, so a code
left open in another tab is not a second key. Only the hash is stored
(`server/src/idVerification.ts`), like reset tokens.

The three failure modes are reported apart because they mean different things at a counter:
**unknown** is a typo or a forgery, **expired** just needs the resident to look again, and
**used** means somebody already checked it.

**Every office can check** — a clerk anywhere may be handed a senior-citizen discount to
verify — but what comes back is scoped to that question: a face, a name, where they live,
the PhilSys number's last four digits, and the entitlements **live on the record right now**,
not whatever the card was showing when it was screenshotted. No email, no phone, no request
history, never the whole PhilSys number.

This is not a directory. The only way in is a code the resident chose to show, so every
check is one the resident started. The portrait is reachable for five minutes and only by
the clerk who performed that check — `GET /api/staff/verify-id/:id/photo` returns 404 to
anyone else, which keeps the "only the resident sees their face" rule intact everywhere a
resident has not just presented themselves. Each check records who ran it.

## Emergency hotlines

The digital ID carries the numbers to ring when something goes wrong, because a physical
government ID does and because a resident in trouble should not have to work out which
level of government answers which emergency. They are authored in `EMERGENCY_CONTACTS`
(`src/data/mockData.ts`), seeded into `emergency_contacts`, and published on
`/api/catalogue` — public, since a hotline is not something to sign in for.

Municipal numbers are listed first and the nationwide ones grouped below, so a resident
can see what still answers if the municipal line is down. Every row is a real `tel:` link.

**The catalogue is cached on the device** (`elgu-catalogue-v1` in localStorage) and the
provider hydrates from it before the network answers. Everything reads better from cache
than from nothing, but the hotlines are why it exists: someone needing one is very often
somewhere with no signal, and a number that only works online is not a number to put on an
ID. The network copy still wins the moment it arrives.

**911 and 143 are real and correct nationwide** — the National Emergency Hotline and the
Philippine Red Cross. **Every municipal number is a placeholder** for this sample LGU;
replace them all before deploying and re-check them whenever the offices reorganise. A
hotline that rings nowhere is worse than none at all, because a resident will trust it in
the moment they can least afford to.

## The ID portrait

The digital ID carries the resident's face, because a card a counter clerk cannot check
against the person holding it is not doing the job. It is set from the ID screen, either
with **Take a selfie** (`capture="user"` — the front camera) or by choosing an existing
photo, and can be removed.

`resident_profiles.photo_key` points into the same object store as request attachments, so
one storage implementation covers both. The type is decided by magic bytes and must be an
image: PDF sniffs cleanly but is not a picture, and SVG is refused outright because the ID
renders the file inline in an `<img>`. 4 MB cap, well above what a compressed portrait
needs.

The portrait is cropped to a centred square and scaled to 900px before upload — it renders
at about 80px, and a 6 MB selfie is pure waiting.

**Only the resident sees it.** Every route is scoped to `req.user.id` and there is no
endpoint for reading another resident's; staff check identity against the physical ID at
the counter, so the console has no reason to hold a face for everyone it has served. The
image is fetched as a blob and handed to the DOM as an object URL, because `<img src>`
cannot carry the bearer token.

## Form validation

A service's fields are catalogue data, so the rules they imply are enforced from the same
place. `checkFormValues` (`server/src/routes/requests.ts`) rejects a submission that is
missing a required field, puts a value in a `select` that is not one of its options, a
non-number in a `number`, or a date that never existed ("2026-02-31"). Errors name the
field the way the form named it — "Business address is required", not `businessAddress`.

The browser checks the same rules first, but nothing stops a caller POSTing straight past
the form, so the server is what makes them true. The client renders a real `<select>` and
native `number`/`date` inputs, so ordinary use never reaches these rejections.

**Drafts are deliberately exempt.** A draft is half-finished by definition, and often
mid-keystroke — a date reading `199`, a select reading `New`. It is held only to the rules
that protect the store itself (declared fields, sane lengths); everything else waits until
the resident submits. That split is the `complete` flag on `checkFormValues`.

Server test fixtures build their submissions from the live catalogue
(`server/test/fixtures.mjs`) rather than hand-writing partial forms, so a fixture cannot
drift from the service it fills in.

## Expected ready dates

`processingTime` is prose for the counter ("3–5 working days"); `processingDaysMin` and
`processingDaysMax` are the same promise as numbers, so a date can be worked out instead
of asking a resident to count weekends. Both are authored in `src/data/mockData.ts`.

Two things make this more than adding days to a date.

**Working days.** `server/src/schedule.ts` steps over Saturdays, Sundays and anything in
the `holidays` table. National holidays move each year by proclamation and a municipality
declares its own — a founding anniversary closes the hall as surely as Christmas — so both
are rows (`HOLIDAYS` in `mockData.ts`, seeded), and a wrong date is a row to fix rather
than a release to cut. **The seeded dates are 2026 placeholders: check them against the
year's proclamation and replace the local ones before deploying.**

**The clock is the office's, not the calendar's.** It runs while the office holds the
request and stops while the request waits on the resident to pay, so `expectedReady` is
null and `awaitingResident` true until the fee is settled — an office is not late because
a permit sat unpaid for a week. `requests.paid_at` records when the clock restarts. A
completed or rejected request has no estimate at all.

Every estimate on a real request comes from the server. `src/lib/schedule.ts` duplicates
only the arithmetic, for the one thing the server cannot answer: what a resident would be
quoted if they applied *right now*, on the form, before a request exists. The holiday
calendar is not duplicated — it rides along on `/api/catalogue`.

## Drafts

A half-filled form is kept in two places, because they solve different problems.

**IndexedDB, on every keystroke** (`saveLocalDraft` in `src/lib/db.ts`). Free, local, and
works with no connection — this is what stops a phone call or a back-swipe from costing
someone a five-field business-permit form.

**The server, debounced 1.2s** (`PUT /api/requests/drafts/:serviceId`). Durable, reaches
the resident's other devices, and is what the Drafts tab lists.

`src/lib/useDraft.ts` runs both. The local copy is deleted only once the server confirms
it, so a copy still sitting there means the server has not got that version — which makes
it the newer of the two and the one to restore on return. The status label reads
"Saved on this device" until the server acknowledges, then "Saved".

**Drafts are their own table, not a `draft` row in `requests`.** A draft is something no
office has been asked to look at, and `request_drafts` cannot appear in a department queue
through a query that forgot to exclude it — the separation is the guarantee, rather than a
`status <> 'draft'` clause every future query has to remember. It also keeps reference
numbers honest: a number is drawn from `request_counters` at submit, so a draft never
consumes one.

One draft per resident per service, so tapping a service resumes what you had rather than
leaving a pile of near-identical copies. Submitting deletes the draft inside the same
transaction as the insert, so a lost response cannot leave a resident with both a filed
request and the draft of it.

## Office reports

The Reports tab answers one question for a department head: what did this office do,
and was it on time. `GET /api/staff/reports` aggregates a period; the console renders
it and offers the same figures as CSV.

**Two turnaround clocks, because either alone lies.** *Office days* run from
`paid_at ?? submitted_at` to release — only while the office actually held the request.
*Resident days* run from submission to release regardless. Quoting only the first
flatters the office; quoting only the second blames it for a permit that sat unpaid for
a week. Both are shown, and **the gap between them is itself the finding** — a wide gap
is a payment step residents are struggling with, not a slow office.

On-time is judged against the catalogue's own `processingDaysMax` for that service, on
the office clock — the same promise the resident was quoted when they applied, so the
report cannot drift from the front of the app.

**Medians, not means.** One permit stuck behind a land dispute for eight months would
drag a mean until the number described nothing. The median says what a normal request
looks like, and a separate p90 column says how bad the tail gets, which is the pair a
head actually needs.

The arithmetic is working days (`workingDaysBetween` in `server/src/schedule.ts`), so it
skips weekends and the `holidays` table exactly as the expected-ready-date quote does —
an office is not late for a day the hall was shut.

**Scope is the server's, never the query's.** A staff account gets its own departments;
naming a `departmentId` it does not serve is a 403, not an empty report. An admin sees
every office and may narrow to one. Periods are capped at one year
(`MAX_PERIOD_DAYS`), which is what keeps an unbounded scan out of the queue table.

Reports are read-only and derived — there is no reports table to fall out of date, and
nothing here can change a request.

## Accessibility

The app registers senior citizens and persons with disability, so legibility is a
requirement rather than a polish item.

**Text size is resident-controlled.** Every font size in the resident app is authored as
`text-[calc(<base>px_*_var(--text-scale))]`, so the single `--text-scale` custom property
set in `src/index.css` resizes the whole interface. `TextScaleProvider`
(`src/lib/textScale.tsx`) writes it from a Normal / Large / Largest control in Profile,
persisted in localStorage like the language choice. Each option in the control renders at
the size it selects — and is deliberately *not* scaled itself, so the choice stays legible
while you are making it.

If you add a screen, write its font sizes the same way. A bare `text-[13px]` will not
respond to the control, and nothing will tell you.

Body copy sits at 13.5–15px at Normal and 17.5–19.5px at Largest. Secondary text is
`text-slate-500` (~4.8:1 on white) rather than `slate-400` (~2.9:1), which failed WCAG AA.
The `.tap-target` class gives a 44px minimum height and is applied to the bottom nav,
Profile rows, filter chips and the toggles.

## Sectoral registries and poverty-reduction programmes

The digital ID shows what the municipality has on record for a resident: 4Ps, the
Listahanan indigent register and the Sustainable Livelihood Program on the
poverty-reduction side, and the sectoral lists — senior citizen, PWD, solo parent,
farmer/fisherfolk (RSBSA), indigenous peoples — that carry statutory discounts and
priority lanes. The catalogue is authored in `SECTORAL_PROGRAMS` (`src/data/mockData.ts`),
seeded into `sectoral_programs`, and read back through `/api/catalogue`; a resident's
memberships live in `resident_programs` and ride along with `/auth/me`.

**Membership is issued, never self-declared.** A senior-citizen badge is a 20% statutory
discount and a 4Ps record is a cash grant, so `mayAdministerPrograms` (`server/src/programs.ts`)
restricts writes to CSWDO staff and admins — being able to open someone's request in another
queue is not authority to enrol them. Staff reach the record through a request the office is
already handling, which is why there is no resident-search endpoint to abuse. Every grant and
revoke notifies the resident, recorded in the same transaction as the change.

`expired` is computed on read rather than stored, so a lapsed solo-parent ID reads as
"renew at the issuing office" on the day it lapses, with no nightly job. Expired records
still show on the ID screen but are dropped from the badges on the card face — a lapsed
entitlement must not read as a live one at a counter.

Programme names, ID labels and issuing offices are catalogue data, so they stay in English
in both languages, exactly like "Cedula" and "Building Permit"; the chrome around them
("Programs & assistance", "Valid until") is translated.

## Known simplifications (intentional, flag if scope grows)

- **PhilSys sync** and the **QR code** are visual only — `qrPattern.ts` renders a
  deterministic but non-scannable pattern. Verification is done with the typed code
  instead, which works today; adding a real QR encoder would let a clerk scan it rather
  than type it, and is the natural next step. A production build would also call a real
  PhilSys verification API.
- **Payment** records that a resident chose a method and marks the request paid. There is no
  gateway integration: no redirect, no webhook, no settlement. Wiring a real one means
  server-side webhook verification — never mark a request paid from the client.
- **Document release** produces a real PDF with a verification code, but it is not
  digitally signed. A production system would sign it so tampering is detectable
  rather than relying on the code lookup alone.
- **Attachments** are type-checked by magic number, scanned by clamd when
  `CLAMAV_HOST` is set, and served only as downloads. Scanning is off by default
  in development and **fails closed** when configured — see `server/README.md`.
- **The farmer registry (RSBSA)** is really the Municipal Agriculture Office's, and PWD
  and senior-citizen records are OSCA's. This app has neither office, so CSWDO administers
  every sectoral register. Adding those offices means a new department row and moving the
  `REGISTRAR_DEPARTMENT` check in `server/src/programs.ts` to a per-programme one.
- **Programme enrolment is reached through a request**, so a resident who has never filed
  one cannot be enrolled from the console. A real deployment would want a resident lookup,
  which is a new authorization surface worth designing deliberately rather than bolting on.
- **Reports are computed per request**, scanning the period rather than reading a rolled-up
  table. At a municipality's volume that is the right trade — no aggregation to fall out of
  date, and a figure is never stale. It is also why the period is capped at a year; if the
  scan ever gets slow, add an index on `(department_id, submitted_at)` before reaching for a
  summary table.
- **The holiday calendar** is seeded with 2026 Philippine dates and two invented local
  ones. National holidays move each year by proclamation, so this needs checking annually
  and the local rows replacing — an out-of-date calendar quietly promises dates on which
  the hall is shut. There is no admin screen for it yet; it is a reseed.
- **Office addresses, hours and phone numbers** in `SERVICE_CATEGORIES` are placeholders
  for a sample municipality. Replace them and reseed before a real deployment; the Data
  Privacy screen's DPO address too.
- **The municipal emergency hotlines** in `EMERGENCY_CONTACTS` are placeholders as well,
  and matter more than the rest: verify every one against the LGU before launch. The
  national numbers (911, 143) are correct as published.
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
- **Queue paging** is keyset on `(submitted_at, id)`; the cursor must carry the
  timestamp at full microsecond precision or pages overlap. See `server/README.md`.
- Navigation stack resets on reload (in-memory, not URL-based).

## Demo build

`VITE_DEMO=1 npm run build` produces a build that answers every API call in the
browser (`src/lib/demoServer.ts`) instead of over the network, so the app can be
clicked through without Postgres and the API. Its rules mirror the server's —
department scoping, workflow order, who may read what — so the demo does not
teach anything the real system would refuse.

It is opt-in at build time and tree-shaken out of the production bundle; check with
`grep -o "elgu-demo-state-v[0-9]*" dist/assets/*.js` after a normal build, which should
find nothing. (Don't grep for `demoServer` — minification renames it, so that search
comes back empty for a demo build too and proves nothing.)
State lives in this browser's localStorage, so a second window or profile starts
over: switching role means signing out, not opening another window. The seed includes
a year of closed requests across all six offices (`seedHistory`) belonging to residents
who are not sign-in accounts, so the Reports tab has something to report on while the
demo resident's own list stays short enough to read. Bump `STORE_KEY` whenever the seed
shape changes, or returning browsers keep the old state.

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
health) with the password printed by `npm run seed`. Sign in as `cswdo@` to see the
programme record on a request. Residents register in the app.

```bash
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
```

## Suggested next steps

1. Replace mock icons in `public/icons/` with a real LGU seal / wordmark.
2. Add a real QR encoder so the verification code can be scanned rather than typed — the
   code itself already works, this only removes the typing.
3. Say what happens next per workflow step, and what to bring to the counter on release —
   the expected date is there now, but the steps are still bare labels.
4. Consider `react-router` if screens need shareable URLs.
5. Wire a real backend once one exists — the `Application` type and `db.ts` interface are
   already shaped to make that a drop-in swap.
