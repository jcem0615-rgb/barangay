import { createHash, randomBytes } from 'node:crypto'
import { one, query } from './db.ts'

/**
 * Proving a digital ID belongs to whoever is holding the phone.
 *
 * The ID shows a code the resident reads out (or a clerk types) at the counter.
 * Two properties make it worth more than the card itself:
 *
 *  - **It expires in ninety seconds.** A screenshot of someone else's ID is
 *    stale long before it can be walked to a counter.
 *  - **It is consumed on first check.** The same code cannot be presented to a
 *    second clerk, so passing one along buys nothing.
 *
 * Crockford-style base32 for the same reason the document codes use it: read
 * off a phone screen and typed by someone else, without I/L/O/U to confuse.
 */

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 12

/** Long enough that guessing inside the window is hopeless: 32^12 ≈ 1.2e18. */
export const VERIFICATION_TTL_SECONDS = 90

/** Only the hash is stored, so a leaked table yields no usable codes. */
const hashCode = (code: string) =>
  createHash('sha256').update(code.toUpperCase().replace(/-/g, '')).digest('hex')

function makeCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
    // Grouped for reading aloud: XXXX-XXXX-XXXX
    if (i % 4 === 3 && i !== CODE_LENGTH - 1) code += '-'
  }
  return code
}

export interface IssuedCode {
  code: string
  expiresAt: string
}

/**
 * Issues a fresh code, retiring any the resident still has outstanding. Only
 * the newest code on a screen should work: an older one still lying in another
 * tab is a second key to the same door.
 */
export async function issueVerificationCode(userId: string): Promise<IssuedCode> {
  const code = makeCode()

  await query(
    `update id_verifications
        set consumed_at = now()
      where user_id = $1 and consumed_at is null and expires_at > now()`,
    [userId]
  )

  const row = await one<{ expires_at: Date }>(
    `insert into id_verifications (user_id, code_hash, expires_at)
     values ($1, $2, now() + ($3 || ' seconds')::interval)
     returning expires_at`,
    [userId, hashCode(code), VERIFICATION_TTL_SECONDS]
  )

  return { code, expiresAt: row!.expires_at.toISOString() }
}

export type VerificationOutcome =
  | { status: 'valid'; userId: string }
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'used' }

/**
 * Consumes a code, in a single statement so two clerks racing the same code
 * cannot both be told it is valid.
 *
 * The three failure modes are reported apart because they mean different things
 * at a counter: an unknown code is a typo or a forgery, an expired one just
 * needs the resident to look at their screen again, and a used one means
 * somebody already checked it.
 */
export async function consumeVerificationCode(
  code: string,
  staffId: string
): Promise<VerificationOutcome> {
  const hash = hashCode(code)

  const claimed = await one<{ user_id: string }>(
    `update id_verifications
        set consumed_at = now(), verified_by = $2
      where code_hash = $1 and consumed_at is null and expires_at > now()
      returning user_id`,
    [hash, staffId]
  )
  if (claimed) return { status: 'valid', userId: claimed.user_id }

  // Nothing was claimed: say why, without revealing anything about a code that
  // was never issued.
  const existing = await one<{ consumed_at: Date | null; expires_at: Date }>(
    `select consumed_at, expires_at from id_verifications where code_hash = $1`,
    [hash]
  )
  if (!existing) return { status: 'unknown' }
  if (existing.consumed_at) return { status: 'used' }
  return { status: 'expired' }
}

/** Expired codes that were never used are dead weight; drop them on issue. */
export async function purgeStaleCodes(): Promise<void> {
  await query(
    `delete from id_verifications
      where expires_at < now() - interval '1 day' and consumed_at is null`
  )
}
