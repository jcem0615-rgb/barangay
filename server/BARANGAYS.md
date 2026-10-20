# The barangay roster

`barangays.malasiqui.json` is the roster `BARANGAY_ROSTER` points at. It
carries **all 73 barangays of Malasiqui**, transcribed from the municipality's
own listing and in its order.

```bash
BARANGAY_ROSTER=./barangays.malasiqui.json
BARANGAY_COUNT=73
```

It replaces the six sample barangays in `src/data/mockData.ts`, which exist
only so a development copy runs with no configuration at all.

## BARANGAY_COUNT is what stops a short roster shipping

Shape validation cannot catch the failure that matters here. A roster of 66
well-formed rows for a town of 73 parses perfectly, seeds perfectly, and then
seven barangays' worth of residents cannot register — with nothing in the
running app to say why, because every screen is working exactly as written.
The count is the only thing that knows.

So state it, and a roster that does not match is refused with the gap named
rather than seeded short. It is opt-in: a development copy has no business
declaring 73.

## Three pairs that look like typos and are not

- **`Palong` and `Polong Norte` / `Polong Sur` are different barangays.** This
  reads as a misspelling and published sources disagree about it, so it is the
  first thing somebody will try to "fix". All three are real.
- **`Taloy` and `Taloyan`** are two barangays, not one with a stray suffix.
- **`Tabo-Sili` and `Tobor`** are separate, and the listing puts `Tobor`
  *before* `Talospatang` — the source order is not alphabetical throughout.
  `Nancapian` likewise sits before `Nalsian Norte`. The file keeps that order
  rather than re-sorting, so it can be checked against the listing line by line.

`Lareg-lareg` carries a lowercase second element and `Manggan-Dampay` an
uppercase one. Both are as published.

## The officials are blank on purpose

`captain`, `secretary`, `hallAddress`, `officeHours`, `phone` and `email` are
empty in every row. They change at every barangay election and the hall cannot
maintain them for seventy-three barangays from a source file — so each barangay
fills in its own from **The hall** tab in its console, which is what that tab is
for. Seeding a name here would put somebody this repository invented on an
official certificate.

## The id is what the database keys on

Ids are slugs of the names (`asin-este`, `cawayan-bogtong`, `manggan-dampay`).
Once a barangay has been seeded and residents are stamped with it, **changing
its `id` orphans them**. Correct a `name` freely; treat an `id` as fixed from
the first provision onward.

That is also why the seeded barangay logins read
`admin.nalsian-norte@malasiqui.gov.ph` — the address is built from the id.

## The six samples in mockData.ts

Five of them — Poblacion, San Julian, Tolonguat, Cabatling, Bacundao Weste —
are real barangays of this municipality; only their officials and contact
details are invented. The sixth was `Nalsian`, which does not exist: Malasiqui
has `Nalsian Norte` and `Nalsian Sur`. It has been corrected to `Nalsian Norte`.
