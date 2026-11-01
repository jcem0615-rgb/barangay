import type { PoolClient } from 'pg'
import { z } from 'zod'
import { recordNotification, type NotificationInput } from './notifications.ts'

/**
 * What a resident's complaint to their barangay is, and the one piece of logic
 * both sides of it share.
 *
 * The resident router files and reads; the console router works the queue. Both
 * need the same status machine, the same serialiser and the same history
 * writer, and the reason those live here rather than in either router is that a
 * status move must mean exactly one thing no matter which side asked for it.
 */

export const COMPLAINT_CATEGORIES = [
  'garbage', 'road', 'water', 'drainage', 'streetlight',
  'noise', 'animals', 'neighbour', 'peace', 'other',
] as const

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

/**
 * The cap on what a resident may write, enforced in three places on purpose.
 *
 * The browser counts down so somebody writing a long account can see it
 * coming; this schema refuses the request; and the column has a `check`
 * constraint underneath both. The field is the whole point of the feature —
 * it is the only place the resident says what is actually wrong — so silently
 * truncating it at any layer would lose the thing they came to say.
 */
export const MAX_COMPLAINT_CHARS = 1500

export const complaintFileSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  details: z
    .string()
    .trim()
    .min(10, 'Say what is wrong, in a sentence or two.')
    .max(MAX_COMPLAINT_CHARS, `Keep it under ${MAX_COMPLAINT_CHARS} characters.`),
  location: z.string().trim().max(300).optional(),
})

export type ComplaintStatus = 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'

/**
 * Where a complaint may go next, and nowhere else.
 *
 * `resolved` and `closed` are **final**, the same way `released` and `rejected`
 * are on a request and `settled` is in the blotter. A resident who has been
 * told their complaint was dealt with, and then watches it reopen, has been
 * told two incompatible things by the same barangay; if something recurs it is
 * a new complaint, with its own reference, which is also the honest record of
 * it having happened twice.
 *
 * It is enforced server-side rather than merely rendered, because the console
 * is not the only thing that can call these routes.
 */
const NEXT: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  new: ['acknowledged', 'in_progress', 'resolved', 'closed'],
  acknowledged: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: [],
  closed: [],
}

export const isFinalStatus = (s: ComplaintStatus) => NEXT[s].length === 0

export function canMove(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return NEXT[from].includes(to)
}

/** Why a move was refused, in words the console can show as-is. */
export function refusalFor(from: ComplaintStatus, to: ComplaintStatus): string {
  if (from === to) return `This complaint is already ${LABEL[to]}.`
  if (isFinalStatus(from)) {
    return `This complaint was ${LABEL[from]}, which is final. A recurrence is a new complaint, so it keeps its own reference and its own history.`
  }
  return `A complaint cannot go from ${LABEL[from]} to ${LABEL[to]}.`
}

export const LABEL: Record<ComplaintStatus, string> = {
  new: 'new',
  acknowledged: 'acknowledged',
  in_progress: 'in progress',
  resolved: 'resolved',
  closed: 'closed',
}

/**
 * Closing needs a reason, and resolving does not.
 *
 * "Resolved" is the barangay saying it dealt with the thing, and the resident
 * can see that it is gone. "Closed" is the barangay declining to act — not
 * ours, nothing to act on, could not find it — and that is the row somebody
 * reconstructs from memory a year later with a resident in front of them. The
 * blotter makes the same distinction for the same reason: `unsettled` with no
 * reason is the useless record.
 */
export const requiresNote = (to: ComplaintStatus) => to === 'closed'

export interface ComplaintRow {
  id: string
  reference_no: string
  barangay_id: string
  resident_id: string
  category: string
  details: string
  location: string | null
  status: ComplaintStatus
  filed_at: string
  handled_at: string | null
  response: string | null
}

export interface HistoryRow {
  from_status: ComplaintStatus | null
  to_status: ComplaintStatus
  note: string | null
  actor_name: string
  actor_role: string
  created_at: string
}

export interface EvidenceRow {
  id: string
  content_type: string
  byte_size: string | number
  duration_seconds: number | null
  uploaded_at: string
}

export const serializeEvidence = (row: EvidenceRow) => ({
  id: row.id,
  contentType: row.content_type,
  byteSize: Number(row.byte_size),
  durationSeconds: row.duration_seconds,
  uploadedAt: row.uploaded_at,
})

/**
 * The history, as both sides show it.
 *
 * The actor's *name* is what is published and their id is not — a resident
 * reading their own complaint's trail should see that the barangay secretary
 * acted on it, and has no business being handed an account id. The role rides
 * along so the resident can tell the barangay apart from themselves on the
 * filing row.
 */
export const serializeHistory = (row: HistoryRow) => ({
  from: row.from_status,
  to: row.to_status,
  note: row.note,
  actorName: row.actor_name,
  actorRole: row.actor_role,
  at: row.created_at,
})

export function serializeComplaint(
  row: ComplaintRow,
  extra: { history?: HistoryRow[]; evidence?: EvidenceRow[] } = {}
) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    category: row.category,
    details: row.details,
    location: row.location,
    status: row.status,
    filedAt: row.filed_at,
    handledAt: row.handled_at,
    response: row.response,
    final: isFinalStatus(row.status),
    ...(extra.history ? { history: extra.history.map(serializeHistory) } : {}),
    ...(extra.evidence ? { evidence: extra.evidence.map(serializeEvidence) } : {}),
  }
}

/**
 * One row per move, written **inside the transaction that makes the move**.
 *
 * That is the rule this app follows for every notification and every audit
 * entry, and the reason it matters here is the question a complaint actually
 * has to answer later: not "what is its status" but "what was done about it,
 * and when". `handled_by` and `handled_at` on the parent row answer the first;
 * only a sequence answers the second.
 *
 * `actor_name` is stored rather than joined at read time, exactly as
 * `admin_audit` stores it: a clerk whose account is revoked next year must not
 * erase who acted. The id goes null with the account and the name stays.
 */
export async function recordComplaintHistory(
  client: PoolClient,
  input: {
    complaintId: string
    from: ComplaintStatus | null
    to: ComplaintStatus
    note?: string | null
    actorId: string
    actorName: string
    actorRole: string
  }
): Promise<void> {
  await client.query(
    `insert into barangay_complaint_history
       (complaint_id, from_status, to_status, note, actor_id, actor_name, actor_role)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.complaintId, input.from, input.to, input.note?.trim() || null,
      input.actorId, input.actorName, input.actorRole,
    ]
  )
}

/**
 * What the resident is told when their complaint moves.
 *
 * Deliberately short and carrying no detail: the body is what a push
 * notification shows, and both of this feature's kinds are in `PRIVATE_KINDS`
 * precisely because the text around a complaint may name a neighbour. The
 * reference is safe — the resident quoted it themselves — and the status is the
 * thing they want. Anything they actually need to read is in the app.
 */
export function complaintNotification(
  residentId: string,
  complaint: { reference_no: string },
  to: ComplaintStatus
): NotificationInput {
  const titles: Record<ComplaintStatus, string> = {
    new: 'Complaint received',
    acknowledged: 'Your barangay has seen your complaint',
    in_progress: 'Your barangay is working on your complaint',
    resolved: 'Your complaint was resolved',
    closed: 'Your complaint was closed',
  }
  return {
    userId: residentId,
    requestId: null,
    kind: to === 'new' ? 'barangay_complaint_filed' : 'barangay_complaint_updated',
    title: titles[to],
    body: `${complaint.reference_no} — open the app to read it.`,
  }
}

/** Notify in the same transaction as the change, like everything else here. */
export async function notifyComplaint(
  client: PoolClient,
  residentId: string,
  complaint: { reference_no: string },
  to: ComplaintStatus
): Promise<NotificationInput> {
  const notification = complaintNotification(residentId, complaint, to)
  await recordNotification(client, notification)
  return notification
}
