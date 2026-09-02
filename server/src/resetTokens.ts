import { createHash, randomBytes } from 'node:crypto'
import { query } from './db.ts'

/**
 * Password reset tokens, shared by the resident "forgot password" flow and by
 * admin-created staff accounts — an administrator never sees or sets someone
 * else's password, they send a link and the person chooses their own.
 */

export const RESET_TTL_MINUTES = 60

/** Only the hash is stored, so a leaked table yields no usable links. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Issues a fresh single-use token and returns the raw value to be mailed. */
export async function issueResetToken(userId: string, ttlMinutes = RESET_TTL_MINUTES): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [userId, hashToken(token), ttlMinutes]
  )
  return token
}
