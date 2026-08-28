import { one, query } from './db.ts'

/**
 * Failed-login throttling, on two axes:
 *
 *  - per account, so one address cannot be guessed at indefinitely
 *  - per IP, so one client cannot spray attempts across many accounts
 *
 * Both are needed: the account limit alone lets an attacker try one password
 * against thousands of accounts, and the IP limit alone lets a botnet grind a
 * single account from many addresses.
 */
export const LOGIN_LIMITS = {
  /** Failures against one email address before it stops accepting attempts. */
  perEmail: 5,
  /** Failures from one IP across any accounts. Higher: offices share an IP. */
  perIp: 20,
  /** How far back failures are counted, and how long a lockout lasts. */
  windowSeconds: 15 * 60,
} as const

export interface ThrottleVerdict {
  allowed: boolean
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfter: number
}

const ALLOWED: ThrottleVerdict = { allowed: true, retryAfter: 0 }

/**
 * Decides whether a login attempt may proceed. Called before any password
 * comparison, so a locked account costs an attacker a query rather than a
 * bcrypt verification.
 */
export async function checkLoginThrottle(email: string, ip: string): Promise<ThrottleVerdict> {
  const row = await one<{ email_failures: number; ip_failures: number; oldest: Date | null }>(
    `select
       count(*) filter (where email = $1)::int as email_failures,
       count(*) filter (where ip = $2)::int    as ip_failures,
       min(attempted_at)                        as oldest
     from login_attempts
     where succeeded = false
       and attempted_at > now() - ($3 || ' seconds')::interval
       and (email = $1 or ip = $2)`,
    [email.toLowerCase(), ip, LOGIN_LIMITS.windowSeconds]
  )

  if (!row) return ALLOWED

  const blocked =
    row.email_failures >= LOGIN_LIMITS.perEmail || row.ip_failures >= LOGIN_LIMITS.perIp
  if (!blocked) return ALLOWED

  // The lockout lifts as the oldest counted failure ages out of the window.
  const oldestMs = row.oldest ? row.oldest.getTime() : Date.now()
  const elapsed = Math.floor((Date.now() - oldestMs) / 1000)
  const retryAfter = Math.max(1, LOGIN_LIMITS.windowSeconds - elapsed)
  return { allowed: false, retryAfter }
}

export async function recordLoginAttempt(email: string, ip: string, succeeded: boolean) {
  await query(
    `insert into login_attempts (email, ip, succeeded) values ($1, $2, $3)`,
    [email.toLowerCase(), ip, succeeded]
  )
}

/**
 * Clears an address's failures after a correct password, so someone who
 * mistyped a few times isn't locked out later in the day.
 */
export async function clearLoginFailures(email: string) {
  await query(`delete from login_attempts where email = $1 and succeeded = false`, [
    email.toLowerCase(),
  ])
}

/** Drops rows that have aged out of every window. */
export async function purgeOldAttempts() {
  await query(
    `delete from login_attempts where attempted_at < now() - ($1 || ' seconds')::interval`,
    [LOGIN_LIMITS.windowSeconds * 4]
  )
}

/**
 * The client address to attribute an attempt to.
 *
 * express only populates req.ip from X-Forwarded-For when trust proxy is set,
 * which is why that is configuration rather than a default: trusting the header
 * on a directly-exposed server would let any client forge its own address and
 * walk straight past the IP limit.
 */
export function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}
