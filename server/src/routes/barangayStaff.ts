import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, requireRole } from '../auth.ts'
import { issueResetToken } from '../resetTokens.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'
import { servedMunicipality } from '../identity.ts'
import { toCentavos, toPesos } from '../serialize.ts'
import { deliverNotification, recordNotification } from '../notifications.ts'
import { serializeBarangayRequest, serializeBarangayOffice, type BarangayOfficeRow } from './barangay.ts'
import { looksDialable, recordAudit } from '../municipality.ts'
import { blotterRouter } from './blotter.ts'
import { householdsRouter } from './households.ts'
import { announcementsStaffRouter } from './announcements.ts'

/**
 * The barangay's own portal: the officer who processes certificates, and the
 * administrator who also sets the fees and issues officer accounts.
 *
 * **Isolation is the whole security property here**, and it is not a filter the
 * caller passes. Every query is scoped to the barangay on the signed-in
 * account's own row, so a request naming another barangay does not return an
 * empty list — there is nowhere to name one.
 */

export const barangayStaffRouter = Router()
barangayStaffRouter.use(authenticate, requireRole('barangay_admin', 'barangay_officer'))

/** The barangay this account works for. Null is a misconfigured account. */
async function ownBarangay(userId: string) {
  return one<{
    id: string; name: string; captain: string | null; secretary: string | null
    office_hours: string | null; phone: string | null
  }>(
    `select b.id, b.name, b.captain, b.secretary, b.office_hours, b.phone
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [userId]
  )
}

// The blotter hangs off this router rather than beside it, so it inherits the
// authentication, the two roles and — the part that matters — the habit of
// taking the barangay from the account rather than from the caller.
barangayStaffRouter.use('/blotter', blotterRouter)
barangayStaffRouter.use('/households', householdsRouter)
barangayStaffRouter.use('/announcements', announcementsStaffRouter)

barangayStaffRouter.get('/me', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) {
    return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  }
  // Named fields rather than the row, so the office columns `ownBarangay` now
  // carries for the notification do not leak out of here in their database
  // spelling. `/office` below is where they are published.
  res.json({
    barangay: {
      id: barangay.id, name: barangay.name,
      captain: barangay.captain, secretary: barangay.secretary,
    },
    role: req.user!.role,
  })
})

// -------------------------------------------------- the hall's own details

/**
 * What a resident is told about this barangay: who holds its two offices, where
 * the hall is, when it is open and what answers.
 *
 * Both roles read it — an officer who cannot see the hours cannot check what a
 * resident is being shown — and only the administrator changes it.
 */
barangayStaffRouter.get('/office', async (req, res) => {
  const row = await one<BarangayOfficeRow & { id: string; name: string }>(
    `select b.id, b.name, b.captain, b.secretary,
            b.hall_address, b.office_hours, b.phone, b.email
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [req.user!.id]
  )
  if (!row) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  res.json({ id: row.id, name: row.name, ...serializeBarangayOffice(row) })
})

/**
 * Correcting them.
 *
 * **The barangay's name is not in here**, and that is the same rule that stops a
 * browser naming the municipality: what a place is called belongs to the
 * register. What the barangay may correct is who holds its offices and how to
 * reach it — facts it knows and the municipal hall cannot maintain for
 * seventy-three barangays, and which change at every barangay election.
 *
 * The schema is strict, so an unknown key refuses the whole request rather than
 * quietly saving something different — the municipal office rule, one tier down.
 * Phone validation is the same deliberately loose check: it rules out the
 * unusable and leaves the rest to somebody ringing it.
 *
 * Audited in the same transaction as the change, with the row as it was. An
 * administrator can point the hall's number anywhere, and the only defence
 * against a mistake nobody notices is a record that still has the old one.
 */
const officeSchema = z.strictObject({
  captain: z.string().max(120).nullable().optional(),
  secretary: z.string().max(120).nullable().optional(),
  hallAddress: z.string().max(300).nullable().optional(),
  officeHours: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  // An empty string clears it, the same as null — every other field here reads
  // blank as "not stated", and an email that refused the one way a form sends
  // "I have removed this" would be the odd one out. A non-empty value still has
  // to look like an address.
  email: z.union([z.literal(''), z.email().max(160)]).nullable().optional(),
})

barangayStaffRouter.patch('/office', requireRole('barangay_admin'), async (req, res) => {
  const parsed = officeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data
  if (Object.keys(body).length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  if (body.phone && !looksDialable(body.phone)) {
    return res.status(400).json({ error: 'That phone number is not dialable. Ring it before saving it.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const blank = (value: string | null | undefined) =>
    value === undefined ? undefined : value === null || value.trim() === '' ? null : value.trim()

  const updated = await transaction(async (client) => {
    const current = await client.query<BarangayOfficeRow & { id: string; name: string }>(
      `select id, name, captain, secretary, hall_address, office_hours, phone, email
         from barangays where id = $1 for update`,
      [barangay.id]
    )
    const before = current.rows[0]!

    const after = await client.query<BarangayOfficeRow & { id: string; name: string }>(
      `update barangays
          set captain      = case when $2 then $3 else captain end,
              secretary    = case when $4 then $5 else secretary end,
              hall_address = case when $6 then $7 else hall_address end,
              office_hours = case when $8 then $9 else office_hours end,
              phone        = case when $10 then $11 else phone end,
              email        = case when $12 then $13 else email end
        where id = $1
        returning id, name, captain, secretary, hall_address, office_hours, phone, email`,
      [
        barangay.id,
        'captain' in body, blank(body.captain) ?? null,
        'secretary' in body, blank(body.secretary) ?? null,
        'hallAddress' in body, blank(body.hallAddress) ?? null,
        'officeHours' in body, blank(body.officeHours) ?? null,
        'phone' in body, blank(body.phone) ?? null,
        'email' in body, blank(body.email) ?? null,
      ]
    )

    await recordAudit(client, {
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'barangay_office.update',
      target: barangay.id,
      before: serializeBarangayOffice(before),
      after: serializeBarangayOffice(after.rows[0]!),
    })
    return after.rows[0]!
  })

  res.json({ id: updated.id, name: updated.name, ...serializeBarangayOffice(updated) })
})

const queueSchema = z.object({
  status: z.enum(['pending', 'processing', 'ready', 'released', 'rejected']).optional(),
})

barangayStaffRouter.get('/requests', async (req, res) => {
  const parsed = queueSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Unknown status filter.' })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<{
    id: string; reference_no: string; type_id: string; type_name: string
    purpose: string; fee_centavos: number; status: string
    valid_until: string | null
    requested_at: string; updated_at: string; note: string | null; resident_name: string
  }>(
    `select r.id, r.reference_no, r.type_id, t.name as type_name, r.purpose,
            r.fee_centavos, r.status, r.requested_at, r.updated_at, r.note,
            r.valid_until,
            u.full_name as resident_name
       from barangay_requests r
       join barangay_certificate_types t on t.id = r.type_id
       join users u on u.id = r.resident_id
      where r.barangay_id = $1
        and ($2::text is null or r.status = $2::barangay_request_status)
      -- Open ones first, oldest first within them: the queue reads as the order
      -- somebody should work it.
      order by (r.status in ('pending', 'processing', 'ready')) desc, r.requested_at asc
      limit 200`,
    [barangay.id, parsed.data.status ?? null]
  )
  res.json(rows.map(serializeBarangayRequest))
})

/**
 * Moving a request along.
 *
 * The order is fixed — pending, processing, ready, released — because each step
 * means something at the counter: ready is "come and collect it", and a resident
 * told that before the certificate is printed makes a wasted trip. Rejection can
 * happen from anywhere, and needs a reason the resident can read.
 */
const NEXT: Record<string, string[]> = {
  pending: ['processing', 'rejected'],
  processing: ['ready', 'rejected'],
  ready: ['released', 'rejected'],
  released: [],
  rejected: [],
}

const advanceSchema = z.object({
  status: z.enum(['processing', 'ready', 'released', 'rejected']),
  note: z.string().max(1000).optional(),
})

barangayStaffRouter.patch('/requests/:id', async (req, res) => {
  const parsed = advanceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose what to set it to.' })
  const { status, note } = parsed.data

  if (status === 'rejected' && !note?.trim()) {
    return res.status(400).json({ error: 'Give a reason the resident can read.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await transaction(async (client) => {
    // Scoped to this barangay in the same statement that locks the row, so
    // another barangay's request is not found rather than refused.
    const current = await client.query<{ id: string; status: string; reference_no: string; resident_id: string; type_id: string }>(
      `select id, status, reference_no, resident_id, type_id
         from barangay_requests where id = $1 and barangay_id = $2 for update`,
      [req.params.id, barangay.id]
    )
    const row = current.rows[0]
    if (!row) return { error: 'notfound' as const }
    if (!NEXT[row.status]?.includes(status)) {
      return { error: 'order' as const, from: row.status }
    }

    /**
     * How long the certificate is honoured, stamped on the move to `ready`.
     *
     * `ready` is the point at which the secretary has prepared and dated the
     * paper, so dating it from here is what the document itself says. Dating it
     * from collection would have the app promise more validity than the
     * certificate carries, and a resident acting on that makes the wasted trip
     * this whole tier exists to prevent.
     *
     * Read off the type here and frozen onto the row, like the fee: changing a
     * type's validity must never rewrite what an issued certificate says.
     */
    const validity =
      status === 'ready'
        ? (
            await client.query<{ validity_days: number | null }>(
              `select validity_days from barangay_certificate_types where id = $1`,
              [row.type_id]
            )
          ).rows[0]?.validity_days ?? null
        : null

    await client.query(
      `update barangay_requests
          set status = $2, note = coalesce($3, note), handled_by = $4, updated_at = now(),
              valid_until = case
                when $5::integer is null then valid_until
                else (now() at time zone 'Asia/Manila')::date + $5::integer
              end
        where id = $1`,
      [row.id, status, note ?? null, req.user!.id, validity]
    )

    const title =
      status === 'rejected'
        ? `${row.reference_no} — not issued`
        : status === 'ready'
          ? `${row.reference_no} — ready for pickup`
          : `${row.reference_no} — ${status}`
    // "Ready" is the only status that asks the resident to travel, so it is the
    // one that carries the hall's hours. Telling somebody to come and collect
    // something without saying when the office is open is how the trip gets
    // wasted twice.
    const body =
      status === 'ready'
        ? `Your certificate is ready at Barangay ${barangay.name}. Bring a valid ID.` +
          (barangay.office_hours ? ` Open ${barangay.office_hours}.` : '')
        : note?.trim()
          ? note.trim()
          : `Your barangay certificate request is now ${status}.`

    const notification = {
      userId: row.resident_id,
      requestId: null,
      kind: 'barangay_request' as const,
      title,
      body,
    }
    await recordNotification(client, notification)
    return { notification }
  })

  if ('error' in updated && updated.error === 'notfound') {
    return res.status(404).json({ error: 'Request not found.' })
  }
  if ('error' in updated && updated.error === 'order') {
    return res.status(409).json({
      error: `A request that is ${updated.from} cannot be set to ${status}.`,
    })
  }

  if ('notification' in updated && updated.notification) {
    void deliverNotification(updated.notification).catch(() => undefined)
  }
  res.json({ ok: true })
})

// ------------------------------------------------------- administrator only

/**
 * The fees as this barangay currently has them — its own overrides where it set
 * one, the catalogue default where it did not. Read from the same expression the
 * resident's screen uses, so the figure an administrator is editing is the figure
 * residents are being quoted.
 */
barangayStaffRouter.get('/fees', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  const rows = await query<{ id: string; name: string; fee_centavos: number }>(
    `select t.id, t.name, coalesce(f.fee_centavos, t.fee_centavos) as fee_centavos
       from barangay_certificate_types t
       left join barangay_certificate_fees f on f.type_id = t.id and f.barangay_id = $1
      where t.active = true
      order by t.sort_order, t.name`,
    [barangay.id]
  )
  res.json(rows.map((r) => ({ id: r.id, name: r.name, fee: toPesos(r.fee_centavos) })))
})

/**
 * The fee this barangay charges. The only part of the certificate catalogue a
 * barangay may change: what a clearance *is* does not vary between barangays,
 * and letting six offices each invent their own would make a resident's
 * certificate depend on which street they live on.
 */
barangayStaffRouter.put('/fees/:typeId', requireRole('barangay_admin'), async (req, res) => {
  const parsed = z.object({ fee: z.number().min(0).max(10000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Give a fee in pesos, 0 or more.' })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const type = await one(`select 1 from barangay_certificate_types where id = $1`, [req.params.typeId])
  if (!type) return res.status(404).json({ error: 'No such certificate.' })

  await query(
    `insert into barangay_certificate_fees (barangay_id, type_id, fee_centavos)
     values ($1, $2, $3)
     on conflict (barangay_id, type_id) do update set fee_centavos = excluded.fee_centavos`,
    [barangay.id, req.params.typeId, toCentavos(parsed.data.fee)]
  )
  res.json({ ok: true, fee: parsed.data.fee })
})

// ------------------------------------------------- who may sign in for us
//
// The barangay issues its own officer and kagawad accounts. It cannot issue an
// administrator, and that single exception is what keeps this from being a way
// to manufacture authority: making an administrator stays a municipal act, so a
// barangay cannot mint its own, and a captain who has been revoked cannot have
// left one behind. Everything else here follows the rule the rest of this
// console follows — the barangay comes off the signed-in account's own row, so
// another barangay's account is not found rather than refused.

const INVITE_TTL_MINUTES = 7 * 24 * 60 // a week, like the municipal invitation

/** The roles a barangay administrator may create. Never `barangay_admin`. */
const ISSUABLE = ['barangay_officer', 'barangay_kagawad'] as const

const OFFICER_ROLES = ['barangay_admin', 'barangay_officer', 'barangay_kagawad']

/** Who works here, and who sits on the council. */
barangayStaffRouter.get('/officers', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  const rows = await query<{ id: string; full_name: string; email: string; role: string; deactivated_at: string | null }>(
    `select id, full_name, email, role, deactivated_at
       from users
      where barangay_id = $1 and role = any($2::user_role[])
      order by role, full_name`,
    [barangay.id, OFFICER_ROLES]
  )
  res.json(
    rows.map((r) => ({
      id: r.id, fullName: r.full_name, email: r.email, role: r.role, active: r.deactivated_at === null,
    }))
  )
})

const issueSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2).max(120),
  role: z.enum(ISSUABLE),
})

/**
 * Issuing one.
 *
 * The administrator never sets or sees a password: the row starts with an
 * unusable random one and the person chooses their own through the ordinary
 * reset flow, exactly as a municipal account does. The barangay and the
 * municipality are both stamped from the server — a barangay account without
 * the first answers 409 to everything in its own console, and one without the
 * second is the single kind of account that signs in anywhere.
 */
barangayStaffRouter.post('/officers', requireRole('barangay_admin'), async (req, res) => {
  const parsed = issueSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const existing = await one(`select 1 from users where lower(email) = lower($1)`, [body.email])
  if (existing) return res.status(409).json({ error: 'That email already has an account.' })

  const placeholder = await hashPassword(randomBytes(32).toString('base64url'))
  const municipality = await servedMunicipality()

  const created = await one<{ id: string }>(
    `insert into users (email, password_hash, role, full_name, municipality_code, barangay_id)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [body.email, placeholder, body.role, body.fullName, municipality.code, barangay.id]
  )

  const token = await issueResetToken(created!.id, INVITE_TTL_MINUTES)
  let invited = true
  try {
    await sendMail({
      to: body.email,
      ...resetEmail(`${env.publicUrl}/?reset=${token}`, INVITE_TTL_MINUTES),
    })
  } catch (err) {
    console.error('failed to send barangay invitation', err)
    invited = false
  }

  // invited:false tells the captain to follow up rather than assume it arrived
  // — the same honesty the municipal screen shows.
  res.status(201).json({
    id: created!.id, fullName: body.fullName, email: body.email,
    role: body.role, active: true, invited,
  })
})

/**
 * Finds one of this barangay's own issuable accounts.
 *
 * Scoped to the barangay *and* to the two roles a barangay may issue, in the
 * same statement. An administrator's row is therefore not found rather than
 * refused: a captain cannot revoke the secretary and a secretary cannot revoke
 * the captain, because neither is reachable from here at all.
 */
async function issuableAccount(barangayId: string, id: unknown) {
  return one<{ id: string; email: string; deactivated_at: string | null }>(
    `select id, email, deactivated_at from users
      where id = $1 and barangay_id = $2 and role = any($3::user_role[])`,
    [id, barangayId, ISSUABLE]
  )
}

/** Revoking access without deleting the person — their name stays on their work. */
barangayStaffRouter.post('/officers/:id/deactivate', requireRole('barangay_admin'), async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(409).json({ error: 'You cannot revoke your own account.' })
  }
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const row = await issuableAccount(barangay.id, req.params.id)
  if (!row || row.deactivated_at) {
    return res.status(404).json({ error: 'Account not found, or already revoked.' })
  }
  await query(`update users set deactivated_at = now() where id = $1`, [row.id])
  // An outstanding invitation is a way back in, so revoking spends it.
  await query(
    `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
    [row.id]
  )
  res.status(204).end()
})

barangayStaffRouter.post('/officers/:id/reactivate', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const row = await issuableAccount(barangay.id, req.params.id)
  if (!row || !row.deactivated_at) {
    return res.status(404).json({ error: 'Account not found, or already active.' })
  }
  await query(`update users set deactivated_at = null where id = $1`, [row.id])
  res.status(204).end()
})

/** A fresh link, for somebody who never set a password or lost theirs. */
barangayStaffRouter.post('/officers/:id/send-reset', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const row = await issuableAccount(barangay.id, req.params.id)
  if (!row || row.deactivated_at) return res.status(404).json({ error: 'Account not found.' })

  const token = await issueResetToken(row.id, INVITE_TTL_MINUTES)
  try {
    await sendMail({
      to: row.email,
      ...resetEmail(`${env.publicUrl}/?reset=${token}`, INVITE_TTL_MINUTES),
    })
  } catch (err) {
    console.error('failed to send barangay invitation', err)
    return res.json({ sent: false })
  }
  res.json({ sent: true })
})

/** A simple count of what the barangay has done, for the captain. */
barangayStaffRouter.get('/summary', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<{ status: string; count: string; fees: string }>(
    `select status, count(*) as count, coalesce(sum(fee_centavos), 0) as fees
       from barangay_requests where barangay_id = $1 group by status`,
    [barangay.id]
  )
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]))
  const released = rows.find((r) => r.status === 'released')
  res.json({
    barangay: barangay.name,
    counts: {
      pending: byStatus.pending ?? 0,
      processing: byStatus.processing ?? 0,
      ready: byStatus.ready ?? 0,
      released: byStatus.released ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
    // Only what was actually released: a fee on a pending request is not money
    // the barangay has.
    collected: toPesos(Number(released?.fees ?? 0)),
  })
})
