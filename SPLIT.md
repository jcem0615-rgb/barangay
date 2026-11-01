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
barangay product: **four code files, three deployment files, and the docs.**
No deletions, no moved code, no renamed symbols, and **nothing changed under
`server/src/` or `src/screens/` at all** — the places where a real fix will
land on either side. `diff -rq` against the eLGU tree reports exactly three
differing files under `src/` and `server/` combined.

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

Two known rough edges, both left alone deliberately.

`owner/src/provision.ts` emits `npm run build` for a municipal tier and
`VITE_PRODUCT=barangay npm run build` for a barangay one. The second is still
right; the first would now build the *barangay* app if it were ever run against
this tree. It is not — the owner portal provisions from the eLGU repository —
but it is the first thing to fix if that ever changes.

`src/i18n/strings.ts` still carries `'auth.title': 'eLGU Citizen Portal'` in
**both** dictionaries. Nothing reads it — `SignIn.tsx` takes its heading from
`productName` on the catalogue, which is why the cold-load bug above showed up
there — so it is invisible rather than wrong, and the two remaining occurrences
of the municipal name in the built bundle are this one key. It is left because
editing that file buys nothing a user can see and costs merge surface on a long
shared dictionary. It is a trap for the next person, though: somebody adding a
sign-in title would reach for `auth.title` and get the other product's name.
Delete it on the next merge that touches `strings.ts` anyway.

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

**Taking a fix from upstream.** The shared history makes this a normal
cherry-pick, and the four changed files above are the only places a conflict
can arise:

```bash
git cherry-pick <sha>
```

**Integrating back.** The data-model half of this is already described in
*"Integrating a standalone barangay into an LGU deployment"* at the end of
`server/BARANGAY-TIER.md` — it is an **import**, not a redesign, because the
barangay tier never invented a different shape. The code half is this file's
four entries, each of which is a default to put back.

The open question is the one upstream already named and this split does not
change: reconciling ids that collide, two barangays that both sold standalone
and both have a `household 1`. That is real work rather than a setting.

---

## Vercel

The two products were two Vercel projects built from the one eLGU repository,
kept apart by project-level environment variables. They are now two projects
built from **two repositories**, which is what the split is for — the barangay
project needs no environment variables at all, because this repository's
defaults are the barangay ones.

See *Deployment* in `README.md` for which project points where.
