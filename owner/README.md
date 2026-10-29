# The owner portal

The registry of who bought the portal, how each deployment is doing, and the
poster that gets residents onto it.

```bash
cd owner
cp .env.example .env            # OWNER_DATABASE_URL, OWNER_TOKEN_KEY
npm install
npm run provision               # migrate, then create the first account
npm start                       # http://localhost:4500
```

`npm run seed` creates one account and prints a generated password. Run it
again with a different `OWNER_EMAIL` to add another; `OWNER_ROLE=viewer` makes
an account that can read the registry and print posters but cannot add, edit or
decommission anything. There is no sign-up form, deliberately: this service
holds every customer's ops token, and an open door onto it is the worst one in
the system.

## Passwords

Everyone changes their own from **Your password** (their name in the top bar).
The current one is required — a console left open on a desk is the ordinary way
an account is taken over — and a change **signs out every other session that
account has open**, on every device. Somebody changes a password when they
think it is known, so leaving the others alive would make the act useless
exactly when it matters. A viewer may change theirs too: a read-only account is
still a way into the registry.

Lost one? There is no reset-by-email, because mail from this service would be
one more thing to configure correctly on the box holding every customer's ops
token. Somebody with shell access runs:

```bash
OWNER_EMAIL=… OWNER_PASSWORD=… npm run set-password
```

A script of its own rather than a flag on `seed`, because a provision that
quietly resets a password every time it re-runs is a very bad surprise. It
refuses an account that does not exist rather than creating one.

**The floor is eight characters and it is a floor, not a recommendation.** It
exists to refuse something trivially guessable; it certifies nothing about what
clears it. This console holds every customer's ops token, so the honest advice —
which the screen gives — is a passphrase out of a password manager.

## It never reads a customer's database

The portal's whole isolation model is that two municipalities share no rows and
no account can see across them. A control plane holding every `DATABASE_URL`
would undo that in one line and become the single most valuable target in the
system — one stolen session, every town's residents.

So the only thing that crosses from a deployment to here is what that
deployment's own `/api/ops/status` publishes: **tier, identity, health and
counts**, no row of any kind. `server/test/ops.mjs` walks the entire response
and fails on any string field outside a known set, on anything shaped like an
email address and on anything shaped like a reference number — a scan rather
than a key list, because the risk is a field somebody adds next year.

That endpoint is **not mounted at all unless `OPS_TOKEN` is set**, the same rule
the hall's routers follow in barangay tier: a route that answers 401 still tells
a caller it exists and is one mistake away from answering properly. A deployment
nobody monitors has no ops surface.

## What a probe actually checks

Not just "did something answer 200". The identity in the response is compared
against the registry, and a mismatch is a failure with both sides named:

```
It answers for "malasiqui-pangasinan"; the registry has "bugallon-pangasinan".
A database wired to the wrong instance looks exactly like this.
```

That is the same check the deployment performs against its own database on
boot, from the other end. A DNS change, a proxy pointed at the wrong container
or a restore into the wrong environment all answer healthily under the wrong
identity, and all of them are otherwise silent.

Failures say what went wrong in words. Node reports a refused connection, an
unresolvable host and a bad certificate all as `fetch failed`, which tells
whoever is on call nothing about where to look.

## The download QR appears the moment a customer is added

A PWA has no store listing — nothing to review, nothing to update through a
store, and it runs on the cheap Android phones the people it serves actually
own. The cost is that somebody has to tell residents the address, and that
somebody is whoever sold them the portal.

So the QR is built from the address on the registry row. There is no step, no
setting and nothing for the office to configure: add the deployment and the
code is on the next screen, with an A4 poster behind it carrying the Android
and the iPhone routes side by side. A resident following the wrong one of the
two gets nowhere, so both are on the paper.

It used to live in the LGU's own consoles. It is here instead because the
address is a fact the firm records when it sells, not something an office
should have to find out about its own portal.

## What cannot be edited, and why

The **slug**, the **tier**, the **municipality code** and the **barangay id**
are fixed at the moment a deployment is added. Every account inside a
deployment is stamped with its municipality code and sign-in refuses an account
from another register, so changing it here would rename nothing — it would only
make this registry disagree with the instance, which is precisely the mismatch
the design exists to surface.

What a place is *called* can be corrected. Which place it is cannot.

## Decommissioning is not deleting

Decommissioning marks the row, stops the checks, clears the ops token and keeps
every event, because "what happened to Bugallon?" is a question somebody asks a
year later. **It does not touch the customer's database** and the console says
so: dropping an LGU's records is something a person does deliberately against a
backup they have checked, not a consequence of a button in a web page.

Removing the row for good needs the deployment to be decommissioned first and
the slug typed back. The activity log survives it, because events carry the
slug as text rather than only a foreign key.

## Secrets

Each deployment's ops token is **sealed at rest** with `OWNER_TOKEN_KEY`
(AES-256-GCM). It cannot be hashed like a password, because this service has to
present it to the deployment — so the next best thing is that a dump of this
database on its own is a list of customers rather than a working key to every
status endpoint.

The plain token is shown **once**, when the deployment is added or the token is
rotated. A secret a console will show you twice is one sitting in a page
somebody left open. Lost it? Rotate a new one.

## It does not provision anything

Provisioning creates a database, writes secrets and starts a container. A web
page that did that would hold credentials for every customer's infrastructure,
and one stolen session would be every town at once.

What the **Setup** tab does instead is generate the exact env file, the exact
roster and the exact commands from the row — so the operator's part is copying
rather than remembering, which is where the mistakes actually come from. See
*Standing up a second municipality* and *Standing up a barangay* in `DEPLOY.md`
for what those commands do.

## Why it is server-rendered

No build step, no second bundle, no second deploy. This is an internal console
for the handful of people who sell the portal, and the thing that actually
matters — that the registry is correct and every write is audited — lives on
the server either way. The palette is the portal's own, because somebody
showing a customer this screen should not have to explain that it is a
different product.

## Tests

```bash
npm test                   # 77 assertions; provisions its own database
cd ../server && npm run test:ops   # 27; the deployment side of the same contract
```

The owner suite drives the console over HTTP as a browser would — forms,
cookies, CSRF — because every write is a form post and testing the functions
underneath would skip the half that can be got wrong.
