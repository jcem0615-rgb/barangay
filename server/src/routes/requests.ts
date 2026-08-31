import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { REQUEST_SELECT, serializeRequest, type RequestRow } from '../serialize.ts'
import { DEPARTMENT_PREFIX, STEP_ASSESSMENT, STEP_RELEASE, makeReferenceNo } from '../workflow.ts'

export const requestsRouter = Router()
requestsRouter.use(authenticate, requireRole('resident'))

/** Generous enough for a long address or narrative, short of an abuse vector. */
const MAX_FIELD_LENGTH = 2000

const createSchema = z.object({
  serviceId: z.string().min(1),
  formValues: z.record(z.string(), z.string()).default({}),
  /** Set when the resident filled this in offline and it synced later. */
  submittedOfflineAt: z.iso.datetime().optional(),
})

requestsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const { serviceId, formValues, submittedOfflineAt } = parsed.data

  const service = await one<{
    id: string; department_id: string; fee_centavos: number
    fields: Array<{ id: string }>
  }>(
    `select id, department_id, fee_centavos, fields
       from services where id = $1 and active = true`,
    [serviceId]
  )
  if (!service) return res.status(404).json({ error: 'That service is no longer offered.' })

  // Only the fields this service actually declares are stored. Without this a
  // caller could attach arbitrary keys, which staff would then be shown as if
  // the resident had filled them in.
  const declared = new Set(service.fields.map((f) => f.id))
  const unknown = Object.keys(formValues).filter((k) => !declared.has(k))
  if (unknown.length > 0) {
    return res.status(400).json({ error: `Unexpected field: ${unknown[0]}` })
  }
  const tooLong = Object.entries(formValues).find(([, v]) => v.length > MAX_FIELD_LENGTH)
  if (tooLong) {
    return res.status(400).json({ error: `${tooLong[0]} is too long (max ${MAX_FIELD_LENGTH} characters).` })
  }

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
    return row
  })

  const withName = await one<RequestRow>(
    `select ${REQUEST_SELECT} from requests r join services s on s.id = r.service_id where r.id = $1`,
    [created.id]
  )
  res.status(201).json(serializeRequest(withName!))
})

requestsRouter.get('/', async (req, res) => {
  const rows = await query<RequestRow>(
    `select ${REQUEST_SELECT}
       from requests r join services s on s.id = r.service_id
      where r.resident_id = $1
      order by r.submitted_at desc`,
    [req.user!.id]
  )
  res.json(rows.map(serializeRequest))
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
  res.json({ ...serializeRequest(row), events })
})

const paySchema = z.object({ method: z.enum(['GCash', 'Maya', 'Landbank Online']) })

requestsRouter.post('/:id/pay', async (req, res) => {
  const parsed = paySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a payment method.' })

  const row = await one<RequestRow>(
    `select * from requests where id = $1 and resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Request not found.' })
  if (row.paid) return res.status(409).json({ error: 'This request is already paid.' })
  if (row.current_step_index < STEP_ASSESSMENT) {
    return res.status(409).json({ error: 'Wait for the treasury assessment before paying.' })
  }

  const updated = await transaction(async (client) => {
    const result = await client.query<RequestRow>(
      `update requests
          set paid = true, payment_method = $2, status = 'in_progress',
              current_step_index = $3, updated_at = now()
        where id = $1
        returning *`,
      [row.id, parsed.data.method, STEP_RELEASE]
    )
    await client.query(
      `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
       values ($1, $2, 'paid', $3, $4, $5)`,
      [row.id, req.user!.id, row.current_step_index, STEP_RELEASE, `Paid via ${parsed.data.method}`]
    )
    return result.rows[0]!
  })

  const withName = await one<RequestRow>(
    `select ${REQUEST_SELECT} from requests r join services s on s.id = r.service_id where r.id = $1`,
    [updated.id]
  )
  res.json(serializeRequest(withName!))
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
