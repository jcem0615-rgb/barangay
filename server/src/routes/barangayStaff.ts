import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, hashPassword, requireRole } from '../auth.ts'
import { issueResetToken } from '../resetTokens.ts'
import { resetEmail, sendMail } from '../mailer.ts'
import { env } from '../env.ts'
import { servedMunicipality } from '../identity.ts'
import {
  certificateCreateSchema, certificateEditSchema, createCertificateType,
  serializeCertificateType, updateCertificateType, withdrawCertificateType,
  type CertificateRow,
} from '../certificates.ts'
import { toCentavos, toPesos } from '../serialize.ts'
import { deliverNotification, recordNotification } from '../notifications.ts'
import { serializeBarangayRequest, serializeBarangayOffice, type BarangayOfficeRow } from './barangay.ts'
import { looksDialable, recordAudit } from '../municipality.ts'
import {
  issueBarangayCertificate, loadBarangaySeal,
} from '../barangayDocuments.ts'
import { getFile, putFile, removeFile } from '../storage.ts'
import { detectType, MAX_SEAL_BYTES, SEAL_DESCRIPTION, SEAL_TYPES } from '../uploads.ts'
import { scanBuffer } from '../antivirus.ts'
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
    hall_address: string | null; email: string | null
  }>(
    // The hall's address and email ride along because a released certificate
    // prints them, and this is already the one query that establishes which
    // barangay the signed-in account belongs to.
    `select b.id, b.name, b.captain, b.secretary, b.office_hours, b.phone,
            b.hall_address, b.email
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
  const row = await one<BarangayOfficeRow & {
    id: string; name: string; seal_key: string | null; seal_updated_at: Date | null
  }>(
    `select b.id, b.name, b.captain, b.secretary,
            b.hall_address, b.office_hours, b.phone, b.email,
            b.seal_key, b.seal_updated_at
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [req.user!.id]
  )
  if (!row) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  res.json({
    id: row.id, name: row.name, ...serializeBarangayOffice(row),
    hasSeal: row.seal_key !== null,
    sealUpdatedAt: row.seal_updated_at?.toISOString() ?? null,
  })
})

// ---------------------------------------------------------------------------
// The barangay's seal, and the certificates it has issued
//
// A certificate without the barangay's own seal reads as unofficial, and no
// seed can guess what it looks like. Same store and the same narrow type set as
// the municipal seal: PNG and JPEG only, because those are the two the PDF
// writer embeds, and a seal that cannot be drawn would be accepted, previewed,
// and then silently missing from every certificate.
//
// The administrator uploads it, both roles see it, and the API refuses the
// officer's write regardless — the line the rest of this console already draws.
// ---------------------------------------------------------------------------

const sealUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SEAL_BYTES, files: 1 },
})

barangayStaffRouter.put(
  '/office/seal',
  requireRole('barangay_admin'),
  sealUpload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' })

    const detected = detectType(req.file.buffer)
    if (!detected || !SEAL_TYPES.has(detected.contentType)) {
      return res.status(415).json({
        error: `A seal has to be a ${SEAL_DESCRIPTION} image — those are the two a certificate can be printed with.`,
      })
    }

    const scan = await scanBuffer(req.file.buffer)
    if (scan.status === 'infected') {
      console.warn(`rejected barangay seal from ${req.user!.id}: ${scan.signature}`)
      return res.status(422).json({ error: 'That file was rejected by our virus scan.' })
    }
    if (scan.status === 'unavailable') {
      console.error(`virus scan unavailable: ${scan.reason}`)
      return res.status(503).json({ error: "We can't check files for viruses right now. Please try again shortly." })
    }

    const barangay = await ownBarangay(req.user!.id)
    if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

    const stored = await putFile(req.file.buffer)
    const previous = await transaction(async (client) => {
      const existing = await client.query<{ seal_key: string | null }>(
        `select seal_key from barangays where id = $1 for update`, [barangay.id]
      )
      await client.query(
        `update barangays set seal_key = $2, seal_type = $3, seal_updated_at = now()
          where id = $1`,
        [barangay.id, stored.storageKey, detected.contentType]
      )
      await recordAudit(client, {
        actorId: req.user!.id, actorName: req.user!.fullName,
        action: 'barangay_seal.update', target: barangay.id,
        before: { hasSeal: existing.rows[0]?.seal_key !== null },
        after: { hasSeal: true },
      })
      return existing.rows[0]?.seal_key ?? null
    })

    // Only once the new one is recorded, so a failed write cannot leave the
    // barangay with no seal at all.
    if (previous) await removeFile(previous)
    res.json({ hasSeal: true })
  }
)

/** The preview in the console. Both roles, like the rest of the hall's details. */
barangayStaffRouter.get('/office/seal', async (req, res) => {
  const row = await one<{ seal_key: string | null; seal_type: string | null }>(
    `select b.seal_key, b.seal_type
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [req.user!.id]
  )
  if (!row?.seal_key) return res.status(404).json({ error: 'No seal has been uploaded.' })

  let content: Buffer
  try {
    content = await getFile(row.seal_key)
  } catch {
    return res.status(410).json({ error: 'That image is no longer available.' })
  }
  res.setHeader('Content-Type', row.seal_type ?? 'image/png')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(content)
})

barangayStaffRouter.delete('/office/seal', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const removed = await transaction(async (client) => {
    const existing = await client.query<{ seal_key: string | null }>(
      `select seal_key from barangays where id = $1 for update`, [barangay.id]
    )
    const key = existing.rows[0]?.seal_key ?? null
    if (!key) return null
    await client.query(
      `update barangays set seal_key = null, seal_type = null, seal_updated_at = null
        where id = $1`,
      [barangay.id]
    )
    await recordAudit(client, {
      actorId: req.user!.id, actorName: req.user!.fullName,
      action: 'barangay_seal.remove', target: barangay.id,
      before: { hasSeal: true }, after: { hasSeal: false },
    })
    return key
  })
  if (!removed) return res.status(404).json({ error: 'No seal has been uploaded.' })

  // Certificates already issued keep theirs: the seal was drawn into the PDF
  // when it was rendered, which is why a released certificate is stored rather
  // than re-rendered on demand.
  await removeFile(removed)
  res.status(204).end()
})

/**
 * A copy of a certificate this barangay issued.
 *
 * Scoped through `barangay_documents.barangay_id` in the same statement, so
 * another barangay's certificate is not found rather than refused — there is
 * nowhere to name one. Both roles, because reprinting for a resident who lost
 * theirs is counter work rather than a decision.
 */
barangayStaffRouter.get('/requests/:id/certificate', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const doc = await one<{ file_name: string; content: Buffer }>(
    `select file_name, content from barangay_documents
      where request_id = $1 and barangay_id = $2`,
    [req.params.id, barangay.id]
  )
  if (!doc) return res.status(404).json({ error: 'No certificate has been released for this request.' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`)
  res.send(doc.content)
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

  // Read before the transaction: fetching the seal is file I/O, and holding a
  // transaction open across it would make a slow disk into a lock on the
  // barangay's queue. Neither depends on the release succeeding.
  const sealSource = status === 'released'
    ? await loadBarangaySeal(barangay.id)
    : { seal: null, sealType: null }
  const town = await servedMunicipality()

  const updated = await transaction(async (client) => {
    // Scoped to this barangay in the same statement that locks the row, so
    // another barangay's request is not found rather than refused.
    const current = await client.query<{
      id: string; status: string; reference_no: string; resident_id: string; type_id: string
      purpose: string; fee_centavos: number; valid_until: Date | string | null
      type_name: string; attestation: string | null
      resident_name: string; resident_address: string | null
    }>(
      `select r.id, r.status, r.reference_no, r.resident_id, r.type_id, r.purpose,
              r.fee_centavos, r.valid_until, t.name as type_name, t.attestation,
              u.full_name as resident_name, rp.address as resident_address
         from barangay_requests r
         join barangay_certificate_types t on t.id = r.type_id
         join users u on u.id = r.resident_id
         left join resident_profiles rp on rp.user_id = r.resident_id
        where r.id = $1 and r.barangay_id = $2
        for update of r`,
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

    /**
     * The certificate itself, written in the same transaction as the release.
     *
     * `released` and not `ready`: `ready` means the paper has been prepared,
     * `released` means the barangay has handed it over — and it takes its fee
     * at the hall on collection, because nothing is paid online at this tier.
     * A PDF at `ready` would hand somebody the certificate without their ever
     * collecting or paying for it.
     *
     * The date it carries is the `valid_until` stamped at `ready`, not one
     * worked out now. The paper was dated when it was prepared, and the copy
     * has to say what the paper says.
     */
    let issued: { verificationCode: string; fileName: string } | null = null
    if (status === 'released') {
      const validUntil =
        row.valid_until instanceof Date
          ? row.valid_until.toLocaleDateString('en-CA')
          : (row.valid_until ?? null)
      issued = await issueBarangayCertificate(client, {
        requestId: row.id,
        barangayId: barangay.id,
        issuedBy: req.user!.id,
        data: {
          referenceNo: row.reference_no,
          certificateName: row.type_name,
          // What the barangay attests, read off the type at the moment of
          // release and rendered into the stored PDF — so a later edit to the
          // wording never rewrites a certificate somebody is already holding.
          attestation: row.attestation,
          purpose: row.purpose,
          residentName: row.resident_name,
          residentAddress: row.resident_address,
          barangayName: barangay.name,
          municipality: town.name,
          province: town.province,
          hallAddress: barangay.hall_address,
          phone: barangay.phone,
          email: barangay.email,
          captain: barangay.captain,
          secretary: barangay.secretary,
          feePesos: row.fee_centavos / 100,
          issuedAt: new Date(),
          validUntil,
          seal: sealSource.seal,
          sealType: sealSource.sealType,
        },
      })
    }

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
        : status === 'released' && issued
          ? `Your ${row.type_name} has been released. A copy you can show or print is in the app.`
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
      where t.active = true and (t.barangay_id is null or t.barangay_id = $1)
      order by t.barangay_id nulls first, t.sort_order, t.name`,
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

  // Scoped like everything else here: another barangay's own document is not
  // found rather than refused, so there is nowhere to name one.
  const type = await one(
    `select 1 from barangay_certificate_types
      where id = $1 and (barangay_id is null or barangay_id = $2)`,
    [req.params.typeId, barangay.id]
  )
  if (!type) return res.status(404).json({ error: 'No such certificate.' })

  // Audited, because this is a change to what a resident is charged and the
  // treasury reconciles against it. Written in the same transaction as the fee
  // itself, like every other audited edit — a fee that moved with no record of
  // who moved it is the thing the log exists to prevent.
  await transaction(async (client) => {
    const before = await client.query<{ fee_centavos: number }>(
      `select coalesce(f.fee_centavos, t.fee_centavos) as fee_centavos
         from barangay_certificate_types t
         left join barangay_certificate_fees f on f.type_id = t.id and f.barangay_id = $2
        where t.id = $1`,
      [req.params.typeId, barangay.id]
    )
    await client.query(
      `insert into barangay_certificate_fees (barangay_id, type_id, fee_centavos)
       values ($1, $2, $3)
       on conflict (barangay_id, type_id) do update set fee_centavos = excluded.fee_centavos`,
      [barangay.id, req.params.typeId, toCentavos(parsed.data.fee)]
    )
    await recordAudit(client, {
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'barangay_fee.update',
      target: `${barangay.id}/${req.params.typeId}`,
      before: { fee: toPesos(before.rows[0]?.fee_centavos ?? 0), barangay: barangay.name },
      after: { fee: parsed.data.fee, barangay: barangay.name },
    })
  })
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

// ------------------------------------------- this barangay's own certificates
//
// A barangay may add documents it alone issues, and may not touch the shared
// catalogue — what a Barangay Clearance *is* stays the municipality's, so that
// it means the same thing on every street. The split is the row's barangay_id,
// and every statement below filters on this account's own, so a shared row is
// not found rather than refused.

/** Everything this barangay issues: the shared catalogue, then its own. */
barangayStaffRouter.get('/certificates', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<CertificateRow & { override_centavos: number | null }>(
    `select t.*, f.fee_centavos as override_centavos
       from barangay_certificate_types t
       left join barangay_certificate_fees f on f.type_id = t.id and f.barangay_id = $1
      where t.barangay_id is null or t.barangay_id = $1
      order by t.barangay_id nulls first, t.sort_order, t.name`,
    [barangay.id]
  )
  res.json(
    rows.map((r) => ({
      ...serializeCertificateType(r),
      // What this barangay actually charges, which is its override where it set
      // one — the same figure the resident is quoted.
      fee: toPesos(r.override_centavos ?? r.fee_centavos),
      /** Shared documents are read-only here; its own are not. */
      own: r.barangay_id !== null,
    }))
  )
})

barangayStaffRouter.post('/certificates', requireRole('barangay_admin'), async (req, res) => {
  const parsed = certificateCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const row = await transaction((client) =>
    createCertificateType(client, parsed.data, barangay.id, {
      id: req.user!.id, fullName: req.user!.fullName,
    })
  )
  res.status(201).json({ ...serializeCertificateType(row), own: true })
})

barangayStaffRouter.patch('/certificates/:id', requireRole('barangay_admin'), async (req, res) => {
  const parsed = certificateEditSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' })
  }
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const row = await transaction((client) =>
    updateCertificateType(client, String(req.params.id), parsed.data, barangay.id, {
      id: req.user!.id, fullName: req.user!.fullName,
    })
  )
  // A shared certificate is not this barangay's to edit, so from here it does
  // not exist — the same answer another barangay's row gives.
  if (!row) return res.status(404).json({ error: 'That is not one of your barangay\u2019s own certificates.' })
  res.json({ ...serializeCertificateType(row), own: true })
})

/** Withdrawn, never deleted — an issued certificate has to keep its name. */
barangayStaffRouter.delete('/certificates/:id', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  const restore = req.query.restore === 'true'

  const row = await transaction((client) =>
    withdrawCertificateType(client, String(req.params.id), restore, barangay.id, {
      id: req.user!.id, fullName: req.user!.fullName,
    })
  )
  if (!row) return res.status(404).json({ error: 'Not found, or already in that state.' })
  res.json({ ...serializeCertificateType(row), own: true })
})

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
