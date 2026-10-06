# CLAUDE.md — eLGU Citizen Portal

Handoff notes for continuing this project in Claude Code.

## What this is

A mobile-first PWA for residents of a Philippine municipality — the sample data is
**Malasiqui, Pangasinan** — to transact with the LGU's own offices: Business Permits &
Licensing (BOSS), Social Welfare (CSWDO), the Local Civil Registrar, the Treasurer's
Office, the Office of the Building Official, and the Municipal Health Office.

**It now covers both tiers of local government.** The barangay issues the document most
residents actually need in a year — a clearance, a certificate of residency, a certificate
of indigency — from an office two streets away, and it has its own records, its own roles
and its own console here. The two tiers are kept visibly apart; see *Two tiers of
government* below.

Both sides of the system live here: the resident PWA and the staff-facing consoles,
backed by a real Node + Postgres API with accounts and roles (`server/`).
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
                         programmes, 6 barangays and what they issue, 2 seed
                         applications, and DATA_VERSION
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
    search.ts               Finds a service by what residents call it, on the cached catalogue
    qrPattern.ts             Real QR matrix (qrcode-generator) + the verification link it carries
    scannedCode.ts           Reads ?verify= once at startup, for a clerk arriving by scan
  components/            Reusable UI: IDCard, WorkflowTracker, StatusPill, FormField, etc.
  screens/                One component per Screen variant in nav.tsx
    barangay/             The barangay's own console: the certificate queue, the board of
                          notices, the blotter, the register of inhabitants and the
                          hall's own details — plus KagawadConsole, the council's
                          separate figures-only shell
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

## Three shells, one bundle

`App.tsx` renders by the role the server reports on `/auth/me`:

- no session → `SignIn` (residents can self-register; staff use issued accounts)
- `resident` → the mobile PWA shell, covering both tiers of government
- `staff` / `admin` → `StaffConsole`, the desk-width municipal department queue
- `admin` additionally gets its Accounts tab, for creating and revoking staff accounts
- `barangay_admin` / `barangay_officer` → `BarangayConsole`, that barangay's own desk
- `barangay_kagawad` → `KagawadConsole`, the council's figures-only view

Roles are a server-side fact. The shell is a rendering convenience, never a control —
the API refuses cross-role, cross-department and cross-barangay access on its own.

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

## Two tiers of government

A resident deals with two levels of local government, and the mistake they actually make is
not knowing which one owns what. A barangay clearance does not come from the municipal
hall; the municipal business permit asks for the barangay one first. Getting it wrong costs
a trip to the wrong counter, which is the expensive part of dealing with an LGU and the
thing this app exists to prevent.

**So the tier is asked once, in the two largest controls on the dashboard**, and everything
else lives inside the answer. Nothing else on that screen competes with them except the
emergency button. The same pair appears as a switch (`TierSwitch`) at the top of both
catalogues, so changing your mind never means walking back to the dashboard, and the tier
you are in is always on screen rather than inferred.

Both tiers sit under the one **Services** tab in the bottom nav. A second nav item would be
a second place to make the same choice, which is the confusion rather than the cure.

**The barangay is a row, not a string.** `BARANGAYS` (`src/data/mockData.ts`) is seeded into
`barangays` and published on `GET /api/barangays`, which is public because the sign-up
screen needs it before anybody has an account. Registration takes a `barangayId` from that
list, stamps `users.barangay_id`, and writes the barangay's *own* name onto the profile —
the municipality rule, one tier down: the register decides what a place is called, not the
browser. A resident who registered before this is asked once in the barangay hub.

**What a barangay issues is shared; what it charges is not** — and since the catalogue
became editable, the row's `barangay_id` is what says which is which. Null is the **shared**
catalogue: the documents every barangay issues, the municipal administrator's to add, edit
and withdraw, because a clearance is the same document in all of them and letting six
offices each invent their own would make a resident's certificate depend on which street
they live on. A barangay id is that barangay's **own** document — one only it issues, its
to manage, invisible to every other barangay and to residents elsewhere. Neither side can
reach the other's rows, and that is a `where` clause rather than a check somebody has to
remember: a shared row is *not found* from inside a barangay console, which is the same
answer another barangay's row gives.

Fees stay the barangay's on both: it overrides what it charges in
`barangay_certificate_fees` and nothing else about a shared document. The fee is **frozen
onto the request** when it is filed, so changing one never rewrites what somebody was
already quoted.

**Withdrawn, never deleted.** `barangay_requests.type_id` references the row, and a
certificate somebody was issued last year has to keep rendering its name, so removing one
sets `active = false`: residents stop being offered it and the history keeps working. The
screens say "withdraw" rather than "delete" because that is what happens.

**A certificate added in-app has no route.** `steps` is authored in `mockData.ts` and an
administrator filling in a form cannot reasonably write a bilingual step chain, so a new
one ships with none and the guide simply shows no chain. `server/test/document-steps.mjs`
checks the invariant against the *authored* set for that reason — it is an authoring rule,
not a fact about whatever is in the database.

**Reference numbers come from one counter for the municipality**, not one per barangay.
Per-barangay numbering reads nicer from inside a barangay, but it makes `BRGY-2026-00001`
mean six different requests, and a reference is quoted down a phone and typed into a search
box — it has to identify a request on its own. How many a barangay has issued is a count,
and the summary answers that.

**A certificate moves in a fixed order**: pending → processing → ready → released, with
rejection reachable from anywhere and requiring a reason the resident can read. `ready`
means "come and collect it", so a resident told that before the certificate is printed
makes a wasted trip — which is why the order is enforced server-side and not merely
rendered. Released and rejected are final. Every move notifies the resident in the same
transaction as the change.

**The barangay console is a separate shell, not a tab in the municipal one**
(`src/screens/barangay/BarangayConsole.tsx`). A barangay secretary does not work a municipal
queue and has no business seeing one; separate shells mean there is no filter to get wrong.
Municipal staff — the administrator included — get 403 from every `/barangay-staff` route,
and barangay accounts get 403 from the municipal ones. A different tier is not a wider one.

**Isolation is the security property, and it is not a parameter.** Every query in
`server/src/routes/barangayStaff.ts` is scoped to the barangay on the signed-in account's
own row, so naming another barangay's request returns 404 rather than 403 — there is
nowhere to name one. Same on the resident side: a request is filed to the barangay on the
resident's record, never to one in the request body.

**Three roles.** The officer processes certificates. The administrator — the captain or the
secretary — does that too, plus the three things that are the barangay's to decide: what it
charges, who works here, and what it has done. The officer's tabs are hidden *and* the API
refuses them, in that order of importance. The officer list is read-only: issuing an account
is a municipal act, because the hall knows who actually holds a barangay office, and making
a barangay an account authority of its own is a larger decision than this needed.

The kagawad is the third and is not a lighter officer — see *The council, and a barangay
that issues its own accounts*.

Barangay accounts are seeded as `admin.<barangay>@malasiqui.gov.ph` (every barangay) and
`officer.<barangay>@malasiqui.gov.ph` plus `kagawad.<barangay>@malasiqui.gov.ph` (the first
one only — enough to show the isolation without seeding a directory). A reseed repairs an existing barangay account's
`barangay_id` if it is missing, since every query in that console scopes on it and an
account without one answers 409 to everything.

**The console stays English**, like the municipal one and for the same reason. The resident
side is translated; certificate names are not, exactly like "Cedula" and "Building Permit".

## Household records (the Record of Barangay Inhabitants)

The Local Government Code makes the barangay secretary keep an updated record of every
inhabitant, and it is what a barangay actually plans from: who to feed, who to evacuate,
how many seniors live on which purok. The `Households` tab is that book.

**This is the one place in the app that is deliberately a directory**, and that is worth
stating plainly because everything else here refuses to be one. The municipal side has no
resident lookup *on purpose* — programme enrolment is reached through a request precisely so
that no endpoint lists residents to search. The register cannot hold that line, since
listing inhabitants is its whole function, so the containment is the barangay boundary
instead: its own book, every statement scoped to the account's own barangay, nothing
readable by the municipality, by another barangay, or by any resident.

**Members are free text, never linked to resident accounts.** This is the same decision the
blotter makes and it matters more here: a link would turn the register into a view onto the
user table, handing a barangay clerk a way to look up any account in the municipality. The
paper register is the barangay's own compilation of who lives where, and keeping it that way
is what keeps the no-lookup rule true everywhere else.

**The figures lead the screen**, because the questions a barangay is asked are always
counts. They are computed over the active register on every read rather than stored — the
same trade the municipal reports make, for the same reason.

**A member with no date of birth is counted in the population and in no age band, and the
screen says so.** A barangay planning a feeding programme off a silently short count is the
harm; `withoutBirthDate` is reported rather than hidden. Age itself is derived on read, like
`expired` on a programme record: a stored age is wrong the day after it is written.

**PWD and 4Ps here are the barangay's own note, not the sectoral register.** A record that
carries a statutory discount or a cash grant is issued by CSWDO and lives in
`resident_programs`; a tick in the RBI is what the barangay wrote down when it visited. They
are labelled "(noted)" in the console so a clerk's checkbox can never read as an entitlement
at a counter.

**Household numbers are per barangay**, which is the one place this app does *not* use a
municipality-wide counter — and the difference is the point. A certificate reference is
quoted down a phone and typed into a municipal search box, so it has to identify one thing
municipality-wide; a household number is an index into one barangay's own book and is never
said outside it. "Household 142" means the 142nd here, which is what a purok leader expects.

**Nothing is deleted.** A household that moved away keeps its row and its number, because
next year's figures have to be comparable with this year's. Taking one out of the active
register is the administrator's and needs a reason — recording who lives where is the day's
work, deciding a household no longer counts changes what the barangay reports upward.

**The head is a member of their own household**, added automatically, because a register
whose head is only a column cannot count its own population. Removing them is refused: the
head is the household, so changing who it is is an edit to the household rather than a
member removal.

## The blotter and the summons

Katarungang Pambarangay (RA 7160, Chapter 7): a dispute is brought to the barangay, the
Punong Barangay calls both sides, and most civil and lesser criminal matters cannot be
filed in court until that has been tried. The blotter is the book it is written in, and
the barangay's own `Blotter` tab is where it now lives.

**This is the most defamatory data in the application, and the rules around it are the
inverse of everything else here.** A blotter entry names a respondent — somebody accused
of something who has been found to have done nothing — so:

- **No resident route reads it.** There is no screen, no endpoint and no field anywhere in
  the resident app. It is not in the Data Privacy export either, which is deliberate: the
  export is what the app holds *about you*, and half of a blotter entry is somebody else's
  name and somebody else's account of what they say you did.
- **Nothing notifies anybody, with one exception: a summons.** Everywhere else a change is
  written with a notification in the same transaction; here that would mean telling somebody
  by push that they have been named in a live quarrel. A hearing is the one case where the
  silence was wrong — the whole point is that two people have to know a date — so issuing
  one sends a reminder to the contacts **the barangay typed in** (`complainant_contact`,
  `respondent_contact`). It goes through the SMS and mail transports directly and *never*
  through the notifications table, which is keyed on a user id and would have forced a
  lookup to attach a row to: the parties stay free text and unmatched to accounts, which is
  the rule that actually mattered. The message carries who is asking, when, where and the
  reference, and nothing else — no narrative, no nature of the complaint, and never the
  other party's name, because a lock screen is not private. **It is not service**:
  `served_at` stays the record of that, the two are shown apart in the console, and the
  reminder line says "this is not service" in those words. What became of it is stored in
  `notify_result` and shown, because a reminder that silently went nowhere is worse than
  none — the barangay stops checking.
- **Municipal staff get 403, administrator included.** This is the barangay's book.
- **Scoping is the same structural rule as the rest of that console**: every statement
  filters on the barangay from the signed-in account's own row, so another barangay's entry
  is 404 rather than 403 — there is nowhere to name one. That includes search, which is
  searching names and is bounded to the barangay doing it.

**The parties are free text, not links to accounts.** A respondent usually has no account,
and matching one would turn this into a place to look up what a named resident stands
accused of. The barangay writes down who was in front of it, exactly as the paper book does.

**Who may do what follows the line the console already draws.** Both roles write the book
and close a matter — recording is the clerk's job. Only the administrator issues a summons
or records what happened at one, because a summons goes out over the Punong Barangay's
name and compels two people to appear on a date.

**Summons are rows, not a column.** The law expects the barangay to try again when somebody
does not appear, and how many times a party was actually called is the fact that matters
later; a single `hearing_date` would lose it. One pending calling at a time, because two
open summons are two dates the parties could turn up on and only one is right. Calling a
hearing is what moves a matter into mediation — nobody should have to set a status
separately and remember to.

**Service is recorded apart from the outcome, because the first decides what the second
means.** A respondent who never received the summons did not fail to appear, and a barangay
recording them as having done so is building on a hole.

**Closing is final and cancels any outstanding hearing**, and it has to say how it ended —
"unsettled" with no reason is the row somebody reconstructs from memory a year later in
front of a court asking why the case arrived without a settlement.

**What this is not is the legal record.** The prescribed KP forms, the Pangkat ng
Tagapagkasundo, the ten-day finality of an amicable settlement and the **Certificate to File
Action** are paper instruments with legal effect. This records that the process happened and
when; it conducts none of it and issues no certificate. The console says so where somebody
closes a matter as unsettled, which is the moment they would otherwise look for one.

## The board of notices

A barangay's oldest piece of communication is a sheet of paper taped to the wall outside the
hall: no water tomorrow, assembly on Sunday, deworming at the health centre. It works for
whoever walks past it that week and for nobody else. The `Notices` tab is that board, and
the resident's barangay hub is the wall.

**Every other barangay feature here refuses to be readable, and this one inverts all of
it.** The blotter names people accused of things and the household register lists who lives
where, so both are console-only, notify nobody, and appear in no resident route and no
privacy export. A notice is the opposite: it is worth nothing until the people it concerns
have seen it. So it has a resident read, it can ring a phone, and the board sits *above* the
certificates in the hub — what the barangay is telling you comes before what you can ask it
for.

**What is scoped here is relevance, not secrecy.** A resident sees their own barangay's
notices and no others, because a water interruption two barangays away is exactly the noise
that teaches somebody to stop reading the ones that matter. The scoping is the same
structural rule as the rest of that console — the barangay comes off the signed-in account's
own row, so another barangay's notice is 404 rather than 403.

**Urgent is the administrator's, and it is the only thing here that reaches a phone.** An
ordinary notice waits on the board for whoever opens the app; an urgent one writes a
notification row for every resident of the barangay. An app where any clerk can ring every
phone in the barangay is an app whose notifications get switched off, and then the one that
mattered goes unread. The officer's console says who does that rather than showing a switch
that answers 403, and the API refuses it either way.

**The fan-out is in the same transaction as the notice**, one row per resident, like every
other notification in this app. A notice that was posted was always announced; there is no
half state where it is on the board and nobody was told. Email, SMS and push go out after
the commit, so a slow mail server cannot hold the notice open. The confirmation says how
many it reached and waits to be dismissed — the one screen stating the blast radius of what
somebody just did should not vanish on a timer.

**A public notice carries its real text on a lock screen**, which is why
`barangay_announcement` is deliberately *not* in `PRIVATE_KINDS`. The rule there protects a
4Ps enrolment from being announced to whoever is holding the phone; "no water from 8am
tomorrow" is taped to a wall in public and is useless as a title with nothing under it.

**Expiry is applied on read**, like `expired` on a programme record and age in the register:
a notice about Saturday stops showing on Sunday with nothing scheduled to make that true. A
past expiry is refused at the point of posting, because a notice nobody could ever see is a
mistake rather than a choice. The barangay still sees a lapsed one in its own list.

**`urgent` is not editable.** The notification went or it did not; flipping the flag
afterwards would either fire a second round for the same notice or leave one marked urgent
that never rang anything. Re-posting is honest about there being a new notice. An ordinary
correction is allowed and the board says **edited** — the first version is what people read,
and somebody who acted on it needs to see that it moved.

**Taking a notice down is the administrator's and keeps the row.** It is the barangay's
public word; what it said last month is a thing somebody asks about. `archived_at` leaves
the board and stays in the console's own archive.

**Urgency is a word and an icon, never a colour alone** — the rule the workflow tracker
follows for whose move it is. Amber, not red: red belongs to the emergency hotlines, and an
urgent notice is worth stopping for without being the button you press when the house is on
fire. The board renders nothing at all when it is empty, rather than keeping a permanent
"no announcements" card in front of the certificates.

## The council, and a barangay that issues its own accounts

A barangay is not only its office. The Sangguniang Barangay — the Punong Barangay and
seven kagawads — legislates, passes the budget, sits on committees and answers to the
people who elected it. None of that is clerical work, and `barangay_kagawad` is
deliberately not "an officer with fewer tabs".

**The kagawad has its own router, and that is the whole security design.**
`barangayStaffRouter` opens with `requireRole('barangay_admin', 'barangay_officer')` across
everything, so every route on it is closed to a kagawad — including every route somebody
adds next year without thinking about this. Putting a third role on that gate and carving
it back out route by route would leave the blotter one forgotten `requireRole` away from a
councillor, and a forgotten gate is exactly the thing that happens. `/barangay-kagawad` is
a separate mount with a separate gate, the same reasoning as the barangay console being a
separate shell rather than a tab in the municipal one: there is no filter to get wrong.

**The line it draws is figures, never people.** A kagawad reads what the office issued and
collected, the register as counts — population, age bands, households per purok — and the
notice board as residents see it. `barangayFigures` is shared with the secretary's own
screen, so the council and the clerk never quote different population numbers at each
other. What a kagawad cannot reach is any individual: no certificate queue, no household
names or addresses, no resident anywhere in any response.

**No blotter, and this is the decision worth stating plainly.** A blotter entry names a
respondent — somebody accused of something who has been found to have done nothing.
Handing seven elected politicians a searchable book of accusations against their own
constituents is a political weapon, and nothing about holding the office requires it. A
kagawad who sits on the Lupong Tagapamayapa is appointed to that separately and would need
an account that says so.

**Read-only, deliberately.** A notice goes out over the barangay's name and the board is
how the barangay speaks, so posting stays with the captain and the clerk — a council seat
is not a megaphone. Widening this later is one route; narrowing it after seven people have
been using it is not.

**The barangay now issues its own clerk and kagawad accounts.** The hall does not know who
holds a barangay office this term and the captain does, so `POST /barangay-staff/officers`
is the barangay's. Everything about it follows the rules already here: the barangay is
stamped from the signed-in account's own row rather than the body, the municipality is
stamped from the register, the account starts with an unusable random password and its
holder chooses their own from an emailed link, and the screen says whether that link
actually sent rather than assuming it did.

**The one exception is the escalation line: a barangay cannot issue an administrator.**
`ISSUABLE` is officer and kagawad and nothing else, so a barangay cannot mint its own
authority and a captain who has been revoked cannot have left one behind. The same list
scopes revocation, in the same statement as the barangay — so an administrator's row is
*not found* rather than refused, which is what stops a captain and a secretary from
revoking each other. Revoking spends any outstanding invitation, because a live reset link
is a way back in.

## The hall, and how long a certificate lasts

Two facts were missing from the barangay tier, and both belong to the same moment: the
one where a resident has to get up and go somewhere.

**"For pickup" is the only status in this app that asks somebody to travel**, and for a
long time the only thing attached to it was the barangay's name. No hours, no address, no
number to ring first. A `barangays` row carried a captain and a secretary — because those
are printed on certificates — and nothing a resident could act on. So the row now carries
the hall's address, its hours, a phone and an email, seeded from `BARANGAYS`
(`src/data/mockData.ts`) and corrected in the barangay's own console thereafter, exactly
as the municipal office details are.

**They are published where they are needed, not everywhere.** `GET /api/barangays` is
public because the sign-up screen needs the list before anybody has an account, and it
still carries only id, name and captain. The hall's details ride on `GET /barangay/me`,
which is the screen that has to answer "come and collect it". The hours are repeated on
the `ready` row itself and in the `ready` notification — a resident deciding whether to
go should not have to scroll to find out whether the office is open.

**The barangay's own name is not editable, and that is the municipality rule one tier
down.** What a place is called belongs to the register. What a barangay corrects is who
holds its two offices and how to reach it — facts it knows, that change at every barangay
election, and that the municipal hall cannot maintain for seventy-three barangays. The
schema is strict, so an unknown key refuses the whole request rather than quietly saving
something different.

**Only the administrator writes; both roles read.** An officer who cannot see what
residents are being told cannot notice that it is wrong, so the tab is theirs too, with
the fields locked and a line saying who changes them. The API refuses their write
regardless, which is the half that matters.

**Every edit is audited in the same transaction**, with the row as it was — `admin_audit`,
the same table and the same reasoning as the municipal hotlines. An administrator can
point the hall's number anywhere, and the only defence against a mistake nobody notices is
a record that still has the old one in it. Phone validation is the same deliberately loose
`looksDialable`: it rules out the unusable and leaves the rest to somebody ringing it.

**The second fact is that a certificate was good forever, which no barangay certificate
is.** `validityDays` on the certificate type says how long the document is honoured, and
`valid_until` on the request says when this particular one lapses.

**It is stamped when the barangay marks it ready, not when it is collected.** `ready` is
the point at which the secretary has prepared and dated the paper, and the paper is what a
bank reads — so a resident who collects three weeks later holds a certificate already
three weeks into its life, and the app says the same thing the document does. Dating it
from collection would have the app claim more validity than the certificate carries, which
is the one error here that costs somebody a trip. It is frozen onto the row like the fee,
so changing a type's period never rewrites what an issued certificate says.

**`expired` is derived on read**, like `expired` on a programme record and age in the
register. A lapsed certificate says "Lapsed on 27 Sep 2026" in words and tells the resident
to ask for a fresh one — amber, not red, and never colour alone.

**A certificate with no stated period says so.** `validityDays` is optional, and null
renders as "your barangay states no validity period for this one" rather than as a silence
a resident would read as "forever". The round trip keeps it null rather than defaulting it
somewhere.

**The periods are placeholders, like the fees and the hotlines.** Nothing in law sets most
of them — what a bank or an employer accepts is practice, and practice differs. The one
exception is the first-time jobseeker certificate, where RA 11261 gives a year; that the
law also makes it a one-time availment is *not* enforced here. Set the rest from what the
deploying LGU's own offices actually ask for.

## How to get a document

`requirements` said *what* to bring. It never said where any of it comes from or
which to get first, and that is the question that actually costs a resident a
morning: somebody who turns up for a business permit without the barangay
clearance is sent away, and the wasted trip is the single most expensive thing
about dealing with an LGU.

So every service and every barangay certificate carries `steps` — an ordered
`ServiceStep[]` (`src/types.ts`), authored in `mockData.ts`, stored as `jsonb`
and published on the catalogue. `DocumentGuide.tsx` renders it as a numbered
vertical chain with a connector line. Vertical because a left-to-right flow chart
is unreadable at 430px, and the order is the only thing the shape has to carry.

**A step that this app can itself issue is a button, not a sentence.** That is
the whole payoff of holding both tiers: a step carrying `certificateId:
'business-clearance'` stops being a thing to go and find out about and becomes
the next tap, which opens *that* document's route. Chains go four deep —
Certificate of Occupancy → Building Permit → Zoning Clearance → Real Property Tax
Clearance → Assessment — and each is walkable.

**The two lists live side by side on purpose.** `requirements` drives the upload
checklist on a filed request; `steps` is the route to having them. They are not
the same granularity and merging them would break both: "pay at the window" is a
real step and never an attachment, and an attachment slot for "DTI registration"
tells nobody that DTI is not the municipality.

**What applies only to some applicants says so before it says what it is**
(`onlyIf`). A food business needs a Sanitary Permit and a hardware store does
not; a resident chasing a document they never needed is the same wasted trip in
the other direction, so the condition is a badge above the label rather than a
footnote under it.

**Links are one-way, even where the real process is not.** The business permit
and the sanitary permit genuinely reference each other — they are filed together
— but a guide that lets a resident tap between two documents forever is worse
than one that says so in a sentence. The cycle is broken deliberately, the link
runs permit → sanitary permit, and `server/test/document-steps.mjs` walks the
whole graph to prove no other cycle exists. That suite also refuses a step
pointing at a service or certificate that does not exist, and a route that ends
on a prerequisite rather than on applying.

**Steps are translated; the names inside them are not.** `ServiceStep.fil` is a
*required* field on the type, so a new service cannot ship an English-only route —
the same guarantee the `fil` dictionary gives the chrome, applied to catalogue
data for the one case that needed it. A step is an instruction a resident has to
follow, which is a different thing from "Cedula" or "Bureau of Fire Protection";
those stay as they are said at a counter, in both languages. What the type cannot
express is a `note` or `onlyIf` written on one side only, so
`server/test/document-steps.mjs` checks that instead, along with a loose heuristic
for a `where` that was copied rather than written.

**The guide ends with the office's phone number, not a disclaimer.** A process
changes without telling an app, and "confirm before you travel" is useless advice
without the number to confirm with. Ringing costs a minute; the trip this exists
to save costs a morning.

**Every chain here is placeholder content, exactly like the hotlines.** They are
a careful reading of how these documents are ordinarily obtained in a Philippine
municipality — they are not this municipality's Citizen's Charter. A step list
that is wrong about what comes first does the precise harm the feature exists to
prevent, under the municipality's own name, which is what makes a resident
believe it. Check every chain against the office's charter before launch.

## Adding a new service

Everything about a service (fields, requirements, fee, processing time) is data, not code.
Add an entry to `SERVICES` in `src/data/mockData.ts` with a `ServiceField[]` (and a
`processingDaysMin`/`Max` matching its `processingTime` prose, and a `steps[]` route —
see *How to get a document*) — `ServiceForm.tsx`
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
- **The two exceptions are both durations and instructions, not names.** A document's
  `steps` carry a required `fil` (see *How to get a document*), because a step is something
  a resident has to *follow* rather than ask for by name. And how long a service takes is
  rendered from `processingDaysMin`/`Max` through `formatProcessingTime`
  (`src/lib/schedule.ts`) rather than from the authored `processingTime` prose, so "3–5
  working days" reads as "3–5 na araw ng trabaho". The rule underneath is the same one:
  translate what a resident has to act on, leave the names of things as they are said at a
  counter.

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

**The code is shown twice: as a QR and as text.** The QR is real and scannable
(`qrcode-generator`, error correction M) and carries a link back to this app with the code
in it — `verificationUrl` in `src/lib/qrPattern.ts`. The scanner is the clerk's own phone
camera, the same reasoning as handing document photos to the phone's camera app: every
phone already knows what to do with a URL and none of them know what to do with twelve
loose characters. `src/lib/scannedCode.ts` reads `?verify=` once at startup, strips it from
the address bar so a reload cannot re-spend a used code, and the console opens on the check
and runs it. The link is a shortcut into the check, never the check itself — the staff side
still requires a staff session, and the code is still consumed server-side.

There used to be a QR on the card face that encoded a static seed. It is gone. A code that
scans to nothing is worse on a government ID than no code at all: a clerk points a phone at
it, nothing happens, and the ID reads as broken rather than decorative. Nothing in the app
draws a QR without real content to put in it.

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
Philippine Red Cross. **Every Malasiqui number is invented.** The catalogue names a real
town, which makes that worse rather than better: a resident who recognises their own
municipality on the screen has every reason to believe the number under it. Replace them
all before deploying, ring each one to confirm, and re-check whenever the offices
reorganise. A hotline that rings nowhere is worse than none at all, because a resident
will trust it in the moment they can least afford to.

## Reporting an incident

The hotlines answer the thing happening *now*. This is the other half: a flooded road,
a downed line, uncollected rubbish — something the municipality needs to know about and
send somebody to, but which nobody is going to be dispatched for this minute.

**The emergency button is on the dashboard and is the only red thing on it.** Somebody
who needs it is not reading the screen, they are looking for the one control that is
obviously it, and a row in a list further down is not that. It opens the hotlines rather
than dialling anything itself — which number to ring is the resident's choice, and an app
that places a call on a tap is an app that rings the fire brigade from a pocket. Every row
is a real `tel:` link with a phone icon, so the call itself is one tap.

**Reporting sits under the hotlines, never above them.** A report is not an emergency
call, and a resident watching a fire should be dialling. The report screen says so in its
first line, and says it again on the confirmation: nobody has been dispatched by this.

**It is deliberately not a request.** Nobody applied for anything, there is no fee, no
workflow and no document at the end, so `incident_reports` is its own table — folding it
into `requests` would put a thing with none of those in every department's queue.
Reference numbers come from a counter like every other number here, so a deleted report
never frees its number for a second one.

**Evidence is a photo or a video, and the camera is the phone's own**
(`capture="environment"`), the same reasoning as photographing a requirement: the native
camera focuses, uses the flash and applies the phone's processing.

**Video is the one upload that does not fit in memory.** Everything else here is a
photograph or a PDF; half an hour of phone video is a gigabyte or more, so evidence is
streamed to disk by multer and taken into the store by `putFileFromPath`, which hashes by
streaming and never holds the file. Reading one into a Buffer to checksum it would make a
single upload capable of taking the server down.

**The thirty-minute ceiling and the byte cap are different rules, and they do not line
up.** Duration is checked in the browser, from the file's own metadata, because that is
the only place it is cheaply knowable — finding out a clip was too long after pushing it
over mobile data is not a usable answer, and the server bounds the number it is told
rather than trusting it. What the server actually enforces is `MAX_EVIDENCE_BYTES`
(`MAX_EVIDENCE_MB`, 512 MB by default). Thirty minutes at a modern phone's 1080p bitrate
is roughly 1–2 GB, so **a full-length, full-quality recording will hit the byte cap before
the time limit.** Raise the cap if the deployment's storage and connection can take it,
but a resident uploading a gigabyte over mobile data at the scene of something is not a
thing that completes; the honest fix for long video is resumable upload straight to object
storage, which is a larger piece of work than a bigger number.

**Type is decided by magic bytes**, like every other upload — a PDF renamed `photo.jpg` is
refused. Only pictures and video are accepted: a document is not evidence of a flooded
road, and accepting one would put it in a player that cannot play it.

**Evidence is watched in the console, not downloaded.** This is the one place a stored
upload is served inline, and what makes it safe here is the type set: evidence is only
ever an image or a video sniffed from its own bytes, neither of which can carry script the
way a resident-supplied PDF can, and `nosniff` still stands. Ranged, so a long video can
be scrubbed rather than watched through to find the ten seconds that matter. Virus
scanning covers photos only — a video goes through on its type and size alone, which is
worth saying rather than implying it was checked.

**Reports land with the administrator**, because an incident is not any one office's work:
a downed line is the cooperative's, a flooded road is engineering's, and somebody has to
look and decide. A deployment with an MDRRMO would route these there instead, which is a
department row and one changed role check. The queue is open-first then oldest-first, so it
reads as the order somebody should work it. Acting on a report notifies the resident in the
same transaction as the change — the point of giving them a reference is that it goes
somewhere they can see.

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

**The app renders the duration from the numbers, not from the prose.**
`formatProcessingTime` (`src/lib/schedule.ts`) turns them into "3–5 working days" or
"3–5 na araw ng trabaho", which is how that line gets translated at all — and it retires an
invariant nobody was checking, since the prose and the numbers said the same thing twice
and could drift apart silently. `processingTime` is still published and is still what a
deployment authors as the office's own wording; nothing in the app displays it.

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

## What the treasury sees change

The treasury reconciles against fees it did not set: the municipal administrator defines the
shared certificate catalogue and each barangay overrides what it charges. Both already write
the change, the old value and who made it to `admin_audit` **in the same transaction as the
change**, so `GET /staff/fee-changes` is a *read of that trail* rather than a second record
of the same fact that could disagree with the first.

It is a read and not a notification because there is no staff inbox in this app —
`/notifications` is resident-only — and inventing one for this would have been a second
delivery mechanism to keep correct. The panel sits under the payment book because it answers
the question the book raises: a figure that does not reconcile is usually a fee that moved,
and the old figure is right there beside the new one.

Same gate as the payment book — the treasury department or an admin, everybody else 403 —
because it answers the same person. No barangay account can read it: a barangay sees its own
fees in its own console, and the municipality-wide trail is the hall's and the treasury's.

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

## What each workflow step means

The four steps in `WORKFLOW_STEPS` used to render as four labels. A label does not
answer the question a resident actually opened the screen for, which is whether they are
waiting or being waited on.

**Every step says whose move it is.** `STEP_OWNER` (`src/types.ts`) maps each step to
`office` or `resident`; only Payment is the resident's, which is the same fact that pauses
the ready-date clock at that step and nowhere else. The current step carries it as a word
("Your move" / "With the office"), never as a colour — the difference between "the office
is working on this" and "nothing happens until you act" is too important to encode as a
hue.

**Upcoming steps show their text too**, muted rather than blank. A resident who can only
read as far as the step they are on cannot tell whether the next thing is a week of office
work or a fee they must go and settle.

**The final step is ticked only when the request is actually completed.** Paying moves a
request onto the release step without closing it, so the tracker took a green check as
"done" and told residents their document was out before the office had looked at it. It
now takes `completed` from the server's status.

`CounterChecklist` says what to bring if the office asks for a visit: the reference
number, the digital ID open at its verification code (or any government ID), the official
receipt if they paid at a window, and — the one people get wrong — an authorisation letter
plus both IDs when someone else collects. It is framed as a conditional because the
catalogue does not record which services need a counter visit, so promising one would be
inventing a fact; saying what to bring *if* asked is true of every service. The wasted trip
is the expensive part of dealing with an LGU, and it is worth a panel to avoid one.

All of this is translated. The step labels themselves are not — they name stages of an
official process, like "Cedula" and "Building Permit".

## Editing the municipality's own data

Hotlines, the holiday calendar and each office's address were seeded and then unreachable:
correcting a wrong number meant editing `mockData.ts` and reseeding the database. No
municipality can do that, so in practice the numbers stayed wrong. The **Municipality** tab
(`StaffMunicipality.tsx`, admin only) is where they are now fixed.

This matters most for the hotlines. A number that rings nowhere is worse than none at all,
because a resident trusts it in the moment they can least afford to — so the panel says so,
and asks whoever is editing to ring it before saving.

**Every write is audited in the same transaction as the change** (`admin_audit`,
`recordAudit` in `server/src/municipality.ts`), with the whole row as it was. That log is
the entire safety net here: an administrator can quietly point the fire hotline anywhere,
and the only defence against a mistake nobody notices is a record with the old number still
in it. The actor's name is stored beside their id rather than joined at read time, so a
renamed or removed account does not erase who did what. The "What changed" panel shows only
the fields that actually moved on an edit — diffing two long office addresses by eye is
exactly the job the screen exists to spare someone.

**Phone validation is deliberately loose** (`looksDialable`). Philippine numbers are
written every which way — `(075) 961-2400`, `0917 123 4567`, `+63 2 8888 4000`, `911` — and
a validator strict enough to have an opinion would reject a number that rings perfectly
well. It rules out only the unusable. The real check is a person ringing it, which is what
`DEPLOY.md` asks for.

**Only contact details, never the catalogue.** What an office is called and what it offers
is a change to what the municipality provides, not a correction to how to reach it, so
`PATCH /admin/offices/:id` takes address, hours, phone and email and nothing else. An
unknown key is stripped, which leaves nothing to change and refuses the whole request
rather than quietly doing something different.

**Declaring a holiday moves dates already promised**, because every estimate is computed
over the calendar rather than stored. That is the intended behaviour — the hall really is
shut — and it is why `POST /admin/holidays` upserts: a proclamation renaming or moving a
day is the ordinary case, not a reason to make someone delete a row first.

In the demo these live in `DemoState` rather than reading the imported constants, since a
demo whose catalogue is hard-wired to the seed would show an edit saving and then not
appearing anywhere.

## Appointments and queue numbers

The app already saved a resident the paperwork; it did not save them the queue. Plenty of
municipal business still needs a person at a window, and the way that works without this is
that everyone arrives at eight and waits.

An appointment is with an **office**, about a **service**, and optionally about a **request**
the office already holds — so a resident whose permit is stuck can book a time from the
request itself rather than starting again.

**The calendar is the one everything else uses.** A day the hall is shut cannot be booked,
which means weekends and the `holidays` table, exactly as the expected-ready-date arithmetic
reads them. Declaring a holiday in the Municipality tab closes booking on that day as a
consequence, not as a second thing to remember.

**Capacity is real, and enforced under a lock.** `office_booking` holds one row per office —
hours, slot length, how many residents a slot holds, and how far ahead booking opens.
Booking locks that row before counting, which serialises booking for the office. Coarse, but
a municipal counter books a handful a minute, and an oversold slot is discovered with people
standing in front of it.

**One live booking per resident per office.** Without it a resident books four slots to keep
their options open and the office spends the morning calling empty numbers. The refusal names
the booking in the way, so they know what to cancel.

**Queue numbers come from a counter, never from a row count** (`appointment_counters`), so a
cancellation frees the slot but not the number. Two people answering to MTO-007 on one
morning is the exact confusion a queue number exists to prevent.

**Time is the office's, not the server's** (`officeToday`, `officeMinutesNow` — `Asia/Manila`).
A server clock somewhere else would tell a resident in Manila at 9am that today is over, or
offer them a slot that has been and gone.

A full or past slot is shown greyed rather than hidden: a resident looking at a half-empty
morning needs to see that 8:30 has gone, not to wonder whether the office opens at nine. The
booking error renders **under the time grid** rather than at the top of the page — a
refusal seven hundred pixels above where they just tapped reads as the button not working,
which is how it was first built and what browser-driving caught.

The staff **Today** tab is the counter's day: one office, in time order, with the queue
number, who is expected and what for — and nothing else about the resident, the same rule
the ID check follows. `arrived` is them presenting themselves; `served` and `no_show` close
the visit and are final, because what happened at a window should not be quietly rewritten
later in the day.

## Feedback and complaints (RA 11032)

The Ease of Doing Business and Efficient Government Service Delivery Act requires every
office to publish a Citizen's Charter and to run a mechanism for feedback and complaints
against it. **The service catalogue is effectively the charter** — every fee, processing
time and requirement the app promises is published from it — so what was missing was the
other half.

**Rating is asked once, at the only moment a resident can answer honestly:** when the office
has finished. A rejected request counts too; how a refusal was handled is exactly the thing
worth measuring. One request, one rating (`feedback.request_id` is the primary key) —
letting somebody rate the same transaction five times makes the figure meaningless.

It is deliberately **one question**. A full Client Satisfaction Measurement has prescribed
dimensions, and asking eight of them on a phone gets eight blank answers; a star rating with
an optional sentence gets a real one. The stars carry `aria-label`s and the scale is
labelled at both ends, because a row of stars tells a screen reader nothing and tells anyone
unsure which end is good only slightly more.

**A complaint gets a reference and a visible deadline.** `COMPLAINT_RESPONSE_DAYS` working
days from filing, over the same calendar as everything else — an office is not late for a
day the hall was shut. Both the reference and the date are shown to the resident, because a
deadline nobody can see is not a deadline. **That day count is a placeholder: set it to the
response time in the deploying LGU's own Citizen's Charter.**

**A reply, once given, stands.** The server refuses a second one. An office quietly rewriting
what it told a resident is the precise thing a complaints mechanism exists to prevent. The
office queue is ordered oldest-open-first and anything past its deadline says "Overdue" in
words rather than only in colour.

The report gains four figures — average rating, complaints filed, answered, and past their
deadline — kept **apart from the turnaround rows above them**. A complaint is about an office
rather than one request, and feedback arrives after a transaction closes; folding either into
the per-service rows would make a service look badly rated because somebody complained about
a queue. `averageRating` is null with nothing rated: an average of no ratings is not a five,
and rendering one would be worse than a blank.

Complaints are reached from Profile rather than the bottom nav — it is the screen you go
looking for, not one you pass through.

## Finding a service

Six offices and seventeen services is small enough to browse and large enough that browsing
is the wrong first move for someone who already knows what they want. A resident thinking
"permit for my sari-sari store" should not have to work out that this is Business Permits
and Licensing before they can start.

**The words residents use are catalogue data.** `searchTerms` on each service
(`src/data/mockData.ts`, seeded into `services.search_terms`, published on `/api/catalogue`)
carries what people actually type — "sari-sari store", "negosyo", "amilyar", "ayuda",
"kasal", "yellow card" — in both languages. They are never shown; they only widen what
matches. A term the municipality notices people typing is a row to add, not a release to
cut.

**Matching runs on the device, against the cached catalogue.** That comes free with the
cache the hotlines already need: results are instant, cost the network nothing, and work on
a phone with one bar outside the municipal hall — which is exactly where someone is standing
when they need to know which office they want.

It is deliberately plain (`src/lib/search.ts`): every query word must appear somewhere in
the service's text. A resident who types more words expects fewer results, and a search that
"helpfully" returns a birth certificate for "building permit" teaches people not to trust
it. Ranking is by *where* a word landed — the name beats the search terms, which beat the
description, which beats a requirement — so the thing itself outranks the thing that merely
requires it.

`normalise` folds case, accents and punctuation, which matters more than it sounds: the
catalogue writes "mayor's permit" with a typographic apostrophe and every phone keyboard
produces a straight one, so without it the most obvious search for a business permit finds
nothing.

The office tiles stay as the default view. Browsing is the right move for someone who does
*not* know what they need, and an office list also tells a resident what the municipality
actually does; search replaces it only while something is typed.

## Push notifications

The app tells residents it will let them know when a document is ready. Until this, that
meant email and SMS — neither configured in a default install — so the promise was empty
unless somebody wired a mail server.

**The permission prompt is never shown on load.** A cold prompt on a first visit is the one
thing every guide says not to do, and for good reason: a resident who has not filed anything
has nothing to be notified about, so the honest answer is no — and browsers remember a no
more or less forever. `PushToggle variant="prompt"` is offered on the submit-success screen,
the first moment there is anything to be notified about, and a plain switch lives in Profile
for turning it on later.

**A lock screen is not private.** `PRIVATE_KINDS` in `server/src/push.ts` pushes the title
and "Open the app to read it." for programme grants, revocations and complaint replies: "You
have been enrolled in 4Ps" announced to whoever is holding the phone is a poverty-programme
membership disclosed to the room, and the people this app serves are exactly the people for
whom that is not a small thing. Request status and appointments carry their real text.

**Subscriptions are per device**, keyed on the endpoint, so re-subscribing the same browser
updates its row instead of stacking a second one that would ring twice. Signing in on a
shared phone takes the browser over — the notifications that arrive should be for the
account using it. A push service answering 404 or 410 means the browser is gone, and the row
is deleted there and then; otherwise dead subscriptions accumulate and are retried for the
life of the account.

Push is off unless `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set (generate a pair with
`npx web-push generate-vapid-keys`). Absent, `/notifications/push-key` reports `enabled:
false` and the switch does not render at all — a toggle that cannot work is worse than no
toggle.

The service worker half is `public/push-sw.js`, pulled in by `workbox.importScripts`. That
keeps the caching worker generated from the build manifest rather than hand-written, which
switching to `injectManifest` for twenty lines of push handling would have cost.

**What is verified here and what is not.** The suite checks subscription storage and
scoping, the lock-screen rule, and the real VAPID signature and `aes128gcm` body that
`web-push` produces. It does not check delivery: there is no reachable push service from
the build environment, so the final hop to FCM and the 404/410 cleanup that depends on it
are unexercised. The browser test stubs `pushManager.subscribe` for the same reason —
headless Chromium has no push service to register with — so everything around that one call
is the app's own code, and that call is not.

## Who a portal is for, and who is already in it

Two facts had no owner. A resident typed their municipality into a free-text box
nothing ever read back, and a person could register as many times as they had email
addresses — which meant one resident's requests split across two records, and an
office looking one of them up finding half their history.

**The municipality is the deployment's, never the browser's.** `MUNICIPALITY`
(`src/data/mockData.ts`) is seeded into a single-row `municipality` table — one row,
enforced by the primary key, because "which municipality is this?" cannot have two
answers. Registration stamps `users.municipality_code` and the profile's town and
province from that row and ignores anything the request body says about it. This is
the payment lesson applied to identity: the server establishes facts about itself.

**Sign-in refuses an account from another register.** It only ever fires where a
database outlived the deployment that filled it — restored onto another
municipality's portal, or an instance pointed at the wrong one — and there, letting
people in would hand another town's staff a queue of residents they have no business
seeing. Checked *after* the password, so it cannot be used to discover which
municipality an address belongs to. A null code predates the rule and still signs in:
those accounts were made here.

**Living here is asked, not assumed.** The portal cannot verify an address — the
office does that at the counter — but binding an account to a municipality without
ever asking is worse than asking, so `residesHere` is a required declaration and the
sign-up screen names the town before taking it. Until the catalogue answers, the
screen says so and the button is disabled rather than naming a town it is guessing
at.

**A duplicate is name + date of birth + mother's maiden name** — the triple a
Philippine civil registry matches people on. Each alone fails: a hundred residents
are called Juan Santos; birth date and mother together would refuse *twins*, who
share both and are two people. Names are folded for case, accents and punctuation,
and single letters are dropped, because a middle initial is on half the forms in any
office and missing from the other half. The cost is a genuine one-letter given name
being dropped from the key, which is the rarer case.

**Only the hash is stored** (`server/src/identity.ts`), like reset tokens and ID
verification codes. A mother's maiden name is a security answer half the country
over; this app needs to compare it, never to read it. Being an index makes it
deterministic and therefore unsalted and fast, so someone holding the table — who
already has each resident's name and birth date from the same row — could confirm a
guessed maiden name. What it stops is the table *reading* as a list of them.

Refusing a duplicate does tell whoever asks that an account exists for that person.
Only someone who already knows all three facts can ask, and at that point the
existence of an account is the least of what they know; the alternative is a resident
discovering the collision at a counter.

## Installing the app

The manifest and service worker made the portal installable from the first commit;
nothing told a resident so. A browser's own install affordance is a menu item most
people have never opened, so in practice the app was a web page.

**The browser decides when this is possible, not us.** Chromium fires
`beforeinstallprompt` once it judges the app installable and the visitor engaged;
`src/lib/install.ts` holds that event and spends it when the resident taps. There is no
way to conjure one, so where it has not fired there is no button. The listener is
registered at module load rather than in a component, because the event arrives before
React mounts and is never replayed — miss it and the offer is gone for the whole visit.

**iOS has no such event and no install API.** Safari does it from the Share menu and
nothing in the page can open that, so an iPhone gets the three steps instead of a button
that would do nothing. This is the same rule as the QR that encoded a static seed: a
control that cannot work is worse than none.

**Two placements, because they answer different questions.** The dashboard banner is for
someone who has not thought about it — it sits under the ID card, where they have just
seen what they would be keeping — and is dismissible *for good*, since an install offer
that returns every visit is an advertisement. The Profile row is for someone who went
looking, so it is never dismissed and it confirms "Installed" once they have, which is
the question anybody asks after tapping install.

Installed state is read from `display-mode: standalone`, `navigator.standalone` and the
`appinstalled` event together, because installing from the browser's own menu does not
reliably fire the event in the tab you did it from.

What it buys the resident is the thing the app already had and could not show off: the
precached shell means an installed portal opens to the emergency hotlines and the digital
ID with no signal at all.

## Data Privacy Act rights (RA 10173)

The privacy notice says a resident has the right to see what is held about them, correct it,
and have it erased. Saying so without providing it is the version of compliance that helps
nobody, so the **My data** screen is where each of those becomes a button.

**Export** (`GET /api/privacy/export`) is one JSON file with the profile, every request and
its history, attachments, drafts, appointments, complaints, feedback, notifications,
programme records, the times a clerk checked their ID, and the devices set to notify them.
Attachments are *listed* rather than embedded: a JSON document with a dozen photographs
base64'd into it is not something a resident can open, and every file is already downloadable
from the request it belongs to.

**Correction is scoped to what is theirs to correct.** An address and a phone number are
facts the resident knows better than the office does. A name and a PhilSys number are
identity claims an office verified against documents, and a portal that let someone retype
either is not one an office could trust — so those go through the Local Civil Registrar, and
the screen says so rather than leaving a disabled field with no explanation.

**Erasure is the right the app cannot grant in full, and it says so first.** A released
business permit is a public record the municipality must keep, and a permit with no applicant
on it is not a record. `GET /privacy/closure-preview` names what would be deleted and what
would stay *with the reason*, before anything happens — finding that out afterwards would be
the worst possible order.

Closing then does, immediately, everything that needs no judgement: the sign-in is closed and
the password destroyed, contact details and the ID portrait erased, drafts, notifications,
push subscriptions and unconsumed verification codes deleted, and upcoming appointments
cancelled so the slot goes to somebody else. The email address is released, so the same
person can register again later. A `privacy_closures` row records what was erased and what
was retained **as it was at the time**, along with the resident's name — the account is
anonymised, so without it there would be no way to answer "who asked for this".

What stays: the requests (the office's records), the complaints (a complaints record the
office can delete on request is not a complaints record), and programme memberships, which
belong to the register that issued them rather than to this app.

## Payments

This was the one place in the app where the client told the server something the
server should have established itself — and it was the place where it mattered most,
because the thing being asserted was money. `POST /requests/:id/pay` marked a request
paid because the browser said so, which made a permit free to anyone who could open a
developer console.

The flow is now the one every provider expects, and the reason it looks like this
everywhere is that every other shape is broken:

1. The server creates an **intent** for an amount *it* read off the request's assessment.
2. The resident pays at the provider. The app is not involved.
3. The provider calls back, **signed**. The server verifies, then settles.

Nothing the browser sends moves a peso. A resident who closes the tab at the gateway is
still paid up; one who forges the return trip is not. The payment screen polls the server
rather than trusting its own return, because the server's record is the only thing that
decides.

**The signature is over the raw bytes.** The webhook is mounted *ahead of* `express.json()`
for exactly this reason — re-serialising parsed JSON to check a signature will disagree
about key order or whitespace sooner or later, at which point every real payment starts
failing verification and the cause is invisible. Comparison is constant-time, and a
timestamp outside `WEBHOOK_TOLERANCE_SECONDS` is refused as a replay.

**Idempotency is the provider's normal behaviour, not an attack.** A gateway retries until
it gets a 2xx, so the same event arrives more than once as a matter of course.
`payment_events` is unique on `(provider, event_id)`, and a partial index makes one settled
payment per request a database guarantee rather than a thing the code remembers.

**The amount is the server's.** A callback for a different figure is marked `mismatched`
and left for a human: settling it either short-changes the municipality or overcharges the
resident, and both are worse than a flagged row that a treasurer sees the same day. It
still answers 2xx — telling the gateway to retry would bury the mismatch under duplicates.

**Rejected callbacks are recorded too.** A run of them is either a misconfigured provider
or somebody trying it on, and neither is visible if the server quietly drops them.

A `MockProvider` signs and verifies exactly as a real one does — same headers, same HMAC
over the raw body, same replay window — so what runs in development is what runs in
production; what it does not do is take money. Its "the resident paid" route is refused
outright unless `PAYMENT_PROVIDER` is `mock`, and it settles nothing itself: it sends the
same signed callback a real gateway would. Adding GCash, Maya or Landbank means
implementing `PaymentProvider` and setting two environment variables.

The treasurer's **Payments** tab is for reconciliation, so it leads with the total and
carries the gateway reference on every line — somebody working through a bank statement
needs to find *this* row from *that* line. Anything that did not end cleanly is listed
separately and is deliberately *not* limited to the period: a payment stuck since last week
is exactly what a daily reconciliation exists to surface. Only the treasury and admins can
see it.

Server test fixtures pay through the real flow (`payRequest` in `server/test/fixtures.mjs`),
so a suite that merely needs a paid request cannot keep the old shortcut alive.

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

- **PhilSys sync** is visual only. A production build would call a real PhilSys
  verification API; the ID's own verification code is real and checked server-side.
- **No real payment gateway is wired yet.** The architecture is complete and tested —
  intents priced by the server, signed webhooks, idempotent settlement, amount checking,
  reconciliation — but the only provider implemented is the development mock. A real
  deployment implements `PaymentProvider` for its gateway and sets `PAYMENT_PROVIDER` and
  `PAYMENT_SECRET`; nothing else about the flow changes. **Do not deploy with
  `PAYMENT_PROVIDER=mock`:** it exposes a route that settles a payment without one being
  made.
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
- **The seeded holidays, office details and hotlines are still placeholders**, but they are
  now correctable in the app rather than by reseeding — see *Editing the municipality's own
  data*. The 2026 calendar still needs checking against the year's proclamation, the local
  rows replacing, and **every municipal hotline verifying before launch**; the national
  numbers (911, 143) are correct as published. `mockData.ts` remains the authoring source
  for a fresh seed. The Data Privacy screen's DPO address is still code, not data.
- **The RA 11032 day count** (`COMPLAINT_RESPONSE_DAYS`) is a placeholder, like the holiday
  calendar. Set it to the response time in the deploying LGU's own Citizen's Charter before
  launch — a deadline the office never agreed to is worse than none, because the app reports
  them late against it. The rating is a single overall score rather than the prescribed
  Client Satisfaction Measurement dimensions.
- **Push delivery is unverified in this repo.** The signing and encryption are real and
  tested, but nothing here can reach a push service, so the last hop and the dead-subscription
  cleanup it triggers have never actually run. Check them on a real deployment before relying
  on push as the channel that tells a resident their document is ready.
- **Long incident video is capped by bytes, not by the thirty minutes residents are
  told.** The duration ceiling is real and enforced in the browser, but the server's
  limit is `MAX_EVIDENCE_MB` (512 by default), which a full-quality half-hour recording
  exceeds. Either raise it to match the storage and bandwidth available, or accept that
  long clips must be recorded at lower quality — and know that a reliable gigabyte upload
  from a phone needs resumable upload to object storage, which this does not have.
- **Incident reports go to the administrator**, not to a disaster office, because the
  catalogue has no MDRRMO. That is the right default for a six-office municipality and the
  wrong one for a municipality that has an MDRRMO; moving it is a department row and the
  `requireRole('admin')` check on the incident routes.
- **Account closure is not reviewed by anyone yet.** The `privacy_closures` row is written
  and the automatic erasure happens immediately, but there is no screen for the Data
  Protection Officer to work through the retained items and erase what the retention period
  has expired on. That review is a real obligation, and right now it happens in the database.
- **A resident who moves is not handled.** Their account stays stamped with the
  municipality that issued it, and there is no transfer: the sign-in refusal tells
  them to register with their new LGU, which loses their history here. A real
  deployment wants an office-initiated transfer, which is a new authorization surface.
- **The duplicate check cannot see across municipalities**, by design — each
  deployment has its own database — so the same person may hold an account in two
  towns. That is correct for residency and wrong for a national register; PhilSys is
  what would settle it, and PhilSys here is still visual only.
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
- **The barangay roster is six sample barangays, not Malasiqui's real 73.** `BARANGAYS` in
  `mockData.ts` is placeholder data with invented captains and secretaries; the real roster
  belongs in the PSGC listing for the municipality, and the officials' names change every
  barangay election. Replace both before deploying, and treat the names as data somebody
  has to maintain rather than something seeded once.
- **A barangay certificate has no document at the end.** The request reaches `released` and
  the resident is told to collect it; the barangay prints its own certificate as it always
  has. The municipal side renders a PDF with a verification code and the barangay side does
  not, which is a deliberate stopping point rather than a finished feature — a barangay
  certificate that can be verified the way a municipal one can is the obvious next piece.
- **Nothing is paid online at the barangay.** The fee is quoted and shown, and settled at the
  barangay hall on collection. The payment machinery is all municipal; pointing it at a
  barangay means deciding who the money goes to, which is a treasury question rather than a
  code one.
- **A certificate's validity period is a placeholder**, like the fees and the hotlines —
  and unlike the fees, a barangay cannot override it, because what a bank or an employer
  honours is not a thing one barangay decides. Set `validityDays` in `mockData.ts` from
  what the deploying LGU's offices actually ask for. The one period with a legal source is
  the first-time jobseeker certificate's year (RA 11261); **that the same law makes it a
  one-time availment is not enforced here**, so nothing stops a resident requesting a
  second.
- **Nothing warns a resident that a certificate is about to lapse.** It reads as lapsed on
  the day, which is honest, but a notification a week out is the thing that would actually
  save the trip — and it is a scheduled job, which this app does not have anywhere yet.
- **The hall's hours are prose, not a schedule.** That is right for a barangay, whose week
  is not a grid and whose hall shuts for an assembly without telling anybody — which is why
  the screen says to ring first rather than pretending to know. It does mean nothing can
  compute whether the hall is open right now, and a deployment that wants that needs real
  opening hours, which is a different and larger thing to maintain.
- **A barangay issues its own clerks and kagawads; an administrator still comes from the
  hall.** That one exception is the escalation line and the reason the rest is safe to
  delegate. It does mean a barangay whose only administrator is locked out needs the
  municipal administrator to intervene, which is the right trade and worth knowing.
- **The kagawad is read-only and reads counts.** A deployment that wants councillors to
  post committee notices, or to see the Lupong Tagapamayapa's own work, is adding routes to
  `barangayKagawad.ts` — not adding the role to the clerk's gate, which is what the
  separation exists to prevent. Membership of the Lupon is not modelled at all: a kagawad
  who sits on it would need an account that says so.
- **Nothing records which seat a kagawad holds.** There are seven of them and the app knows
  only that somebody is one — no committee, no term, no ranking. A barangay wanting the
  council as a roster rather than a set of logins needs the Sanggunian as data, which is a
  different feature from an account.
- **The blotter records the KP process; it does not conduct it.** See *The blotter and the
  summons*. There is no Pangkat ng Tagapagkasundo, no prescribed KP form, no ten-day
  settlement finality and no Certificate to File Action — those are paper instruments with
  legal effect, and an app that printed one would be claiming a standing it does not have.
  The periods the law sets (15 days to mediate, 15 more for the Pangkat) are not enforced or
  counted either; a deployment that wants them should treat them like the expected-ready
  dates, over the same working-day calendar.
- **A certificate added in the app carries no step-by-step route**, and nothing in either
  console lets somebody write one — `steps` needs a bilingual chain per step and that is an
  authoring job, not a form. The resident simply sees no guide for it. A deployment that
  adds documents regularly wants a step editor, which is a real screen rather than a field.
- **Municipal services have no add/edit/delete.** The 17 services, with their form fields,
  requirements and routes, are still authored in `mockData.ts` and seeded. Only the barangay
  certificate catalogue is editable in-app. Service CRUD is a much larger surface — a form
  builder, really — and worth designing deliberately rather than bolting onto this.
- **The barangay ID is not here.** It is its own feature with its own rules, and bolting it
  on as a field of the certificate, the blotter or the register would get it wrong.
- **A notice reaches a resident who opens the app, and a phone only when it is urgent.**
  There is no scheduled posting, no attachment, no read receipt and no way to send one to a
  single purok rather than the whole barangay — a notice is one piece of text for everybody
  who lives there. A barangay that wants a photograph of the assembly flyer on the board
  wants an upload surface, with the type sniffing and the size cap the rest of the app has,
  rather than a URL field somebody pastes a Facebook link into.
- **An urgent notice is one notification per resident, written in the posting
  transaction.** At six barangays' worth of residents that is the right trade — the notice
  and the telling cannot come apart. A barangay with ten thousand residents wants that
  fan-out moved to a queue, which is the point at which it stops being one transaction and
  needs its own answer for what a half-delivered notice means.
- **The register has no export, deliberately.** A barangay genuinely needs printed lists for
  relief distribution, and a CSV button is the single action that turns a scoped register
  into a spreadsheet on somebody's laptop — which is how registers leak. A deployment that
  adds one should log who exported and when, the way `admin_audit` records municipal edits,
  rather than treating it as a download.
- **Nothing reconciles the register against resident accounts.** A person can be in a
  household and hold an account and the app will never connect the two, by design. The cost
  is that a barangay cannot see which of its inhabitants use the portal, which is a real
  question somebody will eventually ask; answering it means designing a link that does not
  become a lookup.
- **The document routes are a reading of common practice, not a charter.** Every `steps`
  chain is placeholder content on the same footing as the hotlines and the holiday
  calendar: plausible, carefully ordered, and not verified against what this municipality
  actually asks for. **That goes for the Filipino as much as the English** — a translation
  of a wrong instruction is still a wrong instruction, and it is the version most residents
  will read. Reconcile them with each office's Citizen's Charter before launch,
  and re-check whenever a requirement changes — the app reports the order confidently and
  a resident will act on it.
- **Nothing checks that a prerequisite was actually obtained.** The guide says to get the
  barangay clearance first; the municipal form will still accept a submission without it,
  and the office catches it. Enforcing the chain server-side would mean knowing that *this*
  resident's clearance is the one the permit needs, which is a document-matching problem
  this app has no way to solve.
- **Service names, descriptions and requirements are still English in both languages.**
  Steps and durations are translated because they are instructions; the rest of the
  catalogue follows the original rule and renders as authored. A deployment that wants a
  fully Filipino catalogue needs a translated catalogue, not a translated app — which is a
  bigger decision than it looks, since "Barangay Business Clearance" is what the counter
  will ask for whichever language the screen is in.
- **Navigation stack resets on reload** (in-memory, not URL-based) — and a service-worker
  update now reloads the page by itself, so that reset happens on its own schedule rather
  than only when somebody refreshes. See *Getting a new version onto a phone*. A router
  would fix both at once.

## Getting a new version onto a phone

`registerType: 'autoUpdate'` installs and activates a new service worker in the
background. What it has never done is reload the page you are looking at — so a
returning visitor renders the *old* precached shell while the new worker quietly takes
over behind it, and the new version appears only on the next load. A deployed change can
therefore sit live for half a day and still look missing, which is exactly what it did,
twice.

`src/lib/swUpdate.ts` closes that: `controllerchange` fires when a new worker takes
control, and the page reloads itself. Registered from `main.tsx` at module load rather
than in a component, the same reason the install prompt's listener is — the worker can
take over before React mounts.

**An update is only an update when there was something to update from.** `clientsClaim`
makes `controllerchange` fire on a *first* install too, because the page started with no
controller and one took over. Reloading for that is pointless and is the classic way to
build an infinite refresh loop, so the listener captures whether a controller existed at
load and ignores the event when one did not.

**This reloads under the resident's fingers, and that cost is accepted rather than
hidden.** It is survivable because of things the app already does: a half-filled form is
written to IndexedDB on every keystroke, and the offline outbox is persisted and resumes,
so neither is lost. What *is* lost is the in-memory navigation stack — the app reopens on
the dashboard rather than where you were — which is the standing cost of having no router.
If that becomes the complaint, the answer is a "new version available" bar rather than a
cleverer reload.

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

`vercel.json` is not part of that. It exists so a static host — which has no
Postgres and no API — builds the **demo** (`VITE_DEMO=1`) rather than an app whose
every screen fails its first request. Nothing in it applies to the container; see
*The clickable demo* in `DEPLOY.md` for what that deployment is and is not.

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

Seeded staff logins are `<office>@malasiqui.gov.ph` (treasury, bpls, obo, lcr, cswdo,
health) with the password printed by `npm run seed`. Sign in as `cswdo@` to see the
programme record on a request. Residents register in the app.

Barangay logins use the same password: `admin.poblacion@malasiqui.gov.ph` for the
administrator's console, `officer.poblacion@malasiqui.gov.ph` for the clerk's and
`kagawad.poblacion@malasiqui.gov.ph` for the council's. The clerk and the kagawad are the
pair to compare — one works the register and the blotter, the other sees counts and no
individual resident at all. Every other barangay has an administrator account only.

The demo build lists all of these on its own sign-in screen (`DEMO_ACCOUNTS` in
`SignIn.tsx`), grouped by tier. Add a row there whenever a seeded role is added — an
account nobody can find is one nobody tries, and the panel is the only place a person
clicking through the demo would look.

```bash
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
```

## Suggested next steps

1. Replace mock icons in `public/icons/` with a real LGU seal / wordmark.
2. Consider `react-router` if screens need shareable URLs. Note that `?verify=` is already
   handled by hand in `src/lib/scannedCode.ts`; a router would absorb it.
