/**
 * Working-day arithmetic for the "ready by" estimate.
 *
 * Deliberately parallel to `server/src/schedule.ts`, and only used for the one
 * thing the server cannot answer: what a resident would be quoted if they
 * applied *right now*, on the form, before any request exists. Every estimate
 * on a real request comes from the server, which is the only place that knows
 * when the office actually took the work on.
 *
 * The holiday calendar itself is not duplicated — it comes from `/api/catalogue`.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const isWorkingDay = (d: Date, holidays: Set<string>) =>
  d.getDay() !== 0 && d.getDay() !== 6 && !holidays.has(iso(d))

export function addWorkingDays(start: Date, days: number, holidays: Set<string>): string {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  // A form opened on a Saturday is not looked at until Monday.
  while (!isWorkingDay(cursor, holidays)) cursor.setDate(cursor.getDate() + 1)

  let remaining = days
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1)
    if (isWorkingDay(cursor, holidays)) remaining -= 1
  }
  return iso(cursor)
}

/** A plain YYYY-MM-DD carries no timezone, so it must not be shifted by one. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/**
 * "Sep 10 – 14, 2026", collapsing the parts both ends share, and just
 * "Sep 10, 2026" when the range is a single day.
 */
export function formatReadyRange(from: string, to: string, locale = 'en-PH'): string {
  const a = parseDay(from)
  const b = parseDay(to)
  const year = b.getFullYear()

  if (from === to) {
    return a.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    const month = a.toLocaleDateString(locale, { month: 'short' })
    return `${month} ${a.getDate()} – ${b.getDate()}, ${year}`
  }
  const left = a.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  const right = b.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  return `${left} – ${right}, ${year}`
}

/**
 * How long an office says a service takes, in the resident's language.
 *
 * `processingTime` on the catalogue is the same promise as prose, authored in
 * English, and it is the one piece of service text that is purely a duration
 * rather than the name of anything — so it is the one that can be rendered from
 * `processingDaysMin`/`Max` instead of translated. Doing that also retires a
 * hand-maintained invariant: the prose and the numbers said the same thing twice
 * and nothing checked they agreed.
 */
export function formatProcessingTime(
  min: number,
  max: number,
  t: (key: 'time.sameDay' | 'time.day' | 'time.days' | 'time.range', vars?: Record<string, string>) => string
): string {
  if (max <= 0) return t('time.sameDay')
  if (min === max) {
    return min === 1 ? t('time.day', { n: '1' }) : t('time.days', { n: String(max) })
  }
  return t('time.range', { min: String(min), max: String(max) })
}
