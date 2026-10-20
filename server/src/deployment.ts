import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { BARANGAYS, MUNICIPALITY, type BarangaySeed } from '../../src/data/mockData.ts'

/**
 * Which municipality this deployment serves, and what it was given to serve it.
 *
 * **One deployment, one municipality, one database.** That is the whole
 * isolation model and it is why there is no `municipality_id` on every table:
 * two towns never share a row, so there is no query that could forget to scope
 * and no superadmin who can see across. The cost is that standing up a second
 * LGU is an operational act rather than a form — and this module is what makes
 * it an operational act rather than a *fork*, which is what it used to be when
 * the town's name and its barangay roster were TypeScript literals.
 *
 * Everything here reads the environment first and falls back to the sample data
 * in `mockData.ts`. The fallback is what keeps `npm run seed` working for
 * development with no configuration at all; a real deployment sets the
 * variables and never touches the source.
 */

const trimmed = (name: string) => process.env[name]?.trim() || undefined

export interface ConfiguredMunicipality {
  code: string
  name: string
  province: string
  /**
   * What goes on an official receipt. Seeded only into blanks, because the
   * Municipality tab is where these are corrected and a re-seed must not undo
   * somebody's correction.
   */
  address: string
  phone: string
  email: string
  website: string
  tin: string
  treasurerName: string
  treasurerTitle: string
  receiptPrefix: string
  receiptFormLabel: string
  receiptFooter: string
  /** Whether this came from the environment or from the sample data. */
  source: 'environment' | 'sample'
}

/**
 * The town this instance is for.
 *
 * The **code** is the identity the database keeps and every account is stamped
 * with; the name and province are what a resident reads. Changing the code on a
 * live deployment strands every account registered under the old one, which is
 * why `boot` below refuses to start rather than letting it happen quietly.
 */
export function configuredMunicipality(): ConfiguredMunicipality {
  // The receipt details fall back to the sample individually rather than as a
  // block: a deployment that sets its own address and telephone number but has
  // not yet been told its TIN should get the one it set and a blank for the
  // rest, not the sample town's.
  const receipt = {
    address: trimmed('MUNICIPALITY_ADDRESS') ?? '',
    phone: trimmed('MUNICIPALITY_PHONE') ?? '',
    email: trimmed('MUNICIPALITY_EMAIL') ?? '',
    website: trimmed('MUNICIPALITY_WEBSITE') ?? '',
    tin: trimmed('MUNICIPALITY_TIN') ?? '',
    treasurerName: trimmed('MUNICIPALITY_TREASURER') ?? '',
    treasurerTitle: trimmed('MUNICIPALITY_TREASURER_TITLE') ?? 'Municipal Treasurer',
    receiptPrefix: trimmed('RECEIPT_PREFIX') ?? 'OR',
    receiptFormLabel: trimmed('RECEIPT_FORM_LABEL') ?? '',
    receiptFooter: trimmed('RECEIPT_FOOTER') ?? '',
  }

  const code = trimmed('MUNICIPALITY_CODE')
  if (!code) return { ...MUNICIPALITY, ...stripBlanks(receipt), source: 'sample' }
  return {
    code,
    name: trimmed('MUNICIPALITY_NAME') ?? code,
    province: trimmed('MUNICIPALITY_PROVINCE') ?? '',
    ...receipt,
    source: 'environment',
  }
}

/** Blank means "not configured", so the sample value underneath stands. */
function stripBlanks<T extends Record<string, string>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')) as Partial<T>
}

const rosterSchema = z.array(z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  captain: z.string().max(120).default(''),
  secretary: z.string().max(120).default(''),
  hallAddress: z.string().max(300).default(''),
  officeHours: z.string().max(200).default(''),
  phone: z.string().max(40).default(''),
  email: z.string().max(160).default(''),
})).min(1, 'A municipality has at least one barangay.')

/**
 * The barangays this municipality has.
 *
 * A real one has dozens — Malasiqui has 73 — and typing them into a source file
 * is how the roster ends up a fork of the app. `BARANGAY_ROSTER` points at a
 * JSON file instead, which is the shape the PSGC listing exports to and the
 * shape a hall can maintain without a developer.
 *
 * **A malformed file stops the seed rather than seeding part of it.** Half a
 * roster is worse than none: residents of the missing barangays cannot register
 * at all, and nothing about the running app would say why.
 */
export function configuredBarangays(): BarangaySeed[] {
  const path = trimmed('BARANGAY_ROSTER')
  if (!path) return [...BARANGAYS]

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(
      `Could not read the barangay roster at ${path}: ` +
      `${err instanceof Error ? err.message : 'unknown error'}`
    )
  }
  const parsed = rosterSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The barangay roster at ${path} is not valid:\n${z.prettifyError(parsed.error)}`)
  }

  const ids = new Set(parsed.data.map((b) => b.id))
  if (ids.size !== parsed.data.length) {
    throw new Error(`The barangay roster at ${path} has two barangays with the same id.`)
  }

  // How many the municipality actually has, when the deployment states it.
  //
  // Shape validation cannot catch the failure that matters here: a roster of
  // 66 well-formed rows for a town of 73 parses perfectly, seeds perfectly,
  // and then seven barangays' worth of residents cannot register — with
  // nothing in the running app to say why, because every screen is working
  // exactly as written. The count is the only thing that knows.
  //
  // So a deployment that knows its own number says it, and a roster that does
  // not match is refused with the gap named rather than seeded short. It is
  // deliberately opt-in: a development copy has no business declaring 73.
  const expected = trimmed('BARANGAY_COUNT')
  if (expected) {
    const want = Number(expected)
    if (!Number.isInteger(want) || want < 1) {
      throw new Error(`BARANGAY_COUNT must be a whole number, not ${expected}.`)
    }
    if (parsed.data.length !== want) {
      const short = want - parsed.data.length
      throw new Error(
        `The barangay roster at ${path} has ${parsed.data.length} barangays, ` +
        `but BARANGAY_COUNT says ${want} — ` +
        (short > 0 ? `${short} missing.` : `${-short} too many.`) +
        ' Seeding part of a roster leaves residents of the missing barangays' +
        ' unable to register, with nothing in the app to say why.'
      )
    }
  }
  return parsed.data
}

/** The one account that can issue every other account. */
export function configuredAdministrator(): { email: string; name: string } {
  return {
    email: trimmed('ADMIN_EMAIL') ?? 'admin@malasiqui.gov.ph',
    name: trimmed('ADMIN_NAME') ?? 'Office of the Mayor — Administrator',
  }
}

/**
 * Whether to create the sample staff and barangay logins.
 *
 * They all share one password, which is right for clicking through a
 * development copy and wrong for a town. Off by default in production, so
 * provisioning a real LGU creates the administrator and nobody else — the hall
 * then issues its own staff from inside the app, which is what that screen is
 * for, and each barangay issues its own clerks and kagawads.
 */
export function seedsSampleAccounts(): boolean {
  const flag = trimmed('SEED_SAMPLE_ACCOUNTS')
  if (flag !== undefined) return flag !== 'false'
  return process.env.NODE_ENV !== 'production'
}
