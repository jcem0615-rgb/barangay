# The eBarangay Portal proposal

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright

node proposal/barangay/build.mjs              # the blank, for any barangay
node proposal/barangay/build.mjs poblacion    # a copy naming one
node proposal/barangay/build.mjs --all        # all 73 in the roster
```

Output lands in `proposal/barangay-lgu/`. Each document is a covering letter to
the Punong Barangay, a one-page overview, then every control in each of the four
portals with the icon it actually carries.

## The blank is the default, and that is the point

A municipal proposal is addressed to one mayor and there are ten of them in
`proposal/overview/lgus.mjs`. There are 42,000 barangays, their captains change
every term, and nobody at this end knows who holds the office in any of them. So
the default document rules a line for every fact that identifies the barangay —
the captain, the barangay, the municipality, the province — and one PDF prints a
stack for a morning of visits.

Passing a slug produces a copy with the barangay named, for a visit that was
arranged. The roster behind those slugs is `server/barangays.malasiqui.json`, the
73 this repository already loads and checks; it carries no captains, because
those are what each barangay fills in from its own console, so a named copy still
rules the line for the person.

A name is never guessed. Naming the wrong captain is worse than an empty line —
the same rule `lgus.mjs` follows for mayors.

## The control list is its own file

`controls.mjs` here is not a filter over `proposal/overview/controls.mjs`, and
that is deliberate. The two products share a codebase; they do not share a
control list. Deriving this one would mean a screen added to the hall appearing
in a barangay's proposal by accident — in the document that tells somebody what
they are buying.

What it *does* share is `proposal/overview/build.mjs`: the lucide icon loader,
the embedded fonts and the LogicGrid marks. Those are rendering, not claims.

## What the document says it cannot do

The overview page carries a panel headed **What it does not do, said plainly** —
no online payment, a signature that is a scan rather than a cryptographic one,
email and SMS needing a service connected, and nothing cross-checking what a
certificate attests. It sits beside the panel listing what the barangay would
need to supply, at the same weight.

That panel is not a disclaimer at the end. A proposal that is quiet about its
limits is one whose first demonstration goes badly, and every one of those four
is something the buyer would otherwise discover in the first week.
