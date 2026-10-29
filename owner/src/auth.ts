import bcrypt from 'bcryptjs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from './env.ts'
import { one, query } from './db.ts'

export type OwnerUser = { id: string; email: string; name: string; role: 'owner' | 'viewer' }

declare module 'express-serve-static-core' {
  interface Request {
    owner?: OwnerUser
  }
}

const ROUNDS = 12

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS)
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash)

/**
 * The floor, which is a floor and not a recommendation.
 *
 * Eight characters is the common minimum and it is what this refuses below —
 * it exists to stop something trivially guessable, not to certify what is
 * left. The console holds every customer's ops token, so the honest advice is
 * a passphrase from a password manager, and the screen says so rather than
 * implying that clearing the bar is the same as being safe.
 */
export const MIN_PASSWORD = 8

export function checkPassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters.`
  if (plain.length > 200) return 'That password is too long.'
  if (plain.trim() !== plain) return 'A password cannot start or end with a space.'
  return null
}

/**
 * Sets a password and **ends every other session that account has open.**
 *
 * Changing a password is the one thing somebody does when they think a
 * password is known, so leaving the other sessions alive would make the act
 * useless exactly when it matters. The portal one tier down enforces the same
 * thing through `users.password_changed_at` on every request; here there is a
 * session table, so the rows are simply deleted.
 *
 * `keep` is the session doing the changing, so the person is not signed out of
 * the tab they are standing in.
 */
export async function setPassword(userId: string, plain: string, keepTokenHash?: string): Promise<void> {
  await query(`update owner_users set password_hash = $2 where id = $1`, [userId, await hashPassword(plain)])
  await query(
    `delete from owner_sessions where user_id = $1 and ($2::text is null or token_hash <> $2)`,
    [userId, keepTokenHash ?? null]
  )
}

/** The hash of the session cookie on this request, for `setPassword`'s `keep`. */
export const sessionTokenHash = (req: Request): string | undefined => {
  const token = req.cookies?.[SESSION_COOKIE]
  return typeof token === 'string' && token.length > 20 ? hashToken(token) : undefined
}

/**
 * Sessions are random tokens in a cookie, with only their hash stored.
 *
 * Not a JWT, and that is the one place this service deliberately differs from
 * the portal it sells. The portal's 12-hour JWTs cannot be revoked, which is
 * an accepted trade for a resident's phone; this console can decommission a
 * customer, and an owner who leaves the firm has to stop having access the
 * moment somebody says so. A row in a table can be deleted. A signed token
 * cannot.
 */
const SESSION_COOKIE = 'owner_session'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function startSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + env.sessionHours * 3600_000)
  await query(
    `insert into owner_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [hashToken(token), userId, expires]
  )
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    expires,
    path: '/',
  })
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE]
  if (token) await query(`delete from owner_sessions where token_hash = $1`, [hashToken(token)])
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Reads the session if there is one. Never refuses — `requireOwner` does that. */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token === 'string' && token.length > 20) {
    const row = await one<OwnerUser>(
      `select u.id, u.email, u.name, u.role
         from owner_sessions s
         join owner_users u on u.id = s.user_id
        where s.token_hash = $1
          and s.expires_at > now()
          and u.deactivated_at is null`,
      [hashToken(token)]
    )
    if (row) req.owner = row
  }
  next()
}

/** Signed in, any role. */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.owner) {
    res.redirect(`/sign-in?next=${encodeURIComponent(req.originalUrl)}`)
    return
  }
  next()
}

/**
 * May change the registry.
 *
 * A viewer can read every deployment and print its poster — that is the whole
 * point of the role, so somebody who is not a director can answer "is Bugallon
 * up?" without being able to decommission them by misclicking.
 */
export function requireWrite(req: Request, res: Response, next: NextFunction): void {
  if (!req.owner) {
    res.redirect('/sign-in')
    return
  }
  if (req.owner.role !== 'owner') {
    res.status(403).send(forbidden())
    return
  }
  next()
}

const forbidden = () =>
  `<!doctype html><meta charset="utf-8"><title>Not allowed</title>
   <body style="font:16px system-ui;padding:3rem;max-width:40rem;margin:auto">
   <h1 style="font-size:1.3rem">Not allowed</h1>
   <p>Your account can read the registry but not change it. Ask a director if this is wrong.</p>
   <p><a href="/">Back to the list</a></p></body>`

/**
 * Cross-site request forgery.
 *
 * Every state-changing route here is a form POST from this same origin, and
 * the session cookie is `SameSite=Lax`, which already blocks the cross-site
 * POST case in every browser that matters. The token is the belt to that
 * braces: it costs one hidden field and means a future GET-based link or an
 * embedded form cannot be made to decommission a customer.
 */
export function csrfToken(req: Request): string {
  const token = req.cookies?.[SESSION_COOKIE]
  return token ? createHash('sha256').update(`csrf:${token}`).digest('base64url') : ''
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const expected = csrfToken(req)
  const given = typeof req.body?._csrf === 'string' ? req.body._csrf : ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(400).send('That form has expired. Go back, reload the page and try again.')
    return
  }
  next()
}
