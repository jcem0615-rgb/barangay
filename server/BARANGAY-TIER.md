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

## What the resident app drops, and why it is not a filter

Six surfaces in the resident app belong to the municipality, and in a barangay
deployment their routes are not mounted. Each is removed at the point it would
be drawn rather than left to fail:

| Surface | Why it is the hall's |
| --- | --- |
| Complaints | RA 11032 files against an office; the tier seeds none, so the form's only field is an empty picker. |
| Report an incident | A report lands with the municipal administrator — a downed line is the cooperative's work. |
| Requests tab | The hall's request list. A certificate request lives in the barangay hub. |
| Recent requests | The same list on the dashboard, with a "See all" into the tab above. |
| Appointments tab | A slot and a queue number against an office's booking row. |
| `GET /requests` on load | Asked on every sign-in, answering 404 and putting a server error in front of a working app. |

The rule underneath is the one the static QR was removed under: **a control that
cannot work is worse than no control.** A resident who taps Complaints and finds
an empty office picker concludes the app is broken, not that the feature is
somebody else's.

The Requests tab is the one worth stating twice, because dropping it looks like
a loss. It is not: a barangay deployment files no municipal requests, so the tab
was a second place to look that is empty for ever — and the emptier of the two
places had the official-looking name on it.

## Branding is a runtime value, with one exception

`productName()` comes off `/api/catalogue`, so the sign-in heading, the Profile
footer, `document.title`, the password-reset subject and the notification email
footer all follow the tier. `PRODUCT_NAME` overrides it for a reseller.

Two things do not follow it.

The **web manifest** is the one build-time flag (`VITE_PRODUCT=barangay npm run
build`), because an installed app's name is baked in at install and cannot be
corrected by a later catalogue read.

The **ID card label** follows the tier rather than `productName`, which is the
more interesting of the two. It is printed on the face of an identity document,
and `PRODUCT_NAME` renames the app for whoever deploys it — a card that reads
whatever somebody typed into an environment variable is not an ID card.

## Two apps on one home screen

Install identity is **per origin**, so two deployments on two domains are
already two separate installed apps: separate storage, separate service worker,
separate session, and a resident can hold both at once without them colliding.
Nothing had to be built for that. What had to be built is telling them apart.

Three things name the product on a phone's home screen, and all three are
build-time, because they are read before any JavaScript runs:

| | Where it comes from |
| --- | --- |
| Icon | `public/icons/` (navy, house) or `public/icons/barangay/` (green, hall) |
| Android / Chromium label | the manifest's `short_name` |
| **iOS label** | `apple-mobile-web-app-title` in `index.html` |

The iOS one is the trap. Safari has no install API — a resident adds the app
from the Share menu — and *that meta tag* is what ends up under the icon. It
was a literal, so the barangay product installed on an iPhone as **"eLGU
Portal"**: the wrong app's name, on the home screen, unreachable by anything
the running app renders. `index.html` is now templated through a
`transformIndexHtml` plugin in `vite.config.ts`, so the title, the description,
the touch icon and that label all follow `VITE_PRODUCT`.

The icons were shared, which is the same failure in a different place. An icon
that belongs to another app is a wrong icon rather than a missing one, and two
government apps side by side on a home screen with the same mark is worse than
either having none. `scripts/build-icons.mjs` generates both from one spec —
identical ring, disc, palette and proportions; different field colour and
glyph — so they read as one family and never as one app. Green is not a new
colour: it is the one the app already uses for the barangay tier everywhere.
**Both are still placeholders** for the LGU's own seal; what this fixes is the
pair being indistinguishable, which replacing one of them would not have.

`id` is stated in the manifest rather than left to default to `start_url`, so
the install identity is a decision instead of a consequence of whichever path
the resident happened to be on when they installed.

## How a resident is told the link at all

A PWA has no store listing, which is most of why it suits this: nothing to
review, nothing to update through a store, and it runs on the cheap Android
phones a barangay actually owns. The cost is that **somebody has to tell the
resident the address**, and nothing in either console did.

So both the barangay's **Hall** tab and the municipality's **Office details**
tab carry the same card: the address, a real QR of it, a copy button, and a
printable A4 poster with the Android and the iPhone routes side by side —
because a resident following the wrong one of the two gets nowhere.

The URL is `window.location.origin`, not configuration. Whoever is reading that
screen reached it on the deployment's own address, so the browser already knows
the one thing a setting could get wrong — and a poster carrying an address that
does not resolve is worse than no poster, because somebody will print a hundred
of them.

The poster is built as its own document and printed from a new window rather
than being the console with a print stylesheet over it. A print stylesheet has
to hide the whole console around it, and every tab added later is one more
thing that can leak onto the paper — which on *that* console would mean a
household address or a blotter entry on something taped to a wall.

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
