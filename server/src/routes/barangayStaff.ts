import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { toCentavos, toPesos } from '../serialize.ts'
import { deliverNotification, recordNotification } from '../notifications.ts'
import { serializeBarangayRequest } from './barangay.ts'
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
  return one<{ id: string; name: string; captain: string | null; secretary: string | null }>(
    `select b.id, b.name, b.captain, b.secretary
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
  res.json({ barangay, role: req.user!.role })
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
    requested_at: string; updated_at: string; note: string | null; resident_name: string
  }>(
    `select r.id, r.reference_no, r.type_id, t.name as type_name, r.purpose,
            r.fee_centavos, r.status, r.requested_at, r.updated_at, r.note,
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

    await client.query(
      `update barangay_requests
          set status = $2, note = coalesce($3, note), handled_by = $4, updated_at = now()
        where id = $1`,
      [row.id, status, note ?? null, req.user!.id]
    )

    const title =
      status === 'rejected'
        ? `${row.reference_no} — not issued`
        : status === 'ready'
          ? `${row.reference_no} — ready for pickup`
          : `${row.reference_no} — ${status}`
    const body =
      status === 'ready'
        ? `Your certificate is ready at Barangay ${barangay.name}. Bring a valid ID.`
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

/** Who works here. Officers are issued, never self-registered. */
barangayStaffRouter.get('/officers', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  const rows = await query<{ id: string; full_name: string; email: string; role: string; deactivated_at: string | null }>(
    `select id, full_name, email, role, deactivated_at
       from users
      where barangay_id = $1 and role in ('barangay_admin', 'barangay_officer')
      order by role, full_name`,
    [barangay.id]
  )
  res.json(
    rows.map((r) => ({
      id: r.id, fullName: r.full_name, email: r.email, role: r.role, active: r.deactivated_at === null,
    }))
  )
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
