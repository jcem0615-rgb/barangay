import { query } from './db.ts'
import { loadHolidays, workingDaysBetween } from './schedule.ts'

/**
 * What an office actually did, over a period.
 *
 * The hard part is not counting rows, it is deciding what "turnaround" means.
 * Two numbers are reported because they answer different questions and either
 * one alone is misleading:
 *
 *  - **Office days** run only while the office held the request — from the
 *    payment when a fee was due, from submission when none was. This is the
 *    office's own performance, and it is what a clerk should be measured on.
 *  - **Resident days** run from submission to release regardless. This is what
 *    the person waiting actually experienced.
 *
 * Reporting only the first flatters the office; reporting only the second
 * blames it for a permit that sat unpaid for a week. An LGU needs both, and a
 * gap between them is itself the finding: it means residents are slow to pay,
 * not that the office is slow to work.
 *
 * Medians, not averages: one permit stuck behind a missing document drags a
 * mean somewhere no clerk would recognise.
 */

/** A year at a time. Wide enough for an annual report, bounded enough to hold. */
export const MAX_PERIOD_DAYS = 366

export interface ReportRow {
  departmentId: string
  departmentName: string
  serviceId: string
  serviceName: string
  submitted: number
  completed: number
  rejected: number
  inProgress: number
  awaitingPayment: number
  /** Median working days the office held it, over completed requests. */
  medianOfficeDays: number | null
  /** Median working days from submission to release, as the resident felt it. */
  medianResidentDays: number | null
  /** The slowest tenth: what a complaint looks like. */
  p90OfficeDays: number | null
  /** Completed within the processing time the catalogue promises. */
  metTarget: number
  missedTarget: number
}

export interface ReportSummary {
  from: string
  to: string
  submitted: number
  completed: number
  rejected: number
  stillOpen: number
  medianOfficeDays: number | null
  medianResidentDays: number | null
  metTarget: number
  missedTarget: number
  /** Percentage released within the promised time, or null with nothing to judge. */
  onTimeRate: number | null
  /**
   * The RA 11032 side: how residents said it went, and what they complained
   * about. Null where nobody rated anything — an average of no ratings is not
   * a five, and a report that quietly renders one is worse than a blank.
   */
  ratings: number
  averageRating: number | null
  complaintsFiled: number
  complaintsAnswered: number
  complaintsOverdue: number
  rows: ReportRow[]
}

interface Row {
  department_id: string
  department_name: string
  service_id: string
  service_name: string
  status: string
  submitted_at: Date
  paid_at: Date | null
  released_at: Date | null
  processing_days_max: number
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** The value nine tenths of cases came in under. */
function percentile90(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]!
}

/**
 * `departments` scopes the report; an empty array with `all` true means every
 * office, which is what an administrator gets.
 */
export async function buildReport(opts: {
  from: string
  to: string
  departments: string[]
  all: boolean
}): Promise<ReportSummary> {
  const rows = await query<Row>(
    `select r.department_id, d.name as department_name,
            r.service_id, s.name as service_name,
            r.status, r.submitted_at, r.paid_at,
            (select max(e.created_at) from request_events e
              where e.request_id = r.id and e.event_type = 'released') as released_at,
            s.processing_days_max
       from requests r
       join services s on s.id = r.service_id
       join departments d on d.id = r.department_id
      where r.submitted_at >= $1::date
        and r.submitted_at < ($2::date + interval '1 day')
        and ($3::boolean or r.department_id = any($4::text[]))
      order by d.sort_order, s.name`,
    [opts.from, opts.to, opts.all, opts.departments]
  )

  const holidays = await loadHolidays()
  const grouped = new Map<string, { row: ReportRow; office: number[]; resident: number[] }>()

  for (const r of rows) {
    const key = `${r.department_id}:${r.service_id}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        row: {
          departmentId: r.department_id,
          departmentName: r.department_name,
          serviceId: r.service_id,
          serviceName: r.service_name,
          submitted: 0, completed: 0, rejected: 0, inProgress: 0, awaitingPayment: 0,
          medianOfficeDays: null, medianResidentDays: null, p90OfficeDays: null,
          metTarget: 0, missedTarget: 0,
        },
        office: [],
        resident: [],
      }
      grouped.set(key, entry)
    }

    entry.row.submitted += 1
    if (r.status === 'completed') entry.row.completed += 1
    else if (r.status === 'rejected') entry.row.rejected += 1
    else if (r.status === 'for_payment') entry.row.awaitingPayment += 1
    else entry.row.inProgress += 1

    // Only a released request has a turnaround; anything still open would drag
    // the figure toward whatever today happens to be.
    if (r.status !== 'completed' || !r.released_at) continue

    const officeStart = r.paid_at ?? r.submitted_at
    const officeDays = workingDaysBetween(officeStart, r.released_at, holidays)
    const residentDays = workingDaysBetween(r.submitted_at, r.released_at, holidays)
    if (officeDays !== null) {
      entry.office.push(officeDays)
      // Judged against what the catalogue promised the resident, and against
      // the office's own clock — the same one the promise was made on.
      if (officeDays <= r.processing_days_max) entry.row.metTarget += 1
      else entry.row.missedTarget += 1
    }
    if (residentDays !== null) entry.resident.push(residentDays)
  }

  const allOffice: number[] = []
  const allResident: number[] = []
  const reportRows: ReportRow[] = []

  for (const { row, office, resident } of grouped.values()) {
    row.medianOfficeDays = median(office)
    row.medianResidentDays = median(resident)
    row.p90OfficeDays = percentile90(office)
    allOffice.push(...office)
    allResident.push(...resident)
    reportRows.push(row)
  }

  const submitted = reportRows.reduce((n, r) => n + r.submitted, 0)
  const completed = reportRows.reduce((n, r) => n + r.completed, 0)
  const rejected = reportRows.reduce((n, r) => n + r.rejected, 0)
  const metTarget = reportRows.reduce((n, r) => n + r.metTarget, 0)
  const missedTarget = reportRows.reduce((n, r) => n + r.missedTarget, 0)
  const judged = metTarget + missedTarget

  return {
    from: opts.from,
    to: opts.to,
    submitted,
    completed,
    rejected,
    stillOpen: submitted - completed - rejected,
    medianOfficeDays: median(allOffice),
    medianResidentDays: median(allResident),
    metTarget,
    missedTarget,
    onTimeRate: judged === 0 ? null : Math.round((metTarget / judged) * 100),
    ...(await satisfaction(opts)),
    rows: reportRows.sort((a, b) => b.submitted - a.submitted),
  }
}

/**
 * What residents said, over the same period and the same offices.
 *
 * Counted separately from the turnaround figures rather than joined into them:
 * a complaint is about an office, not necessarily about one request, and
 * feedback arrives after the transaction closes. Forcing both into the
 * per-service rows would make a service look badly rated because someone
 * complained about a queue.
 */
async function satisfaction(opts: { from: string; to: string; departments: string[]; all: boolean }) {
  const rated = await query<{ n: string; avg: string | null }>(
    `select count(*) as n, avg(f.rating)::numeric(4,2) as avg
       from feedback f join requests r on r.id = f.request_id
      where f.created_at >= $1::date and f.created_at < ($2::date + 1)
        and ($3::boolean or r.department_id = any($4::text[]))`,
    [opts.from, opts.to, opts.all, opts.departments]
  )
  const complaints = await query<{ filed: string; answered: string; overdue: string }>(
    `select count(*) as filed,
            count(*) filter (where status = 'answered') as answered,
            count(*) filter (where status = 'open' and due_on < current_date) as overdue
       from complaints
      where created_at >= $1::date and created_at < ($2::date + 1)
        and ($3::boolean or department_id = any($4::text[]))`,
    [opts.from, opts.to, opts.all, opts.departments]
  )
  const ratings = Number(rated[0]?.n ?? 0)
  return {
    ratings,
    averageRating: ratings === 0 ? null : Number(rated[0]!.avg),
    complaintsFiled: Number(complaints[0]?.filed ?? 0),
    complaintsAnswered: Number(complaints[0]?.answered ?? 0),
    complaintsOverdue: Number(complaints[0]?.overdue ?? 0),
  }
}

/** One row per service, for pasting into whatever the LGU actually files. */
export function toCsv(report: ReportSummary): string {
  const header = [
    'Office', 'Service', 'Submitted', 'Completed', 'Rejected', 'In progress',
    'Awaiting payment', 'Median office days', 'Median resident days',
    'Slowest 10% (office days)', 'Met target', 'Missed target',
  ]
  // Quote everything: an office name with a comma in it must not shift columns.
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const lines = [
    header.map(escape).join(','),
    ...report.rows.map((r) =>
      [
        r.departmentName, r.serviceName, r.submitted, r.completed, r.rejected,
        r.inProgress, r.awaitingPayment,
        r.medianOfficeDays ?? '', r.medianResidentDays ?? '', r.p90OfficeDays ?? '',
        r.metTarget, r.missedTarget,
      ].map(escape).join(',')
    ),
  ]
  return lines.join('\r\n')
}
