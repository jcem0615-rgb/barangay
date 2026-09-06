import { query } from './db.ts'

/**
 * When a document will be ready.
 *
 * Two things make this more than adding days to a date.
 *
 * **Working days.** A municipal hall quoting "3–5 working days" does not mean
 * calendar days. Adding five to a Thursday lands on a Tuesday, not a Sunday,
 * and skips whatever holidays fall in between — otherwise the app promises a
 * date on which the office is shut.
 *
 * **The clock is the office's, not the calendar's.** It runs while the office
 * holds the request and stops while the request is waiting on the resident to
 * pay. An office is not late because a permit sat unpaid for a week, and an
 * estimate that ignores that blames the office for the resident's own delay.
 */

/** Cached because it changes when someone reseeds, not between requests. */
let holidayCache: { at: number; days: Set<string> } | null = null
const CACHE_MS = 10 * 60 * 1000

export function clearHolidayCache(): void {
  holidayCache = null
}

async function holidaySet(): Promise<Set<string>> {
  if (holidayCache && Date.now() - holidayCache.at < CACHE_MS) return holidayCache.days
  const rows = await query<{ observed_on: string }>(
    `select observed_on::text as observed_on from holidays`
  )
  const days = new Set(rows.map((r) => r.observed_on))
  holidayCache = { at: Date.now(), days }
  return days
}

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** Saturday and Sunday, in UTC — the dates are compared as plain days. */
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

const isWorkingDay = (d: Date, holidays: Set<string>) => !isWeekend(d) && !holidays.has(iso(d))

/**
 * Adds `days` working days to `start`, as a counter clerk would count them:
 * "same day" (0) means the first working day on or after the start, and each
 * further day steps over weekends and holidays.
 */
export function addWorkingDays(start: Date, days: number, holidays: Set<string>): string {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))

  // A request filed on a Saturday is not looked at until Monday, so the count
  // begins on the first day the office is actually open.
  while (!isWorkingDay(cursor, holidays)) cursor.setUTCDate(cursor.getUTCDate() + 1)

  let remaining = days
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (isWorkingDay(cursor, holidays)) remaining -= 1
  }
  return iso(cursor)
}

export interface ReadyEstimate {
  /** Earliest and latest working day the office expects to release it. */
  expectedReady: { from: string; to: string } | null
  /** True when the estimate is paused because the resident still owes a fee. */
  awaitingResident: boolean
}

export interface EstimateInput {
  status: string
  paid: boolean
  requiresPayment: boolean
  submittedAt: Date
  paidAt: Date | null
  daysMin: number
  daysMax: number
}

/**
 * A closed request has no estimate — it either has its document or it does not,
 * and either way a projected date is noise.
 */
export async function estimateReady(input: EstimateInput): Promise<ReadyEstimate> {
  if (input.status === 'completed' || input.status === 'rejected') {
    return { expectedReady: null, awaitingResident: false }
  }

  // Waiting on the resident: quote no date rather than one the office cannot be
  // held to. The app says what is needed instead.
  if (input.requiresPayment && !input.paid) {
    return { expectedReady: null, awaitingResident: true }
  }

  // The clock starts when the office took the work on: at submission for a free
  // service, and at payment for one the resident had to settle first.
  const start = input.paidAt ?? input.submittedAt
  const holidays = await holidaySet()

  return {
    expectedReady: {
      from: addWorkingDays(start, input.daysMin, holidays),
      to: addWorkingDays(start, input.daysMax, holidays),
    },
    awaitingResident: false,
  }
}

/** For the service form: what a resident would be quoted if they applied now. */
export async function estimateForNewRequest(
  daysMin: number,
  daysMax: number
): Promise<{ from: string; to: string }> {
  const holidays = await holidaySet()
  const now = new Date()
  return {
    from: addWorkingDays(now, daysMin, holidays),
    to: addWorkingDays(now, daysMax, holidays),
  }
}
