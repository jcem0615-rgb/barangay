import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, requireRole } from '../auth.ts'
import { issueResetToken } from '../resetTokens.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'

export const adminRouter = Router()
adminRouter.use(authenticate, requireRole('admin'))

const STAFF_INVITE_TTL_MINUTES = 7 * 24 * 60 // a week, for someone starting Monday

interface StaffRow {
  id: string
  email: string
  full_name: string
  role: string
  deactivated_at: Date | null
  created_at: Date
  departments: string[] | null
  positions: string[] | null
}

const serializeStaff = (row: StaffRow) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  active: row.deactivated_at === null,
  createdAt: row.created_at.toISOString(),
  departments: (row.departments ?? []).filter(Boolean),
  position: (row.positions ?? []).filter(Boolean)[0] ?? null,
})

const STAFF_SELECT = `
  u.id, u.email, u.full_name, u.role, u.deactivated_at, u.created_at,
  array_agg(sa.department_id) as departments,
  array_agg(sa.position) as positions
`

/** Everyone who works the queues, active or not. Residents are not listed. */
adminRouter.get('/staff', async (_req, res) => {
  const rows = await query<StaffRow>(
    `select ${STAFF_SELECT}
       from users u
       left join staff_assignments sa on sa.user_id = u.id
      where u.role in ('staff', 'admin')
      group by u.id
      order by u.deactivated_at nulls first, u.full_name`
  )
  res.json(rows.map(serializeStaff))
})

const createSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2).max(120),
  role: z.enum(['staff', 'admin']).default('staff'),
  departments: z.array(z.string().min(1).max(64)).max(10).default([]),
  position: z.string().max(120).optional(),
})

/**
 * Creates an account and emails an invitation link. The administrator never
 * sets or sees the password: the account starts with an unusable random one and
 * the person chooses their own through the normal reset flow.
 */
adminRouter.post('/staff', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  if (body.role === 'staff' && body.departments.length === 0) {
    return res.status(400).json({ error: 'Assign at least one office, or the account sees nothing.' })
  }

  const known = await query<{ id: string }>(
    `select id from departments where id = any($1::text[])`, [body.departments]
  )
  if (known.length !== body.departments.length) {
    return res.status(400).json({ error: 'One of those offices does not exist.' })
  }

  const existing = await one(`select 1 from users where lower(email) = lower($1)`, [body.email])
  if (existing) return res.status(409).json({ error: 'That email already has an account.' })

  // Unusable by design — sign-in only becomes possible once they set their own.
  const placeholder = await hashPassword(randomBytes(32).toString('base64url'))

  const created = await transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into users (email, password_hash, role, full_name)
       values ($1, $2, $3, $4) returning id`,
      [body.email, placeholder, body.role, body.fullName]
    )
    const id = inserted.rows[0]!.id
    for (const department of body.departments) {
      await client.query(
        `insert into staff_assignments (user_id, department_id, position) values ($1, $2, $3)`,
        [id, department, body.position ?? null]
      )
    }
    return id
  })

  const token = await issueResetToken(created, STAFF_INVITE_TTL_MINUTES)
  let invited = true
  try {
    await sendMail({
      to: body.email,
      ...resetEmail(`${env.publicUrl}/?reset=${token}`, STAFF_INVITE_TTL_MINUTES),
    })
  } catch (err) {
    console.error('failed to send staff invitation', err)
    invited = false
  }

  const row = await one<StaffRow>(
    `select ${STAFF_SELECT} from users u
       left join staff_assignments sa on sa.user_id = u.id
      where u.id = $1 group by u.id`,
    [created]
  )
  // invited:false tells the admin to follow up rather than assume it arrived.
  res.status(201).json({ ...serializeStaff(row!), invited })
})

const updateSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  departments: z.array(z.string().min(1).max(64)).max(10).optional(),
  position: z.string().max(120).optional(),
})

adminRouter.patch('/staff/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const target = await one<{ id: string; role: string }>(
    `select id, role from users where id = $1 and role in ('staff', 'admin')`,
    [req.params.id]
  )
  if (!target) return res.status(404).json({ error: 'Account not found.' })

  if (body.departments) {
    if (target.role === 'staff' && body.departments.length === 0) {
      return res.status(400).json({ error: 'Assign at least one office, or the account sees nothing.' })
    }
    const known = await query<{ id: string }>(
      `select id from departments where id = any($1::text[])`, [body.departments]
    )
    if (known.length !== body.departments.length) {
      return res.status(400).json({ error: 'One of those offices does not exist.' })
    }
  }

  await transaction(async (client) => {
    if (body.fullName) {
      await client.query(`update users set full_name = $2 where id = $1`, [target.id, body.fullName])
    }
    if (body.departments) {
      await client.query(`delete from staff_assignments where user_id = $1`, [target.id])
      for (const department of body.departments) {
        await client.query(
          `insert into staff_assignments (user_id, department_id, position) values ($1, $2, $3)`,
          [target.id, department, body.position ?? null]
        )
      }
    } else if (body.position !== undefined) {
      await client.query(`update staff_assignments set position = $2 where user_id = $1`, [target.id, body.position])
    }
  })

  const row = await one<StaffRow>(
    `select ${STAFF_SELECT} from users u
       left join staff_assignments sa on sa.user_id = u.id
      where u.id = $1 group by u.id`,
    [target.id]
  )
  res.json(serializeStaff(row!))
})

/**
 * Revokes access without deleting the person. Their name stays on every
 * assessment and release they made, which is the point of an audit trail.
 */
adminRouter.post('/staff/:id/deactivate', async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(409).json({ error: 'You cannot deactivate your own account.' })
  }
  const row = await one<{ id: string }>(
    `update users set deactivated_at = now()
      where id = $1 and role in ('staff', 'admin') and deactivated_at is null
      returning id`,
    [req.params.id]
  )
  if (!row) return res.status(404).json({ error: 'Account not found, or already deactivated.' })
  // Outstanding invitation or reset links are spent, so they cannot be used to
  // walk back in after access was revoked.
  await query(
    `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
    [row.id]
  )
  res.status(204).end()
})

adminRouter.post('/staff/:id/reactivate', async (req, res) => {
  const row = await one<{ id: string }>(
    `update users set deactivated_at = null
      where id = $1 and role in ('staff', 'admin') and deactivated_at is not null
      returning id`,
    [req.params.id]
  )
  if (!row) return res.status(404).json({ error: 'Account not found, or already active.' })
  res.status(204).end()
})

/** Sends a fresh link, for someone who never set a password or lost theirs. */
adminRouter.post('/staff/:id/send-reset', async (req, res) => {
  const row = await one<{ id: string; email: string }>(
    `select id, email from users
      where id = $1 and role in ('staff', 'admin') and deactivated_at is null`,
    [req.params.id]
  )
  if (!row) return res.status(404).json({ error: 'Account not found.' })

  const token = await issueResetToken(row.id, STAFF_INVITE_TTL_MINUTES)
  try {
    await sendMail({
      to: row.email,
      ...resetEmail(`${env.publicUrl}/?reset=${token}`, STAFF_INVITE_TTL_MINUTES),
    })
  } catch (err) {
    console.error('failed to send staff reset', err)
    return res.status(502).json({ error: 'The account was found but the email could not be sent.' })
  }
  res.status(202).json({ message: `A reset link has been sent to ${row.email}.` })
})
