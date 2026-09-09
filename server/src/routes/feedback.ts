import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { addWorkingDays, loadHolidays } from '../schedule.ts'
import {
  COMPLAINT_CATEGORIES, COMPLAINT_RESPONSE_DAYS, COMPLAINT_SELECT, nextComplaintRef,
} from '../feedback.ts'
import { deliverNotification, recordNotification, type NotificationInput } from '../notifications.ts'

export const feedbackRouter = Router()
feedbackRouter.use(authenticate, requireRole('resident'))

/**
 * How a transaction went, and what to do when it went badly.
 *
 * Rating a request requires having actually had one, and it has to be the
 * resident's own and finished — a score on a transaction that never happened,
 * or that the office is still working on, measures nothing.
 */

const ratingBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
})

feedbackRouter.get('/', async (req, res) => {
  res.json(
    await query(
      `select f.request_id as "requestId", f.rating, f.comment, f.created_at as "createdAt"
         from feedback f where f.resident_id = $1 order by f.created_at desc`,
      [req.user!.id]
    )
  )
})

feedbackRouter.put('/:requestId', async (req, res) => {
  const parsed = ratingBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Give a rating between 1 and 5.' })
  }
  const request = await one<{ id: string; status: string }>(
    `select id, status from requests where id = $1 and resident_id = $2`,
    [req.params.requestId, req.user!.id]
  )
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.status !== 'completed' && request.status !== 'rejected') {
    return res.status(409).json({ error: 'You can rate this once the office has finished with it.' })
  }

  const rows = await query(
    `insert into feedback (request_id, resident_id, rating, comment)
     values ($1, $2, $3, $4)
     on conflict (request_id) do update set rating = excluded.rating, comment = excluded.comment
     returning request_id as "requestId", rating, comment, created_at as "createdAt"`,
    [request.id, req.user!.id, parsed.data.rating, parsed.data.comment ?? null]
  )
  res.json(rows[0])
})

const complaintBody = z.object({
  departmentId: z.string().min(1).max(40),
  category: z.enum(COMPLAINT_CATEGORIES),
  body: z.string().trim().min(10, 'Say a little more about what happened.').max(4000),
  requestId: z.uuid().optional(),
})

feedbackRouter.get('/complaints', async (req, res) => {
  res.json(
    await query(
      `select ${COMPLAINT_SELECT}, d.office_name as "officeName"
         from complaints c join departments d on d.id = c.department_id
        where c.resident_id = $1 order by c.created_at desc`,
      [req.user!.id]
    )
  )
})

feedbackRouter.post('/complaints', async (req, res) => {
  const parsed = complaintBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the complaint.' })
  }
  const { departmentId, category, body, requestId } = parsed.data
  const office = await one<{ office_name: string }>(
    `select office_name from departments where id = $1`, [departmentId]
  )
  if (!office) return res.status(404).json({ error: 'Office not found.' })

  // The deadline is working days, over the same calendar as everything else —
  // an office is not late for a day the hall was shut.
  const dueOn = addWorkingDays(new Date(), COMPLAINT_RESPONSE_DAYS, await loadHolidays())

  const outcome = await transaction(async (client) => {
    if (requestId) {
      const owned = await client.query(
        `select 1 from requests where id = $1 and resident_id = $2`, [requestId, req.user!.id]
      )
      if (owned.rowCount === 0) return { error: 'Request not found.' }
    }
    const referenceNo = await nextComplaintRef(client, new Date().getUTCFullYear())
    const { rows } = await client.query(
      `insert into complaints (reference_no, resident_id, department_id, request_id, category, body, due_on)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${COMPLAINT_SELECT.replace(/c\./g, '')}`,
      [referenceNo, req.user!.id, departmentId, requestId ?? null, category, body, dueOn]
    )
    const notice: NotificationInput = {
      userId: req.user!.id,
      requestId: requestId ?? null,
      kind: 'complaint_filed',
      title: `Complaint filed — ${referenceNo}`,
      body:
        `${office.office_name} has your complaint (${referenceNo}). ` +
        `They are due to reply by ${dueOn}. You can follow it in the app.`,
    }
    await recordNotification(client, notice)
    return { complaint: rows[0], notice }
  })

  if ('error' in outcome) return res.status(404).json({ error: outcome.error })
  void deliverNotification(outcome.notice!)
  res.status(201).json(outcome.complaint)
})
