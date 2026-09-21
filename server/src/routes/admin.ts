import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, requireRole } from '../auth.ts'
import { issueResetToken } from '../resetTokens.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'
import { isRealDate, looksDialable, recordAudit } from '../municipality.ts'
import { clearHolidayCache } from '../schedule.ts'
import { servedMunicipality } from '../identity.ts'

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

  // A clerk issued here works for this municipality; without the stamp their
  // account would be the one kind that signs in anywhere.
  const municipality = await servedMunicipality()

  const created = await transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into users (email, password_hash, role, full_name, municipality_code)
       values ($1, $2, $3, $4, $5) returning id`,
      [body.email, placeholder, body.role, body.fullName, municipality.code]
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

// ---------------------------------------------------------------------------
// The municipality's own data
//
// Hotlines, the holiday calendar and each office's contact details were seeded
// and then unreachable — correcting a wrong number meant editing the source and
// reseeding. Everything below is admin-only and audited: `recordAudit` runs in
// the same transaction as the change, so the log cannot be missing an entry for
// something that happened.
// ---------------------------------------------------------------------------

const phone = z.string().trim().min(1).max(40).refine(looksDialable, {
  message: 'That does not look like a number a resident could dial.',
})

const hotlineBody = z.object({
  label: z.string().trim().min(1).max(60),
  agency: z.string().trim().min(1).max(120),
  phone,
  isNational: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

const HOTLINE_SELECT = `id, label, agency, phone, is_national as "isNational", sort_order as "sortOrder"`

adminRouter.get('/hotlines', async (_req, res) => {
  res.json(
    await query(
      `select ${HOTLINE_SELECT} from emergency_contacts order by is_national, sort_order, label`
    )
  )
})

adminRouter.post('/hotlines', async (req, res) => {
  const parsed = hotlineBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the hotline details.' })
  }
  const { label, agency, phone: number, isNational, sortOrder } = parsed.data
  const actor = req.user!
  // Slugged from the label so the id reads as something in the audit log, with
  // a short random tail because two offices may both be called "Police".
  const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hotline'}-${randomBytes(3).toString('hex')}`

  const created = await transaction(async (client) => {
    const { rows } = await client.query(
      `insert into emergency_contacts (id, label, agency, phone, is_national, sort_order)
       values ($1, $2, $3, $4, $5, $6) returning ${HOTLINE_SELECT}`,
      [id, label, agency, number, isNational, sortOrder ?? 0]
    )
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: 'hotline.create', target: id, after: rows[0],
    })
    return rows[0]
  })
  res.status(201).json(created)
})

adminRouter.put('/hotlines/:id', async (req, res) => {
  const parsed = hotlineBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the hotline details.' })
  }
  const { label, agency, phone: number, isNational, sortOrder } = parsed.data
  const actor = req.user!

  const updated = await transaction(async (client) => {
    // Locked and read first: the old value is the point of the log.
    const existing = await client.query(
      `select ${HOTLINE_SELECT} from emergency_contacts where id = $1 for update`,
      [req.params.id]
    )
    if (existing.rowCount === 0) return null
    const { rows } = await client.query(
      `update emergency_contacts
          set label = $2, agency = $3, phone = $4, is_national = $5, sort_order = $6
        where id = $1 returning ${HOTLINE_SELECT}`,
      [req.params.id, label, agency, number, isNational, sortOrder ?? existing.rows[0].sortOrder]
    )
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: 'hotline.update', target: req.params.id,
      before: existing.rows[0], after: rows[0],
    })
    return rows[0]
  })
  if (!updated) return res.status(404).json({ error: 'Hotline not found.' })
  res.json(updated)
})

adminRouter.delete('/hotlines/:id', async (req, res) => {
  const actor = req.user!
  const removed = await transaction(async (client) => {
    const existing = await client.query(
      `select ${HOTLINE_SELECT} from emergency_contacts where id = $1 for update`,
      [req.params.id]
    )
    if (existing.rowCount === 0) return false
    await client.query(`delete from emergency_contacts where id = $1`, [req.params.id])
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: 'hotline.delete', target: req.params.id, before: existing.rows[0],
    })
    return true
  })
  if (!removed) return res.status(404).json({ error: 'Hotline not found.' })
  res.status(204).end()
})

const holidayBody = z.object({
  date: z.string().refine(isRealDate, { message: 'That is not a real date.' }),
  name: z.string().trim().min(1).max(120),
  isLocal: z.boolean(),
})

adminRouter.get('/holidays', async (req, res) => {
  // Defaults to the calendar from the start of this year: an admin checking
  // against the year's proclamation wants the whole year, not what is left.
  const year = Number(req.query.year) || new Date().getUTCFullYear()
  if (year < 2000 || year > 2100) return res.status(400).json({ error: 'Pick a year between 2000 and 2100.' })
  res.json(
    await query(
      `select observed_on::text as date, name, is_local as "isLocal"
         from holidays
        where extract(year from observed_on) = $1
        order by observed_on`,
      [year]
    )
  )
})

adminRouter.post('/holidays', async (req, res) => {
  const parsed = holidayBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the holiday.' })
  }
  const { date, name, isLocal } = parsed.data
  const actor = req.user!

  const saved = await transaction(async (client) => {
    const existing = await client.query(
      `select observed_on::text as date, name, is_local as "isLocal"
         from holidays where observed_on = $1 for update`,
      [date]
    )
    // Upsert rather than reject: a proclamation moving a holiday's name or
    // making it local is the ordinary case, and an admin should not have to
    // delete a row to correct one.
    const { rows } = await client.query(
      `insert into holidays (observed_on, name, is_local) values ($1, $2, $3)
       on conflict (observed_on) do update set name = excluded.name, is_local = excluded.is_local
       returning observed_on::text as date, name, is_local as "isLocal"`,
      [date, name, isLocal]
    )
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: existing.rowCount === 0 ? 'holiday.create' : 'holiday.update',
      target: date,
      before: existing.rows[0], after: rows[0],
    })
    return rows[0]
  })
  // Every ready date is computed over this calendar behind a ten-minute cache.
  // Without this an administrator declares a holiday, watches nothing move, and
  // reasonably concludes it did not save.
  clearHolidayCache()
  res.status(201).json(saved)
})

adminRouter.delete('/holidays/:date', async (req, res) => {
  if (!isRealDate(req.params.date)) return res.status(400).json({ error: 'That is not a real date.' })
  const actor = req.user!
  const removed = await transaction(async (client) => {
    const existing = await client.query(
      `select observed_on::text as date, name, is_local as "isLocal"
         from holidays where observed_on = $1 for update`,
      [req.params.date]
    )
    if (existing.rowCount === 0) return false
    await client.query(`delete from holidays where observed_on = $1`, [req.params.date])
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: 'holiday.delete', target: req.params.date, before: existing.rows[0],
    })
    return true
  })
  if (!removed) return res.status(404).json({ error: 'That day is not in the calendar.' })
  clearHolidayCache()
  res.status(204).end()
})

// Contact details only. What an office *is* — its name, its services, its fees —
// is the service catalogue, and changing that is a change to what the
// municipality offers, not a correction to how to reach it.
const officeBody = z.object({
  address: z.string().trim().max(200).nullable(),
  hours: z.string().trim().max(120).nullable(),
  phone: z.union([phone, z.null()]),
  email: z.union([z.email().max(160), z.null()]),
})

const OFFICE_SELECT = `id, name, office_name as "officeName", address, hours, phone, email`

adminRouter.get('/offices', async (_req, res) => {
  res.json(await query(`select ${OFFICE_SELECT} from departments order by sort_order, name`))
})

adminRouter.patch('/offices/:id', async (req, res) => {
  const parsed = officeBody.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the office details.' })
  }
  const patch = parsed.data
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to change.' })
  const actor = req.user!

  const updated = await transaction(async (client) => {
    const existing = await client.query(
      `select ${OFFICE_SELECT} from departments where id = $1 for update`,
      [req.params.id]
    )
    if (existing.rowCount === 0) return null
    const merged = { ...existing.rows[0], ...patch }
    const { rows } = await client.query(
      `update departments set address = $2, hours = $3, phone = $4, email = $5
        where id = $1 returning ${OFFICE_SELECT}`,
      [req.params.id, merged.address, merged.hours, merged.phone, merged.email]
    )
    await recordAudit(client, {
      actorId: actor.id, actorName: actor.fullName,
      action: 'office.update', target: req.params.id,
      before: existing.rows[0], after: rows[0],
    })
    return rows[0]
  })
  if (!updated) return res.status(404).json({ error: 'Office not found.' })
  res.json(updated)
})

/** The trail, newest first. Read-only — nothing in the app writes here twice. */
adminRouter.get('/audit', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  res.json(
    await query(
      `select id, actor_name as "actorName", action, target, before, after,
              created_at as "createdAt"
         from admin_audit order by created_at desc, id desc limit $1`,
      [limit]
    )
  )
})
