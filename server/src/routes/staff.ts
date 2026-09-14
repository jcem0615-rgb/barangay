import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, canActOnDepartment, requireRole } from '../auth.ts'
import { REQUEST_SELECT, serializeWithReady, toCentavos, withReadyDates, type RequestRow } from '../serialize.ts'
import { STEP_ASSESSMENT, STEP_PAYMENT, STEP_RELEASE, WORKFLOW_STEPS } from '../workflow.ts'
import { documentFileName, makeVerificationCode, renderDocument } from '../documents.ts'
import { sendAttachment } from '../attachments.ts'
import {
  deliverNotification, notificationFor, recordNotification, type NotificationInput,
} from '../notifications.ts'
import {
  listResidentPrograms, listResidentProgramsIn, mayAdministerPrograms, programNoticeFor,
} from '../programs.ts'
import { consumeVerificationCode } from '../idVerification.ts'
import { getFile } from '../storage.ts'
import { buildReport, MAX_PERIOD_DAYS, toCsv } from '../reports.ts'
import { APPOINTMENT_SELECT, officeToday } from '../appointments.ts'
import { COMPLAINT_SELECT } from '../feedback.ts'

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
    items: await withReadyDates(page),
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
  res.json({ ...(await serializeWithReady(row)), events })
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
  res.json(await serializeWithReady(withName!))
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
      municipality: context?.municipality ?? 'Municipality of Malasiqui',
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
  res.json(await serializeWithReady(withName!))
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
  res.json(await serializeWithReady(withName!))
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

// ---------------------------------------------------------------------------
// Sectoral registries and poverty-reduction programmes
//
// Reached through a request, so the office is always looking at a resident it
// already has business with — there is no resident-search surface to abuse.
// Reading is open to any office that can open the request; writing is not.
// ---------------------------------------------------------------------------

/** The resident's memberships, alongside the catalogue that describes them. */
staffRouter.get('/requests/:id/programs', async (req, res) => {
  const user = req.user!
  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  res.json({
    residentName: row.resident_name ?? '',
    programs: await listResidentPrograms(row.resident_id),
    mayEdit: mayAdministerPrograms(user.role, user.departments),
  })
})

const grantSchema = z.object({
  code: z.string().min(1).max(40),
  referenceNo: z.string().max(60).optional(),
  validUntil: z.iso.date().optional(),
  note: z.string().max(300).optional(),
})

/**
 * Enrol a resident, or correct an existing record. Upsert rather than insert:
 * a clerk fixing a mistyped OSCA number should not have to revoke first, and
 * re-enrolling someone already on the list is not an error worth a 409.
 */
staffRouter.post('/requests/:id/programs', async (req, res) => {
  const parsed = grantSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const user = req.user!

  if (!mayAdministerPrograms(user.role, user.departments)) {
    return res.status(403).json({
      error: 'Only the social welfare office can record programme membership.',
    })
  }

  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const program = await one<{ name: string; issuing_office: string; expires: boolean }>(
    `select name, issuing_office, expires from sectoral_programs where code = $1`,
    [parsed.data.code]
  )
  if (!program) return res.status(404).json({ error: 'Unknown programme.' })
  if (!program.expires && parsed.data.validUntil) {
    return res.status(400).json({ error: `${program.name} records do not expire.` })
  }

  const notice: NotificationInput = {
    userId: row.resident_id,
    requestId: null,
    kind: 'program_granted',
    ...programNoticeFor('granted', program.name, program.issuing_office),
  }

  const programs = await transaction(async (client) => {
    await client.query(
      `insert into resident_programs
         (user_id, program_code, reference_no, valid_until, granted_by, note)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, program_code) do update set
         reference_no = excluded.reference_no,
         valid_until = excluded.valid_until,
         granted_by = excluded.granted_by,
         granted_at = now(),
         note = excluded.note`,
      [
        row.resident_id, parsed.data.code, parsed.data.referenceNo ?? null,
        parsed.data.validUntil ?? null, user.id, parsed.data.note ?? null,
      ]
    )
    await recordNotification(client, notice)
    return listResidentProgramsIn(client, row.resident_id)
  })
  void deliverNotification(notice)

  res.json({ programs })
})

/** Remove a record — a lapsed registration, or one entered against the wrong person. */
staffRouter.delete('/requests/:id/programs/:code', async (req, res) => {
  const user = req.user!
  if (!mayAdministerPrograms(user.role, user.departments)) {
    return res.status(403).json({
      error: 'Only the social welfare office can record programme membership.',
    })
  }

  const row = await loadForStaff(req.params.id, user.departments, user.role === 'admin')
  if (!row) return res.status(404).json({ error: 'Request not found.' })

  const program = await one<{ name: string; issuing_office: string }>(
    `select name, issuing_office from sectoral_programs where code = $1`,
    [req.params.code]
  )
  if (!program) return res.status(404).json({ error: 'Unknown programme.' })

  const notice: NotificationInput = {
    userId: row.resident_id,
    requestId: null,
    kind: 'program_revoked',
    ...programNoticeFor('revoked', program.name, program.issuing_office),
  }

  const result = await transaction(async (client) => {
    const deleted = await client.query(
      `delete from resident_programs where user_id = $1 and program_code = $2`,
      [row.resident_id, req.params.code]
    )
    // Nothing to tell the resident about if they were never on the list.
    if (deleted.rowCount === 0) return null
    await recordNotification(client, notice)
    return listResidentProgramsIn(client, row.resident_id)
  })

  if (!result) return res.status(404).json({ error: 'That resident is not on this programme.' })
  void deliverNotification(notice)
  res.json({ programs: result })
})

// ---------------------------------------------------------------------------
// Checking a digital ID at the counter
//
// Any office can check one — a clerk anywhere needs to know whether the senior
// citizen discount in front of them is real. What comes back is scoped to that
// question and no wider: a face to compare, a name, where they live, and the
// entitlements that are live right now. Not an email, not a phone number, not
// a request history, and not a PhilSys number in full.
//
// This is not a directory. The only way in is a code the resident chose to
// show, which dies in ninety seconds and works once — so a check is something
// the resident initiated, not something staff can go browsing for.
// ---------------------------------------------------------------------------

const verifyIdSchema = z.object({ code: z.string().min(4).max(40) })

staffRouter.post('/verify-id', async (req, res) => {
  const parsed = verifyIdSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter the code shown on the resident\'s ID.' })

  const outcome = await consumeVerificationCode(parsed.data.code, req.user!.id)

  if (outcome.status !== 'valid') {
    // Logged because a clerk working through guesses is worth seeing.
    console.warn(`id verification ${outcome.status} by staff ${req.user!.id}`)
    const message = {
      unknown: 'That code is not valid. Ask the resident to read it again from their ID.',
      expired: 'That code has expired. Ask the resident to show the current one.',
      used: 'That code has already been checked. Ask the resident for a fresh one.',
    }[outcome.status]
    return res.status(outcome.status === 'unknown' ? 404 : 409).json({
      error: message,
      outcome: outcome.status,
    })
  }

  const resident = await one<{
    full_name: string; barangay: string | null; municipality: string | null
    province: string | null; philsys_id: string | null; has_photo: boolean
  }>(
    `select u.full_name, rp.barangay, rp.municipality, rp.province, rp.philsys_id,
            rp.photo_key is not null as has_photo
       from users u
       left join resident_profiles rp on rp.user_id = u.id
      where u.id = $1 and u.deactivated_at is null`,
    [outcome.userId]
  )
  if (!resident) return res.status(404).json({ error: 'That account is no longer active.' })

  res.json({
    outcome: 'valid',
    residentId: outcome.userId,
    fullName: resident.full_name,
    barangay: resident.barangay,
    municipality: resident.municipality,
    province: resident.province,
    // Last four only: enough to match against a physical card, useless to copy.
    philSysLast4: resident.philsys_id ? resident.philsys_id.replace(/\D/g, '').slice(-4) : null,
    hasPhoto: resident.has_photo,
    // The live record, not whatever the card was showing when it was screenshotted.
    programs: await listResidentPrograms(outcome.userId),
    checkedAt: new Date().toISOString(),
  })
})

/**
 * The face, for the one check just performed. Reachable only with a
 * verification the caller themselves consumed in the last few minutes, so a
 * staff member cannot browse portraits — they can only look at the person who
 * just showed them a code.
 */
staffRouter.get('/verify-id/:residentId/photo', async (req, res) => {
  const allowed = await one<{ id: string }>(
    `select id from id_verifications
      where user_id = $1 and verified_by = $2
        and consumed_at > now() - interval '5 minutes'
      limit 1`,
    [req.params.residentId, req.user!.id]
  )
  if (!allowed) return res.status(404).json({ error: 'No recent verification for that resident.' })

  const row = await one<{ photo_key: string | null; photo_type: string | null }>(
    `select photo_key, photo_type from resident_profiles where user_id = $1`,
    [req.params.residentId]
  )
  if (!row?.photo_key) return res.status(404).json({ error: 'No photo on file.' })

  let content: Buffer
  try {
    content = await getFile(row.photo_key)
  } catch {
    return res.status(410).json({ error: 'That photo is no longer available.' })
  }
  res.setHeader('Content-Type', row.photo_type ?? 'image/jpeg')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(content)
})

// ---------------------------------------------------------------------------
// Reports
//
// Scoped like the queue: an office sees its own work, an administrator sees
// every office. Reporting is reading, so there is no separate permission —
// but a clerk must not be able to read another department's numbers by asking
// for them, so the scope is applied server-side and not taken from the query.
// ---------------------------------------------------------------------------

const reportSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  departmentId: z.string().max(40).optional(),
  format: z.enum(['json', 'csv']).optional(),
})

staffRouter.get('/reports', async (req, res) => {
  const parsed = reportSchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Give a from and to date, as YYYY-MM-DD.' })
  }
  const { from, to, departmentId, format } = parsed.data
  const user = req.user!
  const isAdmin = user.role === 'admin'

  if (from > to) return res.status(400).json({ error: 'The start date is after the end date.' })
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (span > MAX_PERIOD_DAYS) {
    return res.status(400).json({ error: 'Reports cover at most one year at a time.' })
  }

  // A named department must be one the caller actually serves.
  if (departmentId && !isAdmin && !user.departments.includes(departmentId)) {
    return res.status(403).json({ error: 'You are not assigned to that office.' })
  }
  if (!isAdmin && user.departments.length === 0) {
    return res.status(403).json({ error: 'Your account is not assigned to an office yet.' })
  }

  const scope = departmentId ? [departmentId] : user.departments
  const report = await buildReport({
    from,
    to,
    departments: scope,
    all: isAdmin && !departmentId,
  })

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="elgu-report-${from}-to-${to}.csv"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.send(toCsv(report))
  }

  res.json(report)
})

// ---------------------------------------------------------------------------
// The counter's day
//
// One office, one day, in time order. This is what a clerk works from at the
// window, so it carries the queue number, who is expected and what for — and
// nothing else about the resident, which is the same rule the ID check follows.
// ---------------------------------------------------------------------------

const APPOINTMENT_STATUSES = { arrived: 'arrived', served: 'served', 'no-show': 'no_show' } as const

staffRouter.get('/appointments', async (req, res) => {
  const user = req.user!
  const date = String(req.query.date ?? officeToday())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Give a date as YYYY-MM-DD.' })
  }
  const wanted = req.query.departmentId ? String(req.query.departmentId) : ''
  const isAdmin = user.role === 'admin'
  if (wanted && !isAdmin && !user.departments.includes(wanted)) {
    return res.status(403).json({ error: 'You are not assigned to that office.' })
  }
  const scope = wanted ? [wanted] : user.departments

  const rows = await query(
    `select ${APPOINTMENT_SELECT}, s.name as "serviceName", d.office_name as "officeName",
            u.full_name as "residentName", r.reference_no as "referenceNo"
       from appointments a
       join services s on s.id = a.service_id
       join departments d on d.id = a.department_id
       join users u on u.id = a.resident_id
       left join requests r on r.id = a.request_id
      where a.scheduled_on = $1
        and ($2::boolean or a.department_id = any($3::text[]))
      order by a.start_time, a.queue_no`,
    [date, isAdmin && !wanted, scope]
  )
  res.json({ date, appointments: rows })
})

/**
 * What happened at the window.
 *
 * `arrived` is the resident presenting themselves; `served` and `no_show` close
 * the visit. A booking already closed is not reopened here — the record of what
 * happened at a counter should not be quietly rewritten later in the day.
 */
staffRouter.post('/appointments/:id/:action', async (req, res) => {
  const action = req.params.action as keyof typeof APPOINTMENT_STATUSES
  const status = APPOINTMENT_STATUSES[action]
  if (!status) return res.status(404).json({ error: 'Not found.' })
  const user = req.user!

  const outcome = await transaction(async (client) => {
    const found = await client.query<{ status: string; department_id: string }>(
      `select status, department_id from appointments where id = $1 for update`,
      [req.params.id]
    )
    if (found.rowCount === 0) return { code: 404, error: 'Appointment not found.' }
    const row = found.rows[0]!
    if (user.role !== 'admin' && !user.departments.includes(row.department_id)) {
      // Not found rather than forbidden: another office's day is not this
      // clerk's to learn the shape of.
      return { code: 404, error: 'Appointment not found.' }
    }
    if (row.status === 'cancelled') return { code: 409, error: 'That appointment was cancelled.' }
    if (row.status === 'served' || row.status === 'no_show') {
      return { code: 409, error: `That visit is already closed as ${row.status.replace('_', ' ')}.` }
    }
    const { rows } = await client.query(
      `update appointments
          set status = $2,
              arrived_at = case when $2 = 'arrived' then now() else arrived_at end,
              closed_at  = case when $2 in ('served', 'no_show') then now() else closed_at end
        where id = $1
      returning ${APPOINTMENT_SELECT.replace(/a\./g, '')}`,
      [req.params.id, status]
    )
    return { appointment: rows[0] }
  })

  if ('error' in outcome) return res.status(outcome.code!).json({ error: outcome.error })
  res.json(outcome.appointment)
})

// ---------------------------------------------------------------------------
// Complaints
//
// The RA 11032 mechanism from the office's side. Oldest first, because a
// complaint that has been waiting longest is the one to answer next, and each
// carries the working-day deadline it was given when it was filed.
// ---------------------------------------------------------------------------

staffRouter.get('/complaints', async (req, res) => {
  const user = req.user!
  const isAdmin = user.role === 'admin'
  const wanted = req.query.departmentId ? String(req.query.departmentId) : ''
  if (wanted && !isAdmin && !user.departments.includes(wanted)) {
    return res.status(403).json({ error: 'You are not assigned to that office.' })
  }
  const status = req.query.status === 'answered' ? 'answered' : req.query.status === 'open' ? 'open' : null
  const scope = wanted ? [wanted] : user.departments

  res.json(
    await query(
      `select ${COMPLAINT_SELECT}, d.office_name as "officeName",
              u.full_name as "residentName", r.reference_no as "requestRef",
              (c.status = 'open' and c.due_on < current_date) as overdue
         from complaints c
         join departments d on d.id = c.department_id
         join users u on u.id = c.resident_id
         left join requests r on r.id = c.request_id
        where ($1::boolean or c.department_id = any($2::text[]))
          and ($3::text is null or c.status = $3)
        order by c.status = 'answered', c.created_at`,
      [isAdmin && !wanted, scope, status]
    )
  )
})

const responseBody = z.object({ response: z.string().trim().min(1).max(4000) })

staffRouter.post('/complaints/:id/respond', async (req, res) => {
  const parsed = responseBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Write a reply before sending it.' })
  const user = req.user!

  const outcome = await transaction(async (client) => {
    const found = await client.query<{
      department_id: string; status: string; reference_no: string; resident_id: string; request_id: string | null
    }>(
      `select department_id, status, reference_no, resident_id, request_id
         from complaints where id = $1 for update`,
      [req.params.id]
    )
    if (found.rowCount === 0) return { code: 404, error: 'Complaint not found.' }
    const row = found.rows[0]!
    if (user.role !== 'admin' && !user.departments.includes(row.department_id)) {
      // Not found, not forbidden: another office's complaints are not this
      // clerk's to learn the shape of.
      return { code: 404, error: 'Complaint not found.' }
    }
    // A reply already given stands. Editing it after the fact would let an
    // office quietly rewrite what it told a resident.
    if (row.status === 'answered') return { code: 409, error: 'That complaint has already been answered.' }

    const { rows } = await client.query(
      `update complaints
          set status = 'answered', response = $2, responded_by = $3, responded_at = now()
        where id = $1 returning ${COMPLAINT_SELECT.replace(/c\./g, '')}`,
      [req.params.id, parsed.data.response, user.id]
    )
    const office = await client.query<{ office_name: string }>(
      `select office_name from departments where id = $1`, [row.department_id]
    )
    const notice: NotificationInput = {
      userId: row.resident_id,
      requestId: row.request_id,
      kind: 'complaint_answered',
      title: `Complaint ${row.reference_no} — answered`,
      body: `${office.rows[0]?.office_name ?? 'The office'} has replied to your complaint (${row.reference_no}). Read it in the app.`,
    }
    await recordNotification(client, notice)
    return { complaint: rows[0], notice }
  })

  if ('error' in outcome) return res.status(outcome.code!).json({ error: outcome.error })
  void deliverNotification(outcome.notice!)
  res.json(outcome.complaint)
})
