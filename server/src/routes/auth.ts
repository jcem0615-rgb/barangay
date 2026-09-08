import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, requireRole, signToken, verifyPassword } from '../auth.ts'
import {
  checkLoginThrottle, clearLoginFailures, clientIp, LOGIN_LIMITS,
  purgeOldAttempts, recordLoginAttempt,
} from '../rateLimit.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'
import { hashToken, issueResetToken, RESET_TTL_MINUTES } from '../resetTokens.ts'
import { listResidentPrograms } from '../programs.ts'
import {
  detectType, MAX_PORTRAIT_BYTES, PORTRAIT_DESCRIPTION, PORTRAIT_TYPES,
} from '../uploads.ts'
import { getFile, putFile, removeFile } from '../storage.ts'
import { scanBuffer } from '../antivirus.ts'
import {
  issueVerificationCode, purgeStaleCodes, VERIFICATION_TTL_SECONDS,
} from '../idVerification.ts'

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
            birth_date as "birthDate", address,
            photo_key is not null as "hasPhoto",
            photo_updated_at as "photoUpdatedAt"
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

// ---------------------------------------------------------------------------
// The portrait on the digital ID
//
// The resident's own photo, and nobody else's business: every route below is
// scoped to req.user.id, and there is no endpoint for reading another
// resident's. Staff verify identity at the counter against the physical ID, so
// the console has no reason to hold a face for every resident it has served.
// ---------------------------------------------------------------------------

const portraitUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PORTRAIT_BYTES, files: 1 },
})

authRouter.put('/me/photo', authenticate, requireRole('resident'), portraitUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photo to upload.' })

  // The declared type is the caller's claim; the bytes are the fact.
  const detected = detectType(req.file.buffer)
  if (!detected || !PORTRAIT_TYPES.has(detected.contentType)) {
    return res.status(415).json({
      error: `That file isn't a photo. Use a ${PORTRAIT_DESCRIPTION} image.`,
    })
  }

  // Scanned while still in memory, so an infected file never reaches disk.
  const scan = await scanBuffer(req.file.buffer)
  if (scan.status === 'infected') {
    console.warn(`rejected portrait from user ${req.user!.id}: ${scan.signature}`)
    return res.status(422).json({
      error: 'That file was rejected by our virus scan. Try a different photo.',
    })
  }
  if (scan.status === 'unavailable') {
    // Fail closed, exactly as an attachment does.
    console.error(`virus scan unavailable: ${scan.reason}`)
    return res.status(503).json({
      error: "We can't check files for viruses right now. Please try again shortly.",
    })
  }

  const previous = await one<{ photo_key: string | null }>(
    `select photo_key from resident_profiles where user_id = $1`,
    [req.user!.id]
  )

  const stored = await putFile(req.file.buffer)
  const saved = await one<{ photo_updated_at: Date }>(
    `insert into resident_profiles (user_id, photo_key, photo_type, photo_updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update set
       photo_key = excluded.photo_key,
       photo_type = excluded.photo_type,
       photo_updated_at = now()
     returning photo_updated_at`,
    [req.user!.id, stored.storageKey, detected.contentType]
  )

  // Only once the new one is safely recorded, so a failed write cannot leave
  // the resident with no photo at all.
  if (previous?.photo_key) await removeFile(previous.photo_key)

  res.json({ hasPhoto: true, photoUpdatedAt: saved!.photo_updated_at.toISOString() })
})

authRouter.get('/me/photo', authenticate, requireRole('resident'), async (req, res) => {
  const row = await one<{ photo_key: string | null; photo_type: string | null }>(
    `select photo_key, photo_type from resident_profiles where user_id = $1`,
    [req.user!.id]
  )
  if (!row?.photo_key) return res.status(404).json({ error: 'No photo on file.' })

  let content: Buffer
  try {
    content = await getFile(row.photo_key)
  } catch {
    return res.status(410).json({ error: 'That photo is no longer available.' })
  }

  // Served inline because the ID card renders it. Safe only because the type
  // came from the magic bytes and SVG is not among the accepted ones.
  res.setHeader('Content-Type', row.photo_type ?? 'image/jpeg')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(content)
})

authRouter.delete('/me/photo', authenticate, requireRole('resident'), async (req, res) => {
  const row = await one<{ photo_key: string | null }>(
    `select photo_key from resident_profiles where user_id = $1`,
    [req.user!.id]
  )
  if (!row?.photo_key) return res.status(404).json({ error: 'No photo on file.' })

  await query(
    `update resident_profiles
        set photo_key = null, photo_type = null, photo_updated_at = null
      where user_id = $1`,
    [req.user!.id]
  )
  await removeFile(row.photo_key)
  res.status(204).end()
})

/**
 * A fresh verification code for the ID screen. Issued to the resident only:
 * the whole point is that holding the phone is what proves the ID is yours.
 */
authRouter.post('/me/verification', authenticate, requireRole('resident'), async (req, res) => {
  const issued = await issueVerificationCode(req.user!.id)
  void purgeStaleCodes().catch(() => undefined)
  res.json({ ...issued, ttlSeconds: VERIFICATION_TTL_SECONDS })
})
