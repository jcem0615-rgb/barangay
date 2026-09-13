import type { PoolClient } from 'pg'
import { query } from './db.ts'
import { loadHolidays } from './schedule.ts'

/**
 * Booking a slot at the counter.
 *
 * The app saves a resident the paperwork; this is what saves them the queue.
 * The whole model is one constraint — an office can see so many people at once,
 * for so many hours, on the days the hall is open — so everything here is about
 * not promising a slot that does not exist.
 *
 * **The calendar is the same one as everywhere else.** A day the hall is shut
 * cannot be booked, which means weekends and the `holidays` table, exactly as
 * the expected-ready-date arithmetic reads them. Declaring a holiday in the
 * console closes booking on that day as a consequence rather than as a second
 * thing to remember.
 */

/** Philippine local time. Every date here is a day on the hall's own calendar. */
const TIME_ZONE = 'Asia/Manila'

/**
 * Today, where the office is.
 *
 * The server's clock may be anywhere. "Is this date in the past" has to be
 * answered on the municipality's calendar or a resident in Manila is told at
 * 9am that today is no longer bookable because the server is already on
 * tomorrow — or worse, offered a slot that has been and gone.
 */
export function officeToday(now = new Date()): string {
  // en-CA renders as YYYY-MM-DD, which is the shape everything else uses.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

/** The office's current wall-clock time, as minutes since midnight. */
export function officeMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
  const [h, m] = parts.split(':').map(Number)
  return h! * 60 + m!
}

export interface BookingRules {
  departmentId: string
  enabled: boolean
  opens: string
  closes: string
  slotMinutes: number
  capacity: number
  horizonDays: number
}

export interface Slot {
  startTime: string
  booked: number
  capacity: number
  /** False when the slot is full, already past, or the office is closed that day. */
  available: boolean
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export async function bookingRules(departmentId: string): Promise<BookingRules | null> {
  const rows = await query<BookingRules>(
    `select department_id as "departmentId", enabled,
            to_char(opens, 'HH24:MI') as opens, to_char(closes, 'HH24:MI') as closes,
            slot_minutes as "slotMinutes", capacity, horizon_days as "horizonDays"
       from office_booking where department_id = $1`,
    [departmentId]
  )
  return rows[0] ?? null
}

/** Adds days to a plain YYYY-MM-DD without dragging a timezone into it. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const isWeekend = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/** Why a day cannot be booked, in the words a resident should be told. */
export async function dayClosedReason(date: string, holidays?: Set<string>): Promise<string | null> {
  const days = holidays ?? (await loadHolidays())
  if (isWeekend(date)) return 'The hall is closed at weekends.'
  if (days.has(date)) return 'The hall is closed that day.'
  return null
}

/**
 * The slots on one day, with how full each one is.
 *
 * A slot in the past on today's date is offered as unavailable rather than
 * hidden: a resident looking at 9am wants to see that the 8:30 has gone, not to
 * wonder whether the office starts at nine.
 */
export async function slotsFor(
  rules: BookingRules, date: string, holidays?: Set<string>
): Promise<{ slots: Slot[]; closedReason: string | null }> {
  const closedReason = rules.enabled
    ? await dayClosedReason(date, holidays)
    : 'This office is not taking appointments at the moment.'

  const counts = new Map<string, number>()
  if (!closedReason) {
    const rows = await query<{ start_time: string; n: string }>(
      `select to_char(start_time, 'HH24:MI') as start_time, count(*) as n
         from appointments
        where department_id = $1 and scheduled_on = $2 and status <> 'cancelled'
        group by start_time`,
      [rules.departmentId, date]
    )
    for (const row of rows) counts.set(row.start_time, Number(row.n))
  }

  const today = officeToday()
  const nowMinutes = officeMinutesNow()
  const slots: Slot[] = []
  for (let m = toMinutes(rules.opens); m + rules.slotMinutes <= toMinutes(rules.closes); m += rules.slotMinutes) {
    const startTime = toTime(m)
    const booked = counts.get(startTime) ?? 0
    const past = date < today || (date === today && m <= nowMinutes)
    slots.push({
      startTime,
      booked,
      capacity: rules.capacity,
      available: !closedReason && !past && booked < rules.capacity,
    })
  }
  return { slots, closedReason }
}

/**
 * Whether the *day* can be booked at all — before anything is asked about the
 * time. Order matters here: a resident who picks a Saturday should be told the
 * hall is shut, not that 8am has already gone. The more fundamental fact wins.
 */
export function checkBookableDate(rules: BookingRules, date: string): string | null {
  if (!rules.enabled) return 'This office is not taking appointments at the moment.'
  const today = officeToday()
  if (date < today) return 'That day has already passed.'
  if (date > addDays(today, rules.horizonDays)) {
    return `This office takes bookings up to ${rules.horizonDays} days ahead.`
  }
  return null
}

/** And whether the time falls on one of the office's slots, on a day already known to be open. */
export function checkBookableTime(rules: BookingRules, date: string, startTime: string): string | null {
  const minutes = toMinutes(startTime)
  if (minutes < toMinutes(rules.opens) || minutes + rules.slotMinutes > toMinutes(rules.closes)) {
    return 'The office is not open at that time.'
  }
  if ((minutes - toMinutes(rules.opens)) % rules.slotMinutes !== 0) {
    return 'That is not one of the office’s appointment times.'
  }
  if (date === officeToday() && minutes <= officeMinutesNow()) return 'That time has already passed today.'
  return null
}

const PREFIX: Record<string, string> = {
  bpls: 'BOSS', cswdo: 'CSWDO', lcr: 'LCR', treasury: 'MTO', obo: 'OBO', health: 'MHO',
}

/**
 * The next queue number for an office on a day.
 *
 * Drawn from a counter rather than counting the day's rows, so a cancellation
 * never hands the same number to somebody else. Two people answering to MTO-007
 * on one morning is the exact confusion a queue number exists to prevent.
 */
export async function nextQueueNo(
  client: PoolClient, departmentId: string, date: string
): Promise<string> {
  const { rows } = await client.query<{ issued: number }>(
    `insert into appointment_counters (department_id, on_date, issued)
     values ($1, $2, 1)
     on conflict (department_id, on_date)
       do update set issued = appointment_counters.issued + 1
     returning issued`,
    [departmentId, date]
  )
  return `${PREFIX[departmentId] ?? 'LGU'}-${String(rows[0]!.issued).padStart(3, '0')}`
}

export const APPOINTMENT_SELECT = `
  a.id, a.department_id as "departmentId", a.service_id as "serviceId",
  a.request_id as "requestId", a.scheduled_on::text as "scheduledOn",
  to_char(a.start_time, 'HH24:MI') as "startTime", a.queue_no as "queueNo",
  a.status, a.note, a.created_at as "createdAt"
`
