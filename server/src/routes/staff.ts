import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, canActOnDepartment, requireRole } from '../auth.ts'
import { REQUEST_SELECT, serializeRequest, toCentavos, type RequestRow } from '../serialize.ts'
import { STEP_ASSESSMENT, STEP_PAYMENT, STEP_RELEASE, WORKFLOW_STEPS } from '../workflow.ts'
import { documentFileName, makeVerificationCode, renderDocument } from '../documents.ts'
import { sendAttachment } from '../attachments.ts'
import {
  deliverNotification, notificationFor, recordNotification, type NotificationInput,
} from '../notifications.ts'

export const staffRouter = Router()
staffRouter.use(authenticate, requireRole('staff', 'admin'))

/**
 * Every staff route resolves the request through the caller's departments, so
 * a Treasury clerk asking for a Building & Zoning request gets a 404 rather
 * than someone else's queue.
 */
async function loadForStaff(id: string, departments: string[], isAdmin: boolean) {
  return one<RequestRow>(
    `select ${REQUEST_SELECT}, u.full_name as resident_name
       from requests r
       join services s on s.id = r.service_id
       join users u on u.id = r.resident_id
      where r.id = $1
        and ($2::boolean or r.department_id = any($3::text[]))`,
    [id, isAdmin, departments]
  )
}

const officeNameFor = async (departmentId: string) =>
  (await one<{ office_name: string }>(
    `select office_name from departments where id = $1`, [departmentId]
  ))?.office_name ?? 'The municipal office'

/**
 * Keyset pagination on (submitted_at, id).
 *
 * Offset pagination would be simpler, but a queue takes new requests
 * constantly: with OFFSET, a request arriving while a clerk reads page 1 shifts
 * everything down and page 2 repeats a row that was already seen. A cursor
 * anchored to the last row read is stable no matter what arrives meanwhile.
 * The id breaks ties, since two requests can share a timestamp.
 */
/**
 * The timestamp comes straight from Postgres as text. A JS Date only keeps
 * milliseconds, and timestamptz keeps microseconds — round-tripping through
 * toISOString() truncates .123456 to .123, so the next page starts *before* the
 * row it should start after and returns it a second time.
 */
const encodeCursor = (row: { cursor_at: string; id: string }) =>
  Buffer.from(`${row.cursor_at}|${row.id}`).toString('base64url')

function decodeCursor(raw: unknown): { at: string; id: string } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const [at, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|')
    if (!at || !id || Number.isNaN(Date.parse(at))) return null
    return { at, id }
  } catch {
    return null
  }
}

const DEFAULT_PAGE = 25
const MAX_PAGE = 100

/** The department queue: what this office has been asked to act on. */
staffRouter.get('/queue', async (req, res) => {
  const user = req.user!
  const isAdmin = user.role === 'admin'

  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined
  if (departmentId && !canActOnDepartment(user, departmentId)) {
    return res.status(403).json({ error: 'You are not assigned to that office.' })
  }
  if (!isAdmin && user.departments.length === 0) {
    return res.status(403).json({ error: 'Your account is not assigned to an office yet.' })
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const scope = departmentId ? [departmentId] : user.departments
  const scopeAll = isAdmin && !departmentId

  const limit = Math.min(Math.max(Number(req.query.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1), MAX_PAGE)

  const cursor = decodeCursor(req.query.cursor)
  if (req.query.cursor && !cursor) {
    return res.status(400).json({ error: 'That page link is no longer valid. Reload the queue.' })
  }

  // Free-text search over what a clerk actually has in hand: a reference number
  // on a printout, or the resident's name.
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const search = rawSearch.length > 0 ? rawSearch : null

  const filters = `
    ($1::boolean or r.department_id = any($2::text[]))
    and ($3::text is null or r.status = $3::request_status)
    and ($4::text is null or (
      r.reference_no ilike '%' || $4 || '%'
      or u.full_name ilike '%' || $4 || '%'
      or s.name ilike '%' || $4 || '%'
    ))
  `

  // One extra row tells us whether another page exists without a second query.
  const rows = await query<RequestRow & { cursor_at: string }>(
    `select ${REQUEST_SELECT}, u.full_name as resident_name,
            r.submitted_at::text as cursor_at
       from requests r
       join services s on s.id = r.service_id
       join users u on u.id = r.resident_id
      where ${filters}
        and ($5::timestamptz is null
             or (r.submitted_at, r.id) > ($5::timestamptz, $6::uuid))
      order by r.submitted_at asc, r.id asc
      limit $7`,
    [scopeAll, scope, status ?? null, search, cursor?.at ?? null, cursor?.id ?? null, limit + 1]
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const totals = await one<{ count: number }>(
    `select count(*)::int as count
       from requests r
       join services s on s.id = r.service_id
       join users u on u.id = r.resident_id
      where ${filters}`,
    [scopeAll, scope, status ?? null, search]
  )

  res.json({
    items: page.map(serializeRequest),
    // Null when this is the last page, so the client stops asking.
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
    total: totals?.count ?? page.length,
  })
})

/** Counts per status, for the queue's summary tiles. */
staffRouter.get('/summary', async (req, res) => {
  const user = req.user!
  const isAdmin = user.role === 'admin'
  const rows = await query<{ department_id: string; status: string; count: number }>(
    `select r.department_id, r.status, count(*)::int as count
       from requests r
      where ($1::boolean or r.department_id = any($2::text[]))
      group by r.department_id, r.status`,
    [isAdmin, user.departments]
  )
  res.json(rows.map((r) => ({ departmentId: r.department_id, status: r.status, count: r.count })))
})

staffRouter.get('/requests/:id', async (req, res) => {
  const user = req.user!
  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const events = await query(
    `select e.event_type as "eventType", e.from_step as "fromStep", e.to_step as "toStep",
            e.note, e.created_at as "createdAt", u.full_name as "actorName"
       from request_events e
       left join users u on u.id = e.actor_id
      where e.request_id = $1 order by e.created_at`,
    [row.id]
  )
  res.json({ ...serializeRequest(row), events })
})

/** Treasury sets the amount due and moves the request to For Payment. */
const assessSchema = z.object({
  fee: z.number().min(0).max(10_000_000),
  note: z.string().max(500).optional(),
})

staffRouter.post('/requests/:id/assess', async (req, res) => {
  const parsed = assessSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const user = req.user!

  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })
  if (row.status === 'completed' || row.status === 'rejected') {
    return res.status(409).json({ error: 'This request is already closed.' })
  }

  const officeName = await officeNameFor(row.department_id)
  const notice: NotificationInput = {
    userId: row.resident_id,
    requestId: row.id,
    kind: 'assessed',
    ...notificationFor('assessed', {
      serviceName: row.service_name ?? 'request',
      referenceNo: row.reference_no,
      officeName,
      fee: parsed.data.fee,
    }),
  }

  const updated = await transaction(async (client) => {
    const result = await client.query<RequestRow>(
      `update requests
          set fee_centavos = $2, status = 'for_payment',
              current_step_index = $3, updated_at = now()
        where id = $1 returning *`,
      [row.id, toCentavos(parsed.data.fee), STEP_PAYMENT]
    )
    await client.query(
      `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
       values ($1, $2, 'assessed', $3, $4, $5)`,
      [row.id, user.id, row.current_step_index, STEP_PAYMENT, parsed.data.note ?? null]
    )
    // Part of the same transaction: a request cannot be assessed without the
    // resident being told what they owe.
    await recordNotification(client, notice)
    return result.rows[0]!
  })

  // Delivered after the change is committed and without blocking the response,
  // so a slow mail server never makes this button hang.
  void deliverNotification(notice)

  const withName = await loadForStaff(updated.id, user.departments, user.role === 'admin')
  res.json(serializeRequest(withName!))
})

/** Moves the request one step forward; the last step completes it. */
const advanceSchema = z.object({ note: z.string().max(500).optional() })

staffRouter.post('/requests/:id/advance', async (req, res) => {
  const parsed = advanceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Note is too long.' })
  const user = req.user!

  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })
  if (row.status === 'completed' || row.status === 'rejected') {
    return res.status(409).json({ error: 'This request is already closed.' })
  }
  // Payment is the resident's move, not the office's.
  if (row.current_step_index === STEP_PAYMENT && !row.paid) {
    return res.status(409).json({ error: 'Waiting for the resident to pay the assessed fee.' })
  }

  // Paying carries a request to the final step but does not close it — the
  // office still has to release the document. So advancing from the final step
  // completes the request rather than being refused, otherwise a paid request
  // would sit at 'e-Document Release' forever with nothing to hand over.
  const lastStep = WORKFLOW_STEPS.length - 1
  const nextStep = Math.min(row.current_step_index + 1, lastStep)
  const isFinal = nextStep >= lastStep

  // Completing a request releases the document. Rendered before the
  // transaction so a PDF failure cannot leave a request marked completed with
  // nothing to hand the resident.
  let released: { code: string; fileName: string; content: Buffer } | null = null
  if (isFinal) {
    const context = await one<{
      office_name: string; municipality: string | null; address: string | null
    }>(
      `select d.office_name, rp.municipality, rp.address
         from requests r
         join departments d on d.id = r.department_id
         left join resident_profiles rp on rp.user_id = r.resident_id
        where r.id = $1`,
      [row.id]
    )
    const code = makeVerificationCode()
    const content = await renderDocument({
      referenceNo: row.reference_no,
      serviceName: row.service_name ?? 'Municipal Document',
      officeName: context?.office_name ?? 'Municipal Office',
      municipality: context?.municipality ?? 'Municipality of San Fernando',
      residentName: row.resident_name ?? '',
      residentAddress: context?.address ?? null,
      formValues: row.form_values,
      feePesos: row.fee_centavos / 100,
      paid: row.paid,
      submittedAt: row.submitted_at,
      issuedAt: new Date(),
      verificationCode: code,
    })
    released = {
      code,
      fileName: documentFileName(row.service_name ?? 'document', row.reference_no),
      content,
    }
  }

  const officeName = await officeNameFor(row.department_id)
  const notice: NotificationInput = {
    userId: row.resident_id,
    requestId: row.id,
    kind: isFinal ? 'released' : 'advanced',
    ...notificationFor(isFinal ? 'released' : 'advanced', {
      serviceName: row.service_name ?? 'request',
      referenceNo: row.reference_no,
      officeName,
    }),
  }

  const updated = await transaction(async (client) => {
    const result = await client.query<RequestRow>(
      `update requests
          set current_step_index = $2, status = $3, updated_at = now()
        where id = $1 returning *`,
      [row.id, nextStep, isFinal ? 'completed' : 'in_progress']
    )
    await client.query(
      `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        row.id, user.id, isFinal ? 'completed' : 'advanced',
        row.current_step_index, nextStep, parsed.data.note ?? null,
      ]
    )
    if (released) {
      // One document per request: re-completing cannot mint a second one.
      await client.query(
        `insert into documents (request_id, verification_code, file_name, content, byte_size, issued_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (request_id) do nothing`,
        [row.id, released.code, released.fileName, released.content, released.content.length, user.id]
      )
      await client.query(
        `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
         values ($1, $2, 'released', $3, $3, $4)`,
        [row.id, user.id, nextStep, `Document released (code ${released.code})`]
      )
    }
    await recordNotification(client, notice)
    return result.rows[0]!
  })

  void deliverNotification(notice)

  const withName = await loadForStaff(updated.id, user.departments, user.role === 'admin')
  res.json(serializeRequest(withName!))
})

const rejectSchema = z.object({ reason: z.string().min(3, 'Tell the resident why.').max(500) })

staffRouter.post('/requests/:id/reject', async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const user = req.user!

  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })
  if (row.status === 'completed') {
    return res.status(409).json({ error: 'This request is already completed.' })
  }

  const officeName = await officeNameFor(row.department_id)
  const notice: NotificationInput = {
    userId: row.resident_id,
    requestId: row.id,
    kind: 'rejected',
    ...notificationFor('rejected', {
      serviceName: row.service_name ?? 'request',
      referenceNo: row.reference_no,
      officeName,
      reason: parsed.data.reason,
    }),
  }

  const updated = await transaction(async (client) => {
    const result = await client.query<RequestRow>(
      `update requests set status = 'rejected', rejection_reason = $2, updated_at = now()
        where id = $1 returning *`,
      [row.id, parsed.data.reason]
    )
    await client.query(
      `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
       values ($1, $2, 'rejected', $3, $3, $4)`,
      [row.id, user.id, row.current_step_index, parsed.data.reason]
    )
    await recordNotification(client, notice)
    return result.rows[0]!
  })

  void deliverNotification(notice)

  const withName = await loadForStaff(updated.id, user.departments, user.role === 'admin')
  res.json(serializeRequest(withName!))
})

staffRouter.get('/requests/:id/document', async (req, res) => {
  const user = req.user!
  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const doc = await one<{ file_name: string; content: Buffer }>(
    `select file_name, content from documents where request_id = $1`,
    [row.id]
  )
  if (!doc) return res.status(404).json({ error: 'No document has been released yet.' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`)
  res.send(doc.content)
})

/** What the resident attached, for the office that has to verify it. */
staffRouter.get('/requests/:id/attachments', async (req, res) => {
  const user = req.user!
  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const rows = await query(
    `select id, requirement, file_name as "fileName", content_type as "contentType",
            byte_size as "byteSize", created_at as "createdAt"
       from attachments where request_id = $1 order by created_at`,
    [row.id]
  )
  res.json(rows)
})

staffRouter.get('/requests/:id/attachments/:attachmentId', async (req, res) => {
  const user = req.user!
  // Resolved through the caller's departments first, so another office's
  // attachment is simply not found.
  const request = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!request) return res.status(404).json({ error: 'Request not found.' })

  const row = await one<{ storage_key: string; file_name: string; content_type: string }>(
    `select storage_key, file_name, content_type
       from attachments where id = $1 and request_id = $2`,
    [req.params.attachmentId, request.id]
  )
  if (!row) return res.status(404).json({ error: 'Attachment not found.' })
  await sendAttachment(res, row)
})
