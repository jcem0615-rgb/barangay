/**
 * Who a barangay proposal is addressed to.
 *
 * A municipal proposal names a mayor; this one names the Punong Barangay, and
 * in almost every case nobody at this end knows who that is. There are 42,000
 * barangays in the country and their captains change every term, so the name is
 * a ruled blank to be filled in by hand unless a row actually states one —
 * the same rule `proposal/overview/lgus.mjs` follows for mayors, and for the
 * same reason: naming the wrong person is worse than leaving the line empty.
 *
 * `name` is nullable too, and that is the normal case rather than an oversight.
 * The default document is the one to print a stack of: everything that
 * identifies the barangay is a blank, so one PDF serves a morning of visits.
 * Pass a slug on the command line to get a copy with a particular barangay's
 * details already set.
 *
 * The roster behind those slugs is `server/barangays.malasiqui.json` — the 73
 * this project already loads and checks. It carries no captains, because those
 * are what each barangay fills in from its own console; so a per-barangay
 * proposal names the place and still rules the line for the person.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The blank. One document, any barangay, filled in by hand on the day. */
export const BLANK = {
  slug: 'blank',
  name: null,
  municipality: null,
  province: null,
  captain: null,
}

/**
 * Malasiqui's 73, from the roster this repository already carries. A copy of
 * the same letter with the barangay named, for a visit that was arranged.
 */
export function roster() {
  const rows = JSON.parse(readFileSync(resolve(root, 'server/barangays.malasiqui.json'), 'utf8'))
  return rows.map((b) => ({
    slug: b.id,
    name: b.name,
    municipality: 'Malasiqui',
    province: 'Pangasinan',
    // The roster ships every captain blank on purpose — see server/README.
    captain: b.captain || null,
  }))
}

/** The surname a salutation uses. Last word unless the row says otherwise. */
export const surnameOf = (b) => b.surname ?? (b.captain ? b.captain.trim().split(/\s+/).at(-1) : null)

export const PRODUCT = {
  name: 'eBarangay Portal',
  // What it is in one line, for the subject line and the cover.
  blurb: 'A complete electronic barangay system — certificates, notices, the blotter and the Record of Barangay Inhabitants',
}
