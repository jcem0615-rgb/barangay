# The barangay roster

`barangays.malasiqui.json` is the roster `BARANGAY_ROSTER` points at. It
replaces the six sample barangays in `src/data/mockData.ts`, which exist only
so a development copy runs with no configuration at all.

## This file is a draft, and it is 7 short

Malasiqui has **73 barangays**. This file carries **66** — the names that could
be corroborated against published sources. The remaining seven are **not here,
and were deliberately not invented**: a barangay name is printed on a
certificate that goes out over the Punong Barangay's name, and a plausible
wrong one is worse than an obvious gap.

Two things still need doing before this is deployed:

1. **Complete it to 73** from the authoritative source — the PSA's PSGC table
   for Malasiqui, municipality code `0105524000`
   (<https://psa.gov.ph/classification/psgc/barangays/0105524000>), or the
   municipality's own listing.
2. **Check every spelling in it against that table.** Sources disagree on
   several — `Palong` against `Polong`, the `Este`/`Weste` and `Norte`/`Sur`
   pairs — and the PSGC spelling is the one a certificate has to match.

Note that `Tolonguat`, which appears in the sample roster in `mockData.ts`,
could not be corroborated at all. Treat every sample name as invented.

## Set BARANGAY_COUNT so an incomplete roster cannot ship

```bash
BARANGAY_ROSTER=./barangays.malasiqui.json
BARANGAY_COUNT=73
```

With the file as it stands, that pair **refuses to provision** and says seven
are missing. That is the point. Shape validation cannot catch this: 66
well-formed rows parse perfectly, seed perfectly, and then seven barangays'
worth of residents cannot register — with nothing in the running app to say
why, because every screen is working exactly as written. The count is the only
thing that knows.

`BARANGAY_COUNT` is opt-in. A development copy has no business declaring 73.

## The officials are blank on purpose

`captain`, `secretary`, `hallAddress`, `officeHours`, `phone` and `email` are
empty in every row. They change at every barangay election and the hall cannot
maintain them for seventy-three barangays from a source file — so each barangay
fills in its own from **The hall** tab in its console, which is what that tab is
for. Seeding a name here would put somebody this repository invented on an
official certificate.

## The id is what the database keys on

Once a barangay has been seeded and residents are stamped with it, **changing
its `id` orphans them**. Correct a `name` freely; treat an `id` as fixed from
the first provision onward.
