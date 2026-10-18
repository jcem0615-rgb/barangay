import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { toPesos } from '../serialize.ts'
import { liveAnnouncementsFor } from './announcements.ts'

/**
 * The barangay tier, resident side.
 *
 * A barangay certificate is the document most residents actually need in a
 * year, and it comes from an office two streets away rather than the municipal
 * hall. The two tiers are kept apart everywhere — different tables, different
 * roles, different screens — because the one thing that makes this confusing is
 * a resident having to work out which level of government owns what.
 *
 * **A resident's barangay is a fact about them, not a parameter.** Every request
 * is filed to the barangay on their own record; nothing in a request body can
 * name a different one.
 */

export const barangayRouter = Router()

/** Public: the sign-up screen needs the list before anybody has an account. */
export const barangayPublicRouter = Router()

/**
 * The hall as a resident needs it: who holds its two offices, where it is, when
 * it is open and what answers. Shared with the barangay's own console, so the
 * administrator edits exactly the fields residents read.
 */
export interface BarangayOfficeRow {
  captain: string | null
  secretary: string | null
  hall_address: string | null
  office_hours: string | null
  phone: string | null
  email: string | null
}

export function serializeBarangayOffice(row: BarangayOfficeRow) {
  return {
    captain: row.captain,
    secretary: row.secretary,
    hallAddress: row.hall_address,
    officeHours: row.office_hours,
    phone: row.phone,
    email: row.email,
  }
}

barangayPublicRouter.get('/', async (_req, res) => {
  const rows = await query<{ id: string; name: string; captain: string | null }>(
    `select id, name, captain from barangays order by name`
  )
  res.json(rows)
})

barangayPublicRouter.get('/certificates', async (_req, res) => {
  const rows = await query<{
    id: string; name: string; description: string; fee_centavos: number
    purpose_hint: string; steps: unknown[]; validity_days: number | null
  }>(
    // The shared catalogue only. This endpoint is public and barangay-less —
    // the guide and the sign-up screen read it before anybody has an account —
    // so a barangay's own documents, which only its residents can ask for, have
    // no business being listed here.
    `select id, name, description, fee_centavos, purpose_hint, steps, validity_days
       from barangay_certificate_types
      where active = true and barangay_id is null
      order by sort_order, name`
  )
  res.json(
    rows.map((r) => ({
      id: r.id, name: r.name, description: r.description,
      fee: toPesos(r.fee_centavos), purposeHint: r.purpose_hint, steps: r.steps,
      validityDays: r.validity_days,
    }))
  )
})

barangayRouter.use(authenticate, requireRole('resident'))

/**
 * The resident's own barangay, what it charges, and how to reach it.
 *
 * The hall's details are here rather than on the public list because this is
 * where they are needed: a resident told "come and collect it" has to know when
 * the hall is open and what to ring first. The public list is for the sign-up
 * screen, which only needs to know what the barangays are called.
 */
barangayRouter.get('/me', async (req, res) => {
  const row = await one<BarangayOfficeRow & { id: string; name: string }>(
    `select b.id, b.name, b.captain, b.secretary,
            b.hall_address, b.office_hours, b.phone, b.email
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [req.user!.id]
  )
  if (!row) return res.json({ barangay: null, certificates: [] })

  const types = await query<{
    id: string; name: string; description: string; fee_centavos: number
    purpose_hint: string; steps: unknown[]; validity_days: number | null
  }>(
    `select t.id, t.name, t.description, t.purpose_hint, t.steps, t.validity_days,
            coalesce(f.fee_centavos, t.fee_centavos) as fee_centavos
       from barangay_certificate_types t
       left join barangay_certificate_fees f on f.type_id = t.id and f.barangay_id = $1
      where t.active = true and (t.barangay_id is null or t.barangay_id = $1)
      order by t.sort_order, t.name`,
    [row.id]
  )
  res.json({
    barangay: { id: row.id, name: row.name, ...serializeBarangayOffice(row) },
    certificates: types.map((t) => ({
      id: t.id, name: t.name, description: t.description,
      fee: toPesos(t.fee_centavos), purposeHint: t.purpose_hint, steps: t.steps,
      validityDays: t.validity_days,
    })),
  })
})

/**
 * Which barangay the resident lives in.
 *
 * Theirs to set, unlike the municipality: the deployment decides the town, but
 * nobody but the resident knows which barangay they are in, and the barangay
 * verifies it at the counter the same way it always has.
 */
barangayRouter.put('/me', async (req, res) => {
  const parsed = z.object({ barangayId: z.string().max(60) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose your barangay.' })

  const exists = await one(`select 1 from barangays where id = $1`, [parsed.data.barangayId])
  if (!exists) return res.status(404).json({ error: 'That barangay is not in this municipality.' })

  await query(`update users set barangay_id = $2 where id = $1`, [req.user!.id, parsed.data.barangayId])
  res.json({ ok: true })
})

const requestSchema = z.object({
  typeId: z.string().max(60),
  purpose: z.string().min(3, 'Say what it is for.').max(300),
})

barangayRouter.post('/requests', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })

  const resident = await one<{ barangay_id: string | null }>(
    `select barangay_id from users where id = $1`,
    [req.user!.id]
  )
  if (!resident?.barangay_id) {
    return res.status(409).json({ error: 'Set which barangay you live in first.' })
  }

  // The fee is the barangay's, read here rather than taken from the body, and
  // frozen onto the request so a later change does not rewrite what somebody
  // was quoted.
  const type = await one<{ id: string; name: string; fee_centavos: number }>(
    `select t.id, t.name, coalesce(f.fee_centavos, t.fee_centavos) as fee_centavos
       from barangay_certificate_types t
       left join barangay_certificate_fees f on f.type_id = t.id and f.barangay_id = $2
      where t.id = $1 and t.active = true
        and (t.barangay_id is null or t.barangay_id = $2)`,
    [parsed.data.typeId, resident.barangay_id]
  )
  if (!type) return res.status(404).json({ error: 'That certificate is not issued here.' })

  const created = await transaction(async (client) => {
    const year = new Date().getFullYear()
    // One counter for the municipality, not one per barangay: a reference has to
    // identify a request on its own, and six barangays each issuing
    // BRGY-2026-00001 would make it identify six.
    const seq = await client.query<{ last_number: number }>(
      `insert into barangay_counters (year, last_number) values ($1, 1)
       on conflict (year)
       do update set last_number = barangay_counters.last_number + 1
       returning last_number`,
      [year]
    )
    const reference = `BRGY-${year}-${String(seq.rows[0]!.last_number).padStart(5, '0')}`

    const inserted = await client.query<{ id: string; reference_no: string; requested_at: string }>(
      `insert into barangay_requests
         (reference_no, barangay_id, resident_id, type_id, purpose, fee_centavos)
       values ($1, $2, $3, $4, $5, $6)
       returning id, reference_no, requested_at`,
      [reference, resident.barangay_id, req.user!.id, type.id, parsed.data.purpose, type.fee_centavos]
    )
    return inserted.rows[0]!
  })

  res.status(201).json({
    id: created.id,
    referenceNo: created.reference_no,
    requestedAt: created.requested_at,
    status: 'pending',
    typeName: type.name,
    fee: toPesos(type.fee_centavos),
  })
})

/**
 * The notices on this resident's own barangay board.
 *
 * Scoped to the barangay on their record rather than to one they could name: a
 * resident reads their own board, and the point of that is relevance rather
 * than secrecy — notices from two barangays away are the noise that teaches
 * people to stop reading.
 */
barangayRouter.get('/announcements', async (req, res) => {
  const row = await one<{ barangay_id: string | null }>(
    `select barangay_id from users where id = $1`,
    [req.user!.id]
  )
  if (!row?.barangay_id) return res.json([])
  res.json(await liveAnnouncementsFor(row.barangay_id))
})

barangayRouter.get('/requests', async (req, res) => {
  const rows = await query<{
    id: string; reference_no: string; type_id: string; type_name: string
    purpose: string; fee_centavos: number; status: string
    requested_at: string; updated_at: string; note: string | null; barangay_name: string
    valid_until: string | null; has_certificate: boolean
    revoked_at: Date | null; revoked_reason: string | null
  }>(
    `select r.id, r.reference_no, r.type_id, t.name as type_name, r.purpose,
            r.fee_centavos, r.status, r.requested_at, r.updated_at, r.note,
            r.valid_until, b.name as barangay_name,
            d.request_id is not null as has_certificate,
            d.verification_code as certificate_code,
            d.revoked_at, d.revoked_reason
       from barangay_requests r
       join barangay_certificate_types t on t.id = r.type_id
       join barangays b on b.id = r.barangay_id
       left join barangay_documents d on d.request_id = r.id
      where r.resident_id = $1
      order by r.requested_at desc
      limit 50`,
    [req.user!.id]
  )
  res.json(rows.map(serializeBarangayRequest))
})

/**
 * The released certificate, for the resident it was issued to.
 *
 * Ownership is part of the query rather than a check afterwards, so another
 * resident's certificate is simply not found — the same shape the municipal
 * document download has.
 */
barangayRouter.get('/requests/:id/certificate', async (req, res) => {
  const doc = await one<{ file_name: string; content: Buffer }>(
    `select d.file_name, d.content
       from barangay_documents d
       join barangay_requests r on r.id = d.request_id
      where d.request_id = $1 and r.resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!doc) {
    return res.status(404).json({
      error: 'No certificate yet. The barangay issues it when the certificate is released.',
    })
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`)
  res.send(doc.content)
})

/** The day the office is on, for comparing a date against today. */
function officeDay(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export function serializeBarangayRequest(row: {
  id: string; reference_no: string; type_id: string; type_name: string
  purpose: string; fee_centavos: number; status: string
  requested_at: string; updated_at: string; note: string | null
  barangay_name?: string; resident_name?: string
  valid_until?: string | Date | null
  has_certificate?: boolean
  certificate_code?: string | null
  revoked_at?: Date | string | null
  revoked_reason?: string | null
}) {
  // A date column comes back as a Date from pg; take the calendar day off it
  // rather than an ISO timestamp, which would shift it in another time zone.
  const validUntil =
    row.valid_until instanceof Date
      ? row.valid_until.toLocaleDateString('en-CA')
      : (row.valid_until ?? null)

  return {
    id: row.id,
    referenceNo: row.reference_no,
    typeId: row.type_id,
    typeName: row.type_name,
    purpose: row.purpose,
    fee: toPesos(row.fee_centavos),
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    note: row.note,
    barangayName: row.barangay_name,
    residentName: row.resident_name,
    validUntil,
    // Derived on read, like `expired` on a programme record and age in the
    // register: a stored flag is wrong the day after it is written, and the
    // whole point of saying this is to say it on the day it becomes true.
    expired: validUntil !== null && validUntil < officeDay(),
    // Whether there is a PDF to download. Only ever true once the barangay has
    // released it — the certificate is written in that transaction.
    hasCertificate: row.has_certificate ?? false,
    // The code printed on their own certificate. No new exposure — it is on the
    // paper they are holding — and it saves somebody at a counter from having
    // to open a PDF on a phone to read it out.
    certificateCode: row.certificate_code ?? null,
    // Withdrawn by the barangay after it was released. Shown to the resident
    // with the reason, because the paper in their hand still looks exactly as
    // valid as it did yesterday — that is the whole reason the code is what
    // proves a certificate rather than the page.
    revoked: row.revoked_at != null,
    revokedReason: row.revoked_reason ?? null,
  }
}

