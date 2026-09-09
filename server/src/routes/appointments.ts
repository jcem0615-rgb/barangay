import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { loadHolidays } from '../schedule.ts'
import {
  APPOINTMENT_SELECT, addDays, bookingRules, checkBookable, dayClosedReason,
  nextQueueNo, officeToday, slotsFor,
} from '../appointments.ts'
import { deliverNotification, recordNotification, type NotificationInput } from '../notifications.ts'

export const appointmentsRouter = Router()
appointmentsRouter.use(authenticate, requireRole('resident'))

/**
 * Booking a slot at the counter.
 *
 * Every rule that decides whether a slot exists lives on the server. The client
 * greys out what it can, but nothing stops a caller POSTing straight past the
 * picker, and an office that has been oversold discovers it with a queue of
 * people in front of it.
 */

const bookBody = z.object({
  serviceId: z.string().min(1).max(60),
  scheduledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give a date as YYYY-MM-DD.'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Give a time as HH:MM.'),
  requestId: z.uuid().optional(),
  note: z.string().trim().max(300).optional(),
})

const serviceRow = (id: string) =>
  one<{ id: string; name: string; department_id: string }>(
    `select id, name, department_id from services where id = $1 and active = true`,
    [id]
  )

const officeNameFor = async (departmentId: string) =>
  (await one<{ office_name: string }>(
    `select office_name from departments where id = $1`, [departmentId]
  ))?.office_name ?? 'The municipal office'

/** A resident's own appointments: what is coming, then what has been. */
appointmentsRouter.get('/', async (req, res) => {
  res.json(
    await query(
      `select ${APPOINTMENT_SELECT}, s.name as "serviceName", d.office_name as "officeName",
              d.address as "officeAddress"
         from appointments a
         join services s on s.id = a.service_id
         join departments d on d.id = a.department_id
        where a.resident_id = $1
        order by a.scheduled_on desc, a.start_time desc`,
      [req.user!.id]
    )
  )
})

/**
 * Which days an office is open for booking, across its horizon.
 *
 * Returned as a list rather than left to the client to work out, because the
 * rule is "weekends, plus the holidays table" and the client does not hold the
 * office's hours or horizon. A closed day carries the reason so the picker can
 * say why rather than simply refusing.
 */
appointmentsRouter.get('/days', async (req, res) => {
  const departmentId = String(req.query.departmentId ?? '')
  const rules = await bookingRules(departmentId)
  if (!rules) return res.status(404).json({ error: 'Office not found.' })

  const holidays = await loadHolidays()
  const today = officeToday()
  const days: Array<{ date: string; open: boolean; reason: string | null }> = []
  for (let i = 0; i <= rules.horizonDays; i++) {
    const date = addDays(today, i)
    const reason = rules.enabled
      ? await dayClosedReason(date, holidays)
      : 'This office is not taking appointments at the moment.'
    days.push({ date, open: reason === null, reason })
  }
  res.json({ office: rules, days })
})

/** The times on one day, and how full each one is. */
appointmentsRouter.get('/availability', async (req, res) => {
  const departmentId = String(req.query.departmentId ?? '')
  const date = String(req.query.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Give a date as YYYY-MM-DD.' })
  }
  const rules = await bookingRules(departmentId)
  if (!rules) return res.status(404).json({ error: 'Office not found.' })
  res.json({ date, ...(await slotsFor(rules, date)) })
})

appointmentsRouter.post('/', async (req, res) => {
  const parsed = bookBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the booking.' })
  }
  const { serviceId, scheduledOn, startTime, requestId, note } = parsed.data
  const resident = req.user!

  const service = await serviceRow(serviceId)
  if (!service) return res.status(404).json({ error: 'Service not found.' })

  const rules = await bookingRules(service.department_id)
  if (!rules) return res.status(404).json({ error: 'That office is not taking appointments.' })

  const when = checkBookable(rules, scheduledOn, startTime)
  if (when) return res.status(400).json({ error: when })

  const closed = await dayClosedReason(scheduledOn)
  if (closed) return res.status(400).json({ error: closed })

  const outcome = await transaction(async (client) => {
    // Locking the office's own row serialises booking for that office, which
    // is what stops two residents tapping at the same moment from both taking
    // the last place in a slot. Coarse — it serialises the whole office rather
    // than the one slot — but a municipal counter books a handful a minute, and
    // an oversold slot is discovered with people standing in front of it.
    await client.query(`select 1 from office_booking where department_id = $1 for update`, [
      service.department_id,
    ])

    const taken = await client.query<{ n: string }>(
      `select count(*) as n from appointments
        where department_id = $1 and scheduled_on = $2 and start_time = $3 and status <> 'cancelled'`,
      [service.department_id, scheduledOn, startTime]
    )
    if (Number(taken.rows[0]!.n) >= rules.capacity) {
      return { error: 'That time has just been taken. Please choose another.' as const }
    }

    // One live booking per resident per office. Without it a resident books
    // four slots to keep their options open and the office spends the morning
    // calling empty numbers.
    const existing = await client.query<{ queue_no: string; scheduled_on: string }>(
      `select queue_no, scheduled_on::text as scheduled_on from appointments
        where resident_id = $1 and department_id = $2
          and status in ('booked', 'arrived') and scheduled_on >= $3`,
      [resident.id, service.department_id, officeToday()]
    )
    if (existing.rowCount! > 0) {
      const clash = existing.rows[0]!
      return {
        error:
          `You already have an appointment at this office on ${clash.scheduled_on} ` +
          `(${clash.queue_no}). Cancel it first if you need a different time.`,
      }
    }

    // A request, if named, has to be the resident's own — an appointment is not
    // a way to ask about somebody else's permit.
    if (requestId) {
      const owned = await client.query(
        `select 1 from requests where id = $1 and resident_id = $2`, [requestId, resident.id]
      )
      if (owned.rowCount === 0) return { error: 'Request not found.' as const }
    }

    const queueNo = await nextQueueNo(client, service.department_id, scheduledOn)
    const { rows } = await client.query(
      `insert into appointments
         (resident_id, department_id, service_id, request_id, scheduled_on, start_time, queue_no, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning ${APPOINTMENT_SELECT.replace(/a\./g, '')}`,
      [resident.id, service.department_id, serviceId, requestId ?? null, scheduledOn, startTime, queueNo, note ?? null]
    )

    const officeName = await officeNameFor(service.department_id)
    const notice: NotificationInput = {
      userId: resident.id,
      requestId: requestId ?? null,
      kind: 'appointment_booked',
      title: `${service.name} — appointment booked`,
      body:
        `You are booked at ${officeName} on ${scheduledOn} at ${startTime}. ` +
        `Your queue number is ${queueNo}. Bring a valid ID, and your digital ID open at its verification code.`,
    }
    await recordNotification(client, notice)
    return { appointment: rows[0], notice }
  })

  if ('error' in outcome) return res.status(409).json({ error: outcome.error })
  void deliverNotification(outcome.notice)
  res.status(201).json(outcome.appointment)
})

appointmentsRouter.delete('/:id', async (req, res) => {
  const outcome = await transaction(async (client) => {
    const found = await client.query<{ status: string; queue_no: string; department_id: string; scheduled_on: string }>(
      `select status, queue_no, department_id, scheduled_on::text as scheduled_on
         from appointments where id = $1 and resident_id = $2 for update`,
      [req.params.id, req.user!.id]
    )
    if (found.rowCount === 0) return { code: 404, error: 'Appointment not found.' }
    const row = found.rows[0]!
    // A visit that already happened is history, not a booking. Cancelling it
    // would quietly rewrite what the office recorded at the window.
    if (row.status !== 'booked') {
      return { code: 409, error: `That appointment is already marked ${row.status.replace('_', ' ')}.` }
    }
    await client.query(
      `update appointments set status = 'cancelled', cancelled_at = now() where id = $1`,
      [req.params.id]
    )
    const notice: NotificationInput = {
      userId: req.user!.id,
      requestId: null,
      kind: 'appointment_cancelled',
      title: 'Appointment cancelled',
      body:
        `Your appointment at ${await officeNameFor(row.department_id)} on ${row.scheduled_on} ` +
        `(${row.queue_no}) has been cancelled. The slot is free for someone else.`,
    }
    await recordNotification(client, notice)
    return { notice }
  })

  if ('error' in outcome) return res.status(outcome.code!).json({ error: outcome.error })
  void deliverNotification(outcome.notice!)
  res.status(204).end()
})
