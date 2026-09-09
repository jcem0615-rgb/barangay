import type { PoolClient } from 'pg'

/**
 * The RA 11032 side of the app: how a transaction went, and what to do when it
 * went badly.
 *
 * The Act requires a published Citizen's Charter and a mechanism for feedback
 * and complaints against it. The service catalogue is effectively the charter —
 * every fee, processing time and requirement the app promises is published from
 * it — so what was missing was the other half.
 *
 * **These day counts are placeholders.** Set them to the response times in the
 * deploying LGU's own Citizen's Charter before launch; a deadline the office
 * never agreed to is worse than none, because the app will report them late
 * against it.
 */
export const COMPLAINT_RESPONSE_DAYS = 3

export const COMPLAINT_CATEGORIES = ['delay', 'conduct', 'fees', 'requirements', 'other'] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

/** What each category means, in the words a resident would choose. */
export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  delay: 'It is taking longer than the office said',
  conduct: 'How I was treated',
  fees: 'A fee I was charged',
  requirements: 'Requirements I was asked for',
  other: 'Something else',
}

/**
 * The next complaint reference for a year.
 *
 * Drawn from a counter inside the filing transaction, like a request's
 * reference: a number a resident is given to chase something with has to be
 * theirs alone.
 */
export async function nextComplaintRef(client: PoolClient, year: number): Promise<string> {
  const { rows } = await client.query<{ issued: number }>(
    `insert into complaint_counters (year, issued) values ($1, 1)
     on conflict (year) do update set issued = complaint_counters.issued + 1
     returning issued`,
    [year]
  )
  return `CMP-${year}-${String(rows[0]!.issued).padStart(5, '0')}`
}

export const COMPLAINT_SELECT = `
  c.id, c.reference_no as "referenceNo", c.department_id as "departmentId",
  c.request_id as "requestId", c.category, c.body, c.status,
  c.due_on::text as "dueOn", c.response, c.responded_at as "respondedAt",
  c.created_at as "createdAt"
`
