import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, signToken, verifyPassword } from '../auth.ts'
import {
  checkLoginThrottle, clearLoginFailures, clientIp, LOGIN_LIMITS,
  purgeOldAttempts, recordLoginAttempt,
} from '../rateLimit.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'
import { hashToken, issueResetToken, RESET_TTL_MINUTES } from '../resetTokens.ts'
import { listResidentPrograms } from '../programs.ts'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.email(),
  // Length is the honest lever here; complexity rules mostly push people to
  // predictable substitutions.
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  fullName: z.string().min(2).max(120),
  barangay: z.string().max(120).optional(),
  municipality: z.string().max(120).optional(),
  province: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  philSysId: z.string().max(60).optional(),
  birthDate: z.iso.date().optional(),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: z.prettifyError(parsed.error) })
  }
  const body = parsed.data

  const ip = clientIp(req)
  const throttle = await checkLoginThrottle(body.email, ip)
  if (!throttle.allowed) {
    const minutes = Math.ceil(throttle.retryAfter / 60)
    res.setHeader('Retry-After', String(throttle.retryAfter))
    return res.status(429).json({
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    })
  }

  const existing = await one(`select 1 from users where lower(email) = lower($1)`, [body.email])
  if (existing) {
    await recordLoginAttempt(body.email, ip, false)
    return res.status(409).json({ error: 'That email is already registered. Try signing in.' })
  }

  // Self-registration only ever creates residents. Staff accounts are issued by
  // an administrator, so this endpoint can't be used to mint one.
  const passwordHash = await hashPassword(body.password)
  const user = await transaction(async (client) => {
    const inserted = await client.query<{ id: string; email: string; role: string; full_name: string }>(
      `insert into users (email, password_hash, role, full_name)
       values ($1, $2, 'resident', $3)
       returning id, email, role, full_name`,
      [body.email, passwordHash, body.fullName]
    )
    const created = inserted.rows[0]!
    await client.query(
      `insert into resident_profiles
         (user_id, philsys_id, barangay, municipality, province, birth_date, address)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        created.id, body.philSysId ?? null, body.barangay ?? null, body.municipality ?? null,
        body.province ?? null, body.birthDate ?? null, body.address ?? null,
      ]
    )
    return created
  })

  res.status(201).json({
    token: signToken({ id: user.id, role: 'resident' }),
    user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name, departments: [] },
  })
})

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) })

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter your email and password.' })
  }
  const { email, password } = parsed.data
  const ip = clientIp(req)

  // Checked before the password comparison, so a locked-out attacker cannot
  // keep forcing expensive bcrypt work.
  const throttle = await checkLoginThrottle(email, ip)
  if (!throttle.allowed) {
    const minutes = Math.ceil(throttle.retryAfter / 60)
    res.setHeader('Retry-After', String(throttle.retryAfter))
    return res.status(429).json({
      error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    })
  }

  const user = await one<{ id: string; email: string; password_hash: string; role: 'resident' | 'staff' | 'admin'; full_name: string }>(
    `select id, email, password_hash, role, full_name
       from users
      where lower(email) = lower($1) and deactivated_at is null`,
    [email]
  )

  // A deactivated account is filtered out above, so it behaves exactly like one
  // that does not exist — no token, and nothing that distinguishes "revoked"
  // from "wrong password". Same message and a real hash comparison either way,
  // so timing and wording don't reveal which emails exist.
  const hash = user?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await verifyPassword(password, hash)
  if (!user || !ok) {
    // Recorded for unknown addresses too, so lockout behaviour is identical
    // whether or not the account exists.
    await recordLoginAttempt(email, ip, false)
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }

  // A correct password clears the address's failures, so an honest user who
  // mistyped twice this morning isn't closer to a lockout this afternoon.
  await clearLoginFailures(email)
  void purgeOldAttempts().catch(() => undefined)

  const departments = await query<{ department_id: string }>(
    `select department_id from staff_assignments where user_id = $1`,
    [user.id]
  )

  res.json({
    token: signToken({ id: user.id, role: user.role }),
    user: {
      id: user.id, email: user.email, role: user.role, fullName: user.full_name,
      departments: departments.map((d) => d.department_id),
    },
  })
})

authRouter.get('/me', authenticate, async (req, res) => {
  const profile = await one(
    `select philsys_id as "philSysId", barangay, municipality, province,
            birth_date as "birthDate", address
       from resident_profiles where user_id = $1`,
    [req.user!.id]
  )
  // Memberships ride along with the profile: the digital ID needs them on its
  // first paint, and there are at most a handful per resident.
  const programs = await listResidentPrograms(req.user!.id)
  res.json({ user: req.user, profile: profile ? { ...profile, programs } : null })
})

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const forgotSchema = z.object({ email: z.email() })

authRouter.post('/forgot', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body)
  // Even a malformed address gets the same answer: whether an account exists is
  // not something this endpoint should reveal.
  const acknowledge = () =>
    res.status(202).json({
      message: 'If that email has an account, we have sent a reset link.',
    })

  if (!parsed.success) return acknowledge()
  const email = parsed.data.email
  const ip = clientIp(req)

  // Shares the login budget, so this cannot be used to spray addresses or to
  // flood someone's inbox.
  const throttle = await checkLoginThrottle(email, ip)
  if (!throttle.allowed) {
    const minutes = Math.ceil(throttle.retryAfter / 60)
    res.setHeader('Retry-After', String(throttle.retryAfter))
    return res.status(429).json({
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    })
  }
  await recordLoginAttempt(email, ip, false)

  const user = await one<{ id: string }>(
    `select id from users where lower(email) = lower($1)`, [email]
  )
  if (!user) return acknowledge()

  const token = await issueResetToken(user.id)

  const link = `${env.publicUrl}/?reset=${token}`
  try {
    await sendMail({ to: email, ...resetEmail(link, RESET_TTL_MINUTES) })
  } catch (err) {
    // Don't tell the caller the send failed — that would leak that the account
    // exists. Logged so an operator can see it.
    console.error('failed to send reset email', err)
  }
  acknowledge()
})

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
})

authRouter.post('/reset', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })

  const row = await one<{ id: string; user_id: string }>(
    `select id, user_id from password_reset_tokens
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [hashToken(parsed.data.token)]
  )
  if (!row) {
    return res.status(400).json({ error: 'That reset link is invalid or has expired. Request a new one.' })
  }

  const passwordHash = await hashPassword(parsed.data.password)
  await transaction(async (client) => {
    // password_changed_at invalidates sessions issued before now, so a reset
    // signs out whoever was already holding a token for this account.
    await client.query(
      `update users set password_hash = $2, password_changed_at = now() where id = $1`,
      [row.user_id, passwordHash]
    )
    await client.query(`update password_reset_tokens set used_at = now() where id = $1`, [row.id])
    // Any other outstanding link for this account is spent too.
    await client.query(
      `update password_reset_tokens set used_at = now()
        where user_id = $1 and used_at is null`,
      [row.user_id]
    )
  })

  // A successful reset clears the account's failed-login count, so someone
  // locked out by an attacker can get straight back in.
  const account = await one<{ email: string }>(`select email from users where id = $1`, [row.user_id])
  if (account) await clearLoginFailures(account.email)

  res.status(204).end()
})
