import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, signToken, verifyPassword } from '../auth.ts'

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

  const existing = await one(`select 1 from users where lower(email) = lower($1)`, [body.email])
  if (existing) {
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

  const user = await one<{ id: string; email: string; password_hash: string; role: 'resident' | 'staff' | 'admin'; full_name: string }>(
    `select id, email, password_hash, role, full_name from users where lower(email) = lower($1)`,
    [email]
  )

  // Same message and a real hash comparison either way, so timing and wording
  // don't reveal which emails exist.
  const hash = user?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await verifyPassword(password, hash)
  if (!user || !ok) {
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }

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
  res.json({ user: req.user, profile: profile ?? null })
})
