# This repository is a split, and here is the whole of it

`jcem0615-rgb/barangay` is the **barangay management system**, separated out of
`jcem0615-rgb/LGU` so the barangay product can be worked on without touching
the municipal one. The plan is to integrate it back later.

It is a **full copy with history** — all 98 commits, forked at:

```
d37832b  Two Vercel projects from one repository, kept apart by settings
```

Nothing was deleted. The municipal tier is present and switched off, which is
how the code already worked; see `server/BARANGAY-TIER.md`.

---

## The argument against doing this, kept rather than quietly dropped

`server/BARANGAY-TIER.md` — written before the split, still in this tree — says
plainly why one codebase was chosen over two:

> **The barangay tier never needed the hall.** […] So the second product is the
> same code with the hall switched off. A bug fixed is fixed in both, the test
> suite covers both, and a barangay that later joins a municipal deployment is
> a **setting rather than a migration**. A copied repo would have started
> drifting at the first bug fix, and "integrate later" would have meant a
> rewrite.

That is still true, and the split does not refute it — it accepts the cost
deliberately. Writing it down here is the point: the reasoning is easy to lose
once there are two repositories and nobody remembers that the second one was a
decision rather than how things always were.

**So the whole design of this split is aimed at that one sentence.** Divergence
is what turns "integrate later" into a rewrite, so the diff against upstream is
kept as small as it can be while still making this repository honestly the
barangay product. **`npm run check:drift` prints the authoritative list** —
every file that differs and what integration must do to it — so this file does
not carry a count that goes stale the moment anything changes; see *Keeping the
two in step* below.

What is worth stating as an invariant rather than a tally: **no deletions of
upstream code, nothing moved, nothing renamed.** Every row in the manifest is
either a default to put back or work to carry over.

**The stronger claim this file used to make — that nothing under `server/src/`
or `src/screens/` changed at all — is no longer true, and the thing that broke
it is the point of the split rather than a failure of it.** The barangay
complaint feature (see *The barangay complaint* in `CLAUDE.md`) adds a
migration, three server modules, three screens and a test suite, and touches a
dozen existing files. Integration is now a real merge instead of a
fast-forward. That was the trade accepted the moment this repository was made:
the window was open, holding it open was chosen over spending it, and the first
feature closed it.

What the manifest does instead is keep the merge *mechanical*. Every one of
those rows is marked `feature`, meaning it belongs upstream as-is — the
barangay tier exists in both products, so none of this is something the eLGU
tree needs protecting from. The rows that still need a decision are the seven
`revert` ones, and they have not grown.

---

## Everything that differs from upstream

### The build is barangay by default (4 files)

Upstream, the barangay product was built by setting two environment variables
on the Vercel/Render service, and the commit that set that up said why they
could not live in `vercel.json`: that file is shared by every project built
from the one repository, so putting `VITE_PRODUCT` in its build command would
quietly turn the eLGU demo into a second barangay one.

**That constraint is gone here, because this repository builds one product.**
So the default moved into the code, where it cannot be forgotten:

| File | Change |
| --- | --- |
| `vite.config.ts` | `VITE_PRODUCT` defaults to `barangay`; `municipal` opts out |
| `src/lib/demoServer.ts` | `VITE_DEMO_TIER` defaults to `barangay`; `municipal` opts out |
| `src/lib/catalogue.tsx` | The cold-start tier and product name, via two new constants |
| `package.json` | `name` is now `ebarangay-portal` |

**`catalogue.tsx` was found by checking the deployed app rather than by
reading the diff**, and it is the one of the four that was a live bug. Those
values are read at the *first paint*, before the catalogue has answered, and
`document.title` is written from `productName` — so a cold load of the
barangay deployment, where `readCache()` finds nothing, drew the municipal
two-tier dashboard and **overwrote the correct build-time title in
`index.html`** with "eLGU Citizen Portal" before flipping to the right name a
moment later. Upstream that default is correct; here it was the exact failure
the split was meant to remove, surviving in the one place a build flag does
not reach.

The pair is now two constants rather than five literals, because five is how
they came to disagree: the two `useState` seeds, the two setters on the
catalogue response, and the copy written to the cache all repeated them. The
fallback on the response is not dead either — a server that does not publish
`tier` is an older one, and in this repository the honest reading of its
silence is "barangay", not "the hall".

This closes a real failure rather than a tidy one. The manifest, the icon and
the iOS home-screen label are baked in at build time and **cannot be corrected
by a later catalogue read** — so a build that forgot `VITE_PRODUCT` installed on
somebody's phone as "eLGU Portal", under a barangay's icon, unreachable by
anything the running app renders. Now the correct build is the one you get by
configuring nothing, and the two variables are no longer a pair somebody has to
remember to set together.

### The deployment surfaces state the tier (3 files)

| File | Change |
| --- | --- |
| `render.yaml` | Barangay demo only; municipal demo and owner portal stay upstream |
| `docker-compose.yml` | `DEPLOYMENT_TIER=barangay`, `BARANGAY_ID=poblacion` |
| `server/.env.example` | The same pair, **commented out**, with the reason below |

**`server/.env.example` leaves the tier commented out, and that was a bug
caught by running the suite rather than a preference.** Setting it there looked
obviously right — this is the barangay product — but that file is what
`cp .env.example .env` hands a developer, and the server *refuses to start when
the tier and the database disagree*. So a fresh clone following this
repository's own README got:

```
This database does not hold the barangay this instance serves.
  the database holds: 6 barangay(s), first is Bacundao Weste
  this instance is for: poblacion
Refusing to start.
```

`npm run seed` seeds a municipality; the `.env` demanded one barangay; the two
contradicted each other and `test:deployment` went from 18 passed to 15 passed,
3 failed. That refusal is worth keeping — an instance pointed at another
barangay's database would serve that barangay's register and blotter to whoever
signs in — so the fix was to stop forcing the tier in the *development* file.
It is set where this repository actually deploys instead, and uncommenting both
lines plus a reseed runs the barangay tier locally.

### What deliberately did **not** change

**`server/src/deployment.ts` is byte-identical to upstream, and
`configuredTier()` still defaults to `municipal`.** That looks wrong in a
repository called `barangay` and it is the most considered decision here.

Only one suite — `server/test/tier.mjs` — sets `DEPLOYMENT_TIER` explicitly.
The **other ~40 suites** run with it unset and therefore test the municipal
tier. Flipping the default in code would have meant either breaking all of them
or editing all of them, and editing ~40 test files is precisely the drift that
makes a merge back a rewrite. The tier is a deployment fact, so it is stated by
configuration that ships *in this repository* — `render.yaml`,
`docker-compose.yml`, `server/.env.example` — rather than by a person
remembering it at deploy time.

**`owner/` and `proposal/` came along and are not deployed from here.** The
owner portal is the reseller registry for *both* products and holds real state;
two blueprints deploying it would mean two registries disagreeing about the
same customers. The proposals are municipal sales material. Both are still in
the tree so a merge back is a merge rather than a reconstruction — they are
simply absent from this repository's `render.yaml`. Prune them if you would
rather, but deleting is the move that costs something later.

One known rough edge: `owner/src/provision.ts` emits `npm run build` for a
municipal tier and `VITE_PRODUCT=barangay npm run build` for a barangay one. The
second is still right; the first would now build the *barangay* app if it were
ever run against this tree. It is not — the owner portal provisions from the
eLGU repository — but it is the first thing to fix if that ever changes.

**`'auth.title'` is gone from both dictionaries**, and with it the last trace of
the municipal product name: the built bundle now contains the string **zero**
times, down from five before the `catalogue.tsx` fix and two after it. The key
was dead — `SignIn.tsx` takes its heading from `productName` on the catalogue,
which is precisely why the cold-load bug surfaced there — so nothing rendered
it and removing it changes no screen. It was a trap rather than a bug: the next
person adding a sign-in title would have reached for `auth.title` and got the
other product's name. `StringKey` is `keyof typeof en`, so `tsc -b` is what
proves nothing referenced it.

That removal is tier-neutral and belongs upstream too — the key is just as dead
in the eLGU tree — which is why its two files are marked `keep` rather than
`revert` in the drift manifest.

**The test suite is untouched**, including `server/test/tier.mjs` and
`server/test/isolation.mjs`. Those two are the reason nothing was stripped out:
they walk the municipal routers from barangay accounts and require 403 or
not-mounted on every one. Deleting the municipal code would have deleted the
tests that *prove* a barangay's register and blotter cannot be reached from the
other tier — and a blotter names people accused of things. A smaller repository
is not worth that.

---

## Keeping the two in step

Upstream is not configured as a remote, because a `git pull` is the wrong
default here — it would drag the municipal tier's churn through a tree that
only ships one product. Add it when you want it:

```bash
git remote add upstream https://github.com/jcem0615-rgb/LGU.git
git fetch upstream
```

### `npm run check:drift` is what holds this line

The argument quoted at the top of this file is the one real risk, and prose
cannot hold it. So the divergence is **declared** in
`scripts/check-upstream-drift.mjs` and checked:

```bash
npm run check:drift
```

It compares against the **fork point** — the merge-base with upstream, not
upstream's tip, which would also count upstream's own later work and make its
gap look like ours — and fails two ways. A file changed here that is not
declared means divergence grew: allowed, as a decision, never silently. A
declared file that no longer differs means the manifest overstates the gap,
which is how a manifest stops being read.

The manifest also carries **what integration must do to each file**, because
that is the real question at a merge and it is not "did it change". Three rows
are marked `revert` and they are the dangerous ones — `vite.config.ts`,
`src/lib/demoServer.ts` and `src/lib/catalogue.tsx` flip the product to
barangay, which is right in a one-product repository and would turn the eLGU
demo into a second barangay one in a combined tree. A fast-forward carries
them straight in, so they are named rather than left to be noticed.

Run it against anything with `UPSTREAM_REF=<ref> npm run check:drift`.

### Where integration stands today

**The code half is a fast-forward, right now.** Upstream has not advanced
since the fork, this repository is a few commits ahead, and `git merge-base
--is-ancestor` confirms it: there is nothing to reconcile, only the `revert`
rows to undo. `check:drift` prints this on every run, because it is the fact
that decides what integration costs and it is invisible from inside this
repository. **That window closes the first time either side moves** — then it
is a real merge, still confined to the declared files.

Taking a single fix from upstream meanwhile is an ordinary cherry-pick, and
the declared files are the only places a conflict can arise:

```bash
git cherry-pick <sha>
```

### One hazard the complaint feature introduces

`server/migrations/042_barangay_complaints.sql` takes the next number in a
sequence **both repositories are now advancing independently.** If upstream
also reaches 042, a merge produces two different migrations claiming the same
number, and the runner orders by filename — so which one applies first becomes
alphabetical accident rather than a decision, on a database that may already
have run one of them.

Check this before merging, not after. If upstream has an 042, renumber this one
to the next free number and leave the already-applied row in whatever
`migrations` table records it alone — a renumbered file that re-runs is worse
than the collision. The same applies to every migration either side adds from
here on, so it is worth settling a convention (odd numbers here, even upstream,
or a per-tier prefix) rather than discovering it twice.

**The data half is the part that is genuinely not built**, and it is described
in *"Integrating a standalone barangay into an LGU deployment"* at the end of
`server/BARANGAY-TIER.md`. It is an **import** rather than a redesign, because
the barangay tier never invented a different shape — but it is real work, and
the shape of that work is now known rather than guessed:

| | |
| --- | --- |
| **Does not collide** | Every row-heavy table is keyed on a `uuid` — `barangay_requests`, `blotter_entries`, `blotter_summons`, `households`, `household_members`, `barangay_announcements`, `barangay_documents`. Verification codes are long and random. These move as they are. |
| **Collides: reference numbers** | `barangay_requests.reference_no` and `blotter_entries.reference_no` are `unique` and drawn from counters that are **one per municipality** — so a standalone barangay and the hall have both issued `BRGY-2026-00001`. |
| **Collides: household numbers** | `households` is `unique (barangay_id, household_no)` from a per-barangay counter, so it collides only where the hall already recorded households for that same barangay. |
| **Collides: certificate types** | `barangay_certificate_types.id` is a `text` primary key. Standalone they are stamped with the barangay; in the hall the shared rows are the same ids with `barangay_id` null. |
| **Collides: accounts** | The seeded `admin.<barangay>@…` addresses exist on both sides. |

What that leaves is not code but **policy**, and three decisions have to be
made by the hall before an importer can be written, because each one changes
what the script does rather than how it does it:

1. **Renumber or prefix?** A reference number is quoted down a phone and typed
   into a search box, and a resident is holding paper with the old one on it.
   Renumbering invalidates their copy; prefixing keeps it and makes the series
   non-uniform for ever.
2. **Do the imported certificate types become the hall's shared rows, or stay
   that barangay's own?** Shared is the municipal model and means this barangay
   loses documents it invented; its own means the hall cannot edit them.
3. **What happens to a colliding account?** The standalone administrator and
   the hall's seeded one for that barangay are two credentials for one office.

Until those are answered an importer would be guessing, and guessing wrong
here moves a blotter — which names people accused of things — into the wrong
barangay's book.

---

## Vercel

The two products were two Vercel projects built from the one eLGU repository,
kept apart by project-level environment variables. They are now two projects
built from **two repositories**, which is what the split is for — the barangay
project needs no environment variables at all, because this repository's
defaults are the barangay ones.

See *Deployment* in `README.md` for which project points where.
