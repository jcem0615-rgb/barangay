import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { REQUEST_SELECT, serializeWithReady, withReadyDates, type RequestRow } from '../serialize.ts'
import { DEPARTMENT_PREFIX, STEP_ASSESSMENT, STEP_RELEASE, makeReferenceNo } from '../workflow.ts'
import { putFile, removeFile } from '../storage.ts'
import { sendAttachment } from '../attachments.ts'
import {
  ACCEPTED_DESCRIPTION, detectType, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST, safeFileName,
} from '../uploads.ts'
import { scanBuffer } from '../antivirus.ts'

export const requestsRouter = Router()
requestsRouter.use(authenticate, requireRole('resident'))

/** Generous enough for a long address or narrative, short of an abuse vector. */
const MAX_FIELD_LENGTH = 2000

const createSchema = z.object({
  serviceId: z.string().min(1),
  formValues: z.record(z.string(), z.string()).default({}),
  /** Set when the resident filled this in offline and it synced later. */
  submittedOfflineAt: z.iso.datetime().optional(),
  /** The draft this submission finishes, cleared as part of the same commit. */
  draftId: z.uuid().optional(),
})

interface ServiceField {
  id: string
  label?: string
  type?: string
  options?: string[]
  required?: boolean
}

interface ServiceRow {
  id: string
  department_id: string
  fee_centavos: number
  fields: ServiceField[]
}

const loadService = (serviceId: string) =>
  one<ServiceRow>(
    `select id, department_id, fee_centavos, fields
       from services where id = $1 and active = true`,
    [serviceId]
  )

/** A field is named to the resident the way the form named it to them. */
const nameOf = (field: ServiceField) => field.label ?? field.id

/**
 * Checks a form against the shape its service declares.
 *
 * `complete` separates the two callers. A submission must satisfy every rule:
 * once it is filed, a clerk acts on it, and an application missing its business
 * address is one someone has to chase the resident about. A draft is by
 * definition half-finished and possibly mid-keystroke, so it is held only to
 * the rules that protect the store itself — declared fields, sane lengths —
 * and everything else waits until the resident actually submits.
 *
 * The browser applies the same rules first; this is what makes them true, since
 * nothing stops a caller from POSTing straight past the form.
 *
 * Returns an error message, or null when the values are acceptable.
 */
function checkFormValues(
  service: ServiceRow,
  formValues: Record<string, string>,
  { complete }: { complete: boolean }
): string | null {
  // Without this a caller could attach arbitrary keys, which staff would then
  // be shown as if the resident had filled them in.
  const declared = new Map(service.fields.map((f) => [f.id, f]))
  const unknown = Object.keys(formValues).find((k) => !declared.has(k))
  if (unknown) return `Unexpected field: ${unknown}`

  const tooLong = Object.entries(formValues).find(([, v]) => v.length > MAX_FIELD_LENGTH)
  if (tooLong) {
    const field = declared.get(tooLong[0])
    return `${field ? nameOf(field) : tooLong[0]} is too long (max ${MAX_FIELD_LENGTH} characters).`
  }

  if (!complete) return null

  for (const field of service.fields) {
    const value = (formValues[field.id] ?? '').trim()

    if (field.required && value === '') return `${nameOf(field)} is required.`
    // An optional field left blank is finished; only a filled one is checked
    // against its type.
    if (value === '') continue

    if (field.type === 'select' && field.options?.length && !field.options.includes(value)) {
      return `${nameOf(field)} must be one of the listed choices.`
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      return `${nameOf(field)} must be a number.`
    }
    // The form uses a native date input, which always yields YYYY-MM-DD.
    if (field.type === 'date' && !isCalendarDate(value)) {
      return `${nameOf(field)} must be a valid date.`
    }
  }

  return null
}

/** A real day, not merely something Date.parse tolerates ("2026-02-31"). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const asDate = new Date(Date.UTC(y!, m! - 1, d!))
  return (
    asDate.getUTCFullYear() === y && asDate.getUTCMonth() === m! - 1 && asDate.getUTCDate() === d
  )
}

requestsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const { serviceId, formValues, submittedOfflineAt, draftId } = parsed.data

  const service = await loadService(serviceId)
  if (!service) return res.status(404).json({ error: 'That service is no longer offered.' })

  const invalid = checkFormValues(service, formValues, { complete: true })
  if (invalid) return res.status(400).json({ error: invalid })

  const created = await transaction(async (client) => {
    // Atomic increment: the upsert takes a row lock, so simultaneous
    // submissions to the same office queue up and each gets its own number.
    // Counting existing rows instead would hand them all the same one.
    const year = new Date().getFullYear()
    const seq = await client.query<{ last_number: number }>(
      `insert into request_counters (department_id, year, last_number)
       values ($1, $2, 1)
       on conflict (department_id, year)
       do update set last_number = request_counters.last_number + 1
       returning last_number`,
      [service.department_id, year]
    )
    const referenceNo = makeReferenceNo(
      DEPARTMENT_PREFIX[service.department_id] ?? 'LGU',
      year,
      seq.rows[0]!.last_number
    )

    const inserted = await client.query<RequestRow>(
      `insert into requests
         (reference_no, resident_id, service_id, department_id, status,
          current_step_index, fee_centavos, form_values, submitted_at)
       values ($1, $2, $3, $4, 'submitted', 0, $5, $6, coalesce($7::timestamptz, now()))
       returning *`,
      [
        referenceNo, req.user!.id, service.id, service.department_id,
        service.fee_centavos, formValues, submittedOfflineAt ?? null,
      ]
    )
    const row = inserted.rows[0]!
    await client.query(
      `insert into request_events (request_id, actor_id, event_type, to_step, note)
       values ($1, $2, 'submitted', 0, $3)`,
      [row.id, req.user!.id, submittedOfflineAt ? 'Submitted offline, synced on reconnect' : null]
    )

    // Cleared in the same commit as the insert, so a lost response can never
    // leave the resident with both a filed request and the draft of it.
    // Scoped by resident so a draft id guessed from elsewhere deletes nothing.
    await client.query(
      `delete from request_drafts
        where resident_id = $1 and (id = $2::uuid or service_id = $3)`,
      [req.user!.id, draftId ?? null, service.id]
    )
    return row
  })

  const withName = await one<RequestRow>(
    `select ${REQUEST_SELECT} from requests r join services s on s.id = r.service_id where r.id = $1`,
    [created.id]
  )
  res.status(201).json(await serializeWithReady(withName!))
})

requestsRouter.get('/', async (req, res) => {
  // A resident has few requests, but the endpoint should still not be able to
  // return an unbounded result set.
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 200)
  const rows = await query<RequestRow>(
    `select ${REQUEST_SELECT}
       from requests r join services s on s.id = r.service_id
      where r.resident_id = $1
      order by r.submitted_at desc
      limit $2`,
    [req.user!.id, limit]
  )
  res.json(await withReadyDates(rows))
})

// ---------------------------------------------------------------------------
// Drafts
//
// Declared before `/:id` so Express does not read "drafts" as a request id.
// Every query is scoped to req.user.id: a draft is the resident's own scratch
// space and no office ever sees one.
// ---------------------------------------------------------------------------

const DRAFT_SELECT = `
  d.id, d.service_id as "serviceId", s.name as "serviceName",
  s.department_id as "categoryId", d.form_values as "formValues",
  d.created_at as "createdAt", d.updated_at as "updatedAt"`

requestsRouter.get('/drafts', async (req, res) => {
  const rows = await query(
    `select ${DRAFT_SELECT}
       from request_drafts d join services s on s.id = d.service_id
      where d.resident_id = $1
      order by d.updated_at desc
      limit 50`,
    [req.user!.id]
  )
  res.json(rows)
})

const draftSchema = z.object({
  formValues: z.record(z.string(), z.string()).default({}),
})

/**
 * Save, or overwrite, the draft for one service. A PUT keyed on the service
 * rather than a POST returning an id: autosave fires repeatedly from a form
 * that may not have reached the server yet, and retrying a PUT is harmless.
 */
requestsRouter.put('/drafts/:serviceId', async (req, res) => {
  const parsed = draftSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })

  const service = await loadService(req.params.serviceId)
  if (!service) return res.status(404).json({ error: 'That service is no longer offered.' })

  const invalid = checkFormValues(service, parsed.data.formValues, { complete: false })
  if (invalid) return res.status(400).json({ error: invalid })

  const saved = await one(
    `insert into request_drafts (resident_id, service_id, form_values)
     values ($1, $2, $3)
     on conflict (resident_id, service_id) do update set
       form_values = excluded.form_values, updated_at = now()
     returning id, service_id as "serviceId", form_values as "formValues",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [req.user!.id, service.id, parsed.data.formValues]
  )
  res.json(saved)
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

requestsRouter.delete('/drafts/:id', async (req, res) => {
  // Postgres raises on a malformed uuid, which would surface as a 500 for what
  // is really just a request for something that does not exist.
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Draft not found.' })

  const removed = await query(
    `delete from request_drafts where id = $1 and resident_id = $2 returning id`,
    [req.params.id, req.user!.id]
  )
  if (removed.length === 0) return res.status(404).json({ error: 'Draft not found.' })
  res.status(204).end()
})

requestsRouter.get('/:id', async (req, res) => {
  // Ownership is part of the query, not a check afterwards, so another
  // resident's request is simply not found.
  const row = await one<RequestRow>(
    `select ${REQUEST_SELECT}
       from requests r join services s on s.id = r.service_id
      where r.id = $1 and r.resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const events = await query(
    `select event_type as "eventType", from_step as "fromStep", to_step as "toStep",
            note, created_at as "createdAt"
       from request_events where request_id = $1 order by created_at`,
    [row.id]
  )
  // The receipt, if the payment settled. Carried on the detail rather than the
  // list: it is one join, and the only screen that offers the download is this
  // one.
  const [receipt, document] = await Promise.all([
    one<{ receipt_no: string; issued_at: Date; verification_code: string }>(
      `select receipt_no, issued_at, verification_code from receipts where request_id = $1`,
      [row.id]
    ),
    one<{ verification_code: string; revoked_at: Date | null; revoked_reason: string | null }>(
      `select verification_code, revoked_at, revoked_reason
         from documents where request_id = $1`,
      [row.id]
    ),
  ])
  res.json({
    ...(await serializeWithReady(row)),
    events,
    receiptNo: receipt?.receipt_no ?? null,
    receiptIssuedAt: receipt?.issued_at.toISOString() ?? null,
    // The code printed on their own receipt. No new exposure — it is on the
    // paper they are already holding — and it saves a resident at a counter
    // from having to open a PDF to read it out.
    receiptCode: receipt?.verification_code ?? null,
    // The same, for the released document. The receipt and the barangay
    // certificate have published theirs for a while and this one never did,
    // which left the resident with the one code they could not read out
    // without opening a PDF on a phone.
    documentCode: document?.verification_code ?? null,
    // Withdrawn after release. The resident is notified when it happens; this
    // is what the screen reads back afterwards, because the PDF they hold was
    // frozen at issue and still looks exactly as valid as it did.
    documentRevoked: document?.revoked_at != null,
    documentRevokedReason: document?.revoked_reason ?? null,
  })
})

/**
 * Paying used to happen here, and it marked a request paid because the browser
 * said so — which made a permit free to anyone who could open a developer
 * console. The amount and the fact of payment are the server's to establish, so
 * the flow moved to /api/payments: the server prices an intent, the resident
 * pays at the provider, and a signed callback settles it.
 *
 * Gone rather than silently redirected: a client still calling this is running
 * code old enough that its idea of paying is wrong, and 410 with somewhere to go
 * is more useful than a 404.
 */
requestsRouter.post('/:id/pay', async (_req, res) => {
  res.status(410).json({
    error: 'Payment has moved. Reload the app and try again.',
    payAt: '/api/payments/intents',
  })
})

/** The released document, downloadable only by the resident who filed it. */
requestsRouter.get('/:id/document', async (req, res) => {
  const doc = await one<{ file_name: string; content: Buffer }>(
    `select d.file_name, d.content
       from documents d
       join requests r on r.id = d.request_id
      where d.request_id = $1 and r.resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!doc) return res.status(404).json({ error: 'No document is available for this request.' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`)
  res.send(doc.content)
})

/**
 * The official receipt for this request's payment.
 *
 * Scoped through the request's own resident_id, like the released document
 * above: another resident's receipt is not found rather than refused, because
 * the ownership is part of the query rather than a check somebody has to
 * remember to write.
 */
requestsRouter.get('/:id/receipt', async (req, res) => {
  const receipt = await one<{ file_name: string; content: Buffer }>(
    `select rc.file_name, rc.content
       from receipts rc
       join requests r on r.id = rc.request_id
      where rc.request_id = $1 and r.resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!receipt) {
    return res.status(404).json({ error: 'No receipt has been issued for this request.' })
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${receipt.file_name}"`)
  res.send(receipt.content)
})

// Held in memory so the bytes can be type-checked before anything is written to
// disk — multer's own diskStorage would persist the file first.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
})

/**
 * Requests still being worked on accept attachments; closed ones do not.
 * The id comes off the URL, so it is only trusted once it is actually a string.
 */
async function openRequestOwnedBy(id: unknown, residentId: string) {
  if (typeof id !== 'string') return undefined
  return one<{ id: string; status: string }>(
    `select id, status from requests where id = $1 and resident_id = $2`,
    [id, residentId]
  )
}

requestsRouter.get('/:id/attachments', async (req, res) => {
  const owned = await openRequestOwnedBy(req.params.id, req.user!.id)
  if (!owned) return res.status(404).json({ error: 'Request not found.' })

  const rows = await query(
    `select id, requirement, file_name as "fileName", content_type as "contentType",
            byte_size as "byteSize", created_at as "createdAt"
       from attachments where request_id = $1 order by created_at`,
    [owned.id]
  )
  res.json(rows)
})

requestsRouter.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const owned = await openRequestOwnedBy(req.params.id, req.user!.id)
  if (!owned) return res.status(404).json({ error: 'Request not found.' })
  if (owned.status === 'completed' || owned.status === 'rejected') {
    return res.status(409).json({ error: 'This request is closed and no longer accepts files.' })
  }

  const file = req.file
  if (!file) return res.status(400).json({ error: 'Choose a file to attach.' })

  const count = await one<{ count: number }>(
    `select count(*)::int as count from attachments where request_id = $1`,
    [owned.id]
  )
  if ((count?.count ?? 0) >= MAX_FILES_PER_REQUEST) {
    return res.status(409).json({
      error: `You can attach up to ${MAX_FILES_PER_REQUEST} files to a request.`,
    })
  }

  // The declared type and the filename are both caller-controlled; the bytes decide.
  const detected = detectType(file.buffer)
  if (!detected) {
    return res.status(415).json({ error: `That file type isn't accepted. Attach a ${ACCEPTED_DESCRIPTION} file.` })
  }

  // Scanned while still in memory, so an infected file never reaches disk.
  const scan = await scanBuffer(file.buffer)
  if (scan.status === 'infected') {
    console.warn(
      `rejected upload from user ${req.user!.id} on request ${owned.id}: ${scan.signature}`
    )
    return res.status(422).json({
      error: 'That file was rejected by our virus scan. Try a different copy.',
    })
  }
  if (scan.status === 'unavailable') {
    // Fail closed: an unavailable scanner must not quietly become no scanner.
    console.error(`virus scan unavailable: ${scan.reason}`)
    return res.status(503).json({
      error: "We can't check files for viruses right now. Please try again shortly.",
    })
  }

  const requirement = typeof req.body?.requirement === 'string'
    ? req.body.requirement.slice(0, 200)
    : null

  const stored = await putFile(file.buffer)
  const fileName = safeFileName(file.originalname ?? 'file', detected.extension)

  try {
    const row = await one(
      `insert into attachments
         (request_id, uploaded_by, requirement, file_name, content_type, byte_size, storage_key, checksum)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, requirement, file_name as "fileName", content_type as "contentType",
                 byte_size as "byteSize", created_at as "createdAt"`,
      [
        owned.id, req.user!.id, requirement, fileName,
        detected.contentType, stored.byteSize, stored.storageKey, stored.checksum,
      ]
    )
    await query(
      `insert into request_events (request_id, actor_id, event_type, note)
       values ($1, $2, 'attached', $3)`,
      [owned.id, req.user!.id, requirement ? `${fileName} (${requirement})` : fileName]
    )
    res.status(201).json(row)
  } catch (err) {
    // Don't leave an orphaned file on disk if the row could not be written.
    await removeFile(stored.storageKey)
    throw err
  }
})

requestsRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const row = await one<{ storage_key: string; file_name: string; content_type: string }>(
    `select a.storage_key, a.file_name, a.content_type
       from attachments a
       join requests r on r.id = a.request_id
      where a.id = $1 and a.request_id = $2 and r.resident_id = $3`,
    [req.params.attachmentId, req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Attachment not found.' })
  await sendAttachment(res, row)
})

requestsRouter.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const row = await one<{ id: string; storage_key: string; status: string }>(
    `select a.id, a.storage_key, r.status
       from attachments a
       join requests r on r.id = a.request_id
      where a.id = $1 and a.request_id = $2 and r.resident_id = $3`,
    [req.params.attachmentId, req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Attachment not found.' })
  if (row.status === 'completed' || row.status === 'rejected') {
    return res.status(409).json({ error: 'This request is closed and its files cannot be changed.' })
  }

  await query(`delete from attachments where id = $1`, [row.id])
  await removeFile(row.storage_key)
  res.status(204).end()
})
