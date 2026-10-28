# The barangay tier

Two products, one codebase.

| | `DEPLOYMENT_TIER=municipal` | `DEPLOYMENT_TIER=barangay` |
| --- | --- | --- |
| Sold to | The municipal hall | One barangay |
| Serves | The hall and every barangay in its roster | One barangay, standing alone |
| Hall routes | Mounted | **Not mounted** |
| Services, payments, appointments, incidents | Yes | No |
| Certificate catalogue | Shared, owned by the municipal administrator | The barangay's own |
| Root account | Municipal `admin` | `barangay_admin` |
| Resident app | Two tiers, with a switch | One tier, no switch |

```bash
DEPLOYMENT_TIER=barangay
BARANGAY_ID=poblacion        # the id as it appears in the roster
npm run provision
```

## Why one codebase rather than two

**The barangay tier never needed the hall.** Every query in that console
already scopes to the barangay on the signed-in account's own row, and the only
thing it takes from the municipality is a name and a province to print on a
certificate — which a standalone barangay still has, because a barangay is
still *in* a town.

So the second product is the same code with the hall switched off. A bug fixed
is fixed in both, the test suite covers both, and a barangay that later joins a
municipal deployment is a **setting rather than a migration**. A copied repo
would have started drifting at the first bug fix, and "integrate later" would
have meant a rewrite.

## The hall is not mounted, rather than mounted and refusing

A route that answers 403 still tells a caller it exists, and is one forgotten
`requireRole` away from answering properly. A route that was never mounted
cannot be reached by a mistake nobody has made yet. It is the same reasoning as
the barangay console being a separate shell rather than a filtered tab: there is
nothing to get wrong, instead of something to get right.

`server/test/tier.mjs` reads the guarded mounts **out of `index.ts`** and walks
every one, so a route added inside the guard next year is covered the day it is
added. It also names the hall's routes explicitly, because a mount *moved out*
of the guard would otherwise vanish from the list and stop being checked — a
hole that widens silently. And it carries a self-check proving a mounted route
does not read as absent, so the walk cannot pass against an app that mounted
everything.

## Three things the seed decides differently

**No hall catalogue.** No departments, no services, no sectoral registers. A
barangay does not run a Business Permits office and cannot enrol anybody in 4Ps
— those are issued by the municipality. The hotlines, the holiday calendar and
the municipality row *are* seeded: a barangay still wants numbers that ring,
still shuts on the same days, and still prints its town's name on a certificate.

**The certificate catalogue changes owner, and that is the whole difference.**
Municipally the rows are shared — `barangay_id` null — because a clearance is
the same document in all of them. Standing alone there is no municipal
administrator and `/admin` is not mounted, so shared rows would leave a
catalogue nobody in the running system can edit: the console reaches its *own*
rows, and a shared one reads as not found. The rows are stamped with the
barangay instead, which is also the honest model — a barangay standing alone
decides what it issues and what it charges.

**The root account is a `barangay_admin`.** There is no hall above to issue it.
A municipal `admin` here could sign in and reach nothing at all, because its
routes are not mounted.

## It refuses a database that is not its own

`index.ts` already refused to start against another municipality's database.
The same check runs one tier down, and matters more: point a barangay
deployment at a database seeded for a different barangay and nothing looks
wrong — the console simply serves another barangay's register and blotter to
whoever signs in. A blotter names people accused of things.

## What the resident app does with one tier

The dashboard asks no question. "Municipal or barangay?" is right when a
resident deals with two levels of government; with one it is a choice containing
a wrong answer, so the single door is opened directly and named after the
barangay.

Appointments leaves the bottom bar — it is the hall's, and the routes are not
mounted. Services stays, because "what can I ask for?" is still the question; it
just opens the barangay instead of a switch.

The sign-up barangay picker becomes a line of text, and the only barangay is
selected automatically — a select with one option is a question whose answer was
never in doubt, and one a resident can get wrong by leaving blank.

## Integrating a standalone barangay into an LGU deployment

Not yet built, and worth being honest about what it is. The data model already
allows it — a barangay deployment's rows are shaped exactly like one barangay's
rows in a municipal deployment — so the work is an **import**, not a redesign:
move that barangay's rows into the hall's database, re-point the certificate
types from the barangay to the shared catalogue where the hall wants them
shared, and re-stamp the accounts.

What makes it tractable is that nothing in the barangay tier invented a
different shape to be converted from. What it still needs is a reconciliation
for ids that collide — two barangays that both sold standalone and both have a
`household 1` — which is a real piece of work rather than a setting.
