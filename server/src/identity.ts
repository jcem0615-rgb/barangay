import { createHash } from 'node:crypto'
import { one } from './db.ts'
import { MUNICIPALITY } from '../../src/data/mockData.ts'

/**
 * Who this portal serves, and who is already in its register.
 */

export type ServedMunicipality = { code: string; name: string; province: string }

let cached: ServedMunicipality | null = null

/**
 * The municipality this deployment serves, read from the database rather than
 * the imported constant: an operator who seeded one municipality and then
 * edited mockData would otherwise have a server that disagrees with its own
 * register about which town it is.
 *
 * Falls back to the constant only when the row is missing, which is a database
 * that has been migrated but never seeded.
 */
export async function servedMunicipality(): Promise<ServedMunicipality> {
  if (cached) return cached
  const row = await one<ServedMunicipality>(
    `select code, name, province from municipality limit 1`
  )
  cached = row ?? { ...MUNICIPALITY }
  return cached
}

/** Only for tests and the seed, which change the row underneath a live process. */
export function forgetMunicipality(): void {
  cached = null
}

/**
 * Folds a name to the form two clerks would agree is the same person.
 *
 * Case, accents and punctuation go, because "Dela Cruz", "dela cruz" and
 * "DELA-CRUZ" are one family name written by three different people. Single
 * letters go with them: a middle initial is present on half the forms in any
 * municipal office and absent on the other half, and a duplicate check that
 * treats "Juan C. Santos" and "Juan Santos" as two people has failed at the only
 * job it has. The cost is that a genuine one-letter given name is dropped, which
 * is the rarer case and still leaves the rest of the name in the key.
 */
export function normaliseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .join(' ')
}

/**
 * The fingerprint of a person: their name, their date of birth and their
 * mother's maiden name — the triple a Philippine civil registry uses to tell
 * two people with the same name apart.
 *
 * Name alone is hopeless in a municipality where a hundred people are called
 * Juan Santos. Birth date and mother's maiden name alone would refuse *twins*,
 * who share both. All three together is the combination that separates them,
 * because twins are given different first names.
 *
 * **What the hash buys and what it does not.** It has to be deterministic to be
 * an index, so it cannot be salted per row and cannot be slow: an attacker
 * holding the table already has each resident's name and birth date from the
 * same row, and could confirm a guessed maiden name by recomputing this. What it
 * stops is the table *reading* as a list of mothers' maiden names, which is what
 * storing the answer in the clear would have been. A deployment that needs more
 * than that should not be asking for the maiden name at all.
 */
export function identityKey(
  fullName: string,
  birthDate: string,
  motherMaidenName: string
): string {
  const parts = [normaliseName(fullName), birthDate.trim(), normaliseName(motherMaidenName)]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

/**
 * True when this register already holds that person. No municipality argument:
 * a deployment serves one, so every row in the table is already this one's.
 *
 * `one` resolves to undefined rather than null for an empty result — comparing
 * against null here would make every registration look like a duplicate.
 */
export async function identityTaken(key: string): Promise<boolean> {
  const row = await one(`select 1 from resident_profiles where identity_key = $1`, [key])
  return row !== undefined
}
