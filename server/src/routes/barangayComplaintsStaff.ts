import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { requireRole } from '../auth.ts'
import { sendEvidence } from '../attachments.ts'
import { deliverNotification } from '../notifications.ts'
import {
  canMove, isFinalStatus, LABEL, MAX_COMPLAINT_CHARS, notifyComplaint,
  recordComplaintHistory, refusalFor, requiresNote, serializeComplaint,
  type ComplaintRow, type ComplaintStatus, type EvidenceRow, type HistoryRow,
} from '../barangayComplaints.ts'

/**
 * The barangay's side of a resident's complaint.
 *
 * **This router carries no gate of its own, by design.** It is mounted inside
 * `barangayStaffRouter`, below that router's
 * `requireRole('barangay_admin', 'barangay_officer')` line, exactly like the
 * blotter, the register and the notice board — and `server/test/isolation.mjs`
 * reads the source to prove it is mounted below the gate rather than trusting
 * that it is. A kagawad therefore cannot reach any of this, which is the right
 * answer: the council sees figures and never individuals, and a complaint is
 * one resident's account of something, sometimes naming another.
 *
 * **Both roles read; only the administrator moves it.** That is the line the
 * blotter already draws — recording is the clerk's work, deciding is the
 * captain's — and it is the one the deployment asked for. The clerk needs to
 * read the queue or nothing gets looked at while the captain is out; what the
 * clerk does not get is the decision that tells a resident their complaint is
 * finished, because `resolved` and `closed` are final.
 *
 * **Scoping is structural, not a parameter.** Every statement filters on the
 * barangay from the signed-in account's own row, so another barangay's
 * complaint is *not found* rather than refused — there is nowhere to name one.
 */

export const barangayComplaintsStaffRouter = Router()

/** The barangay on the signed-in staff account's own row. Never from the body. */
async function staffBarangay(userId: string): Promise<string | null> {
  const row = await one<{ barangay_id: string | null }>(
    `select barangay_id from users where id = $1`,
    [userId]
  )
  return row?.barangay_id ?? null
}

/**
 * An account with no barangay answers 409 to everything in this console, the
 * same as the rest of it: every query scopes on that column and a staff row
 * missing it would otherwise read as "no complaints" rather than as broken.
 */
const NO_BARANGAY = {
  error: 'This account is not attached to a barangay. Ask the municipal administrator to repair it.',
}

interface QueueRow extends ComplaintRow {
  resident_name: string | null
  evidence_count: string
}

/**
 * The queue, open-first then oldest-first — the order somebody should work it.
 *
 * The resident's name rides along because this is casework and the barangay
 * will ring them; it is a join at read time rather than a stored copy, since
 * unlike an audit trail there is no claim being made about who a person was at
 * some past moment.
 */
barangayComplaintsStaffRouter.get('/', async (req, res) => {
  const barangayId = await staffBarangay(req.user!.id)
  if (!barangayId) return res.status(409).json(NO_BARANGAY)

  const rows = await query<QueueRow>(
    `select c.*, u.full_name as resident_name,
            (select count(*)::text from barangay_complaint_evidence e
              where e.complaint_id = c.id) as evidence_count
       from barangay_complaints c
       join users u on u.id = c.resident_id
      where c.barangay_id = $1
      order by
        case c.status when 'new' then 0 when 'acknowledged' then 1
                      when 'in_progress' then 2 else 3 end,
        c.filed_at asc`,
    [barangayId]
  )

  // The figures lead the screen, because the questions a barangay is actually
  // asked are counts — and they are computed over the rows on every read
  // rather than stored, the same trade the register and the municipal reports
  // make. A stored count is wrong the moment anything moves.
  const figures = {
    total: rows.length,
    open: rows.filter((r) => !isFinalStatus(r.status)).length,
    new: rows.filter((r) => r.status === 'new').length,
    acknowledged: rows.filter((r) => r.status === 'acknowledged').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    withProof: rows.filter((r) => Number(r.evidence_count) > 0).length,
  }

  res.json({
    figures,
    complaints: rows.map((row) => ({
      ...serializeComplaint(row),
      residentName: row.resident_name,
      evidenceCount: Number(row.evidence_count),
    })),
  })
})

/** One complaint, with its whole trail and its proof. */
barangayComplaintsStaffRouter.get('/:id', async (req, res) => {
  const barangayId = await staffBarangay(req.user!.id)
  if (!barangayId) return res.status(409).json(NO_BARANGAY)

  const complaint = await one<ComplaintRow & { resident_name: string | null; resident_phone: string | null }>(
    `select c.*, u.full_name as resident_name, p.phone as resident_phone
       from barangay_complaints c
       join users u on u.id = c.resident_id
       left join resident_profiles p on p.user_id = c.resident_id
      where c.id = $1 and c.barangay_id = $2`,
    [req.params.id, barangayId]
  )
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })

  const history = await query<HistoryRow>(
    `select from_status, to_status, note, actor_name, actor_role, created_at
       from barangay_complaint_history
      where complaint_id = $1
      order by created_at asc`,
    [complaint.id]
  )
  const evidence = await query<EvidenceRow>(
    `select id, content_type, byte_size, duration_seconds, uploaded_at
       from barangay_complaint_evidence
      where complaint_id = $1
      order by uploaded_at asc`,
    [complaint.id]
  )

  res.json({
    ...serializeComplaint(complaint, { history, evidence }),
    residentName: complaint.resident_name,
    // So the barangay can ring the person rather than writing back and waiting.
    // Nothing else about them: this console has no resident lookup and this is
    // not the start of one.
    residentPhone: complaint.resident_phone,
  })
})

const moveSchema = z.object({
  status: z.enum(['acknowledged', 'in_progress', 'resolved', 'closed']),
  note: z.string().trim().max(MAX_COMPLAINT_CHARS).optional(),
})

/**
 * Moving a complaint, which is the administrator's.
 *
 * Everything that makes this safe happens in one transaction: the row is
 * locked, the move is checked against the status machine, the history row is
 * written and the resident is notified — so there is no state where a resident
 * was told something the trail does not record, or the reverse.
 */
barangayComplaintsStaffRouter.patch('/:id', requireRole('barangay_admin'), async (req, res) => {
  const parsed = moveSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const { status: to, note } = parsed.data

  const barangayId = await staffBarangay(req.user!.id)
  if (!barangayId) return res.status(409).json(NO_BARANGAY)

  if (requiresNote(to) && !note) {
    return res.status(400).json({
      error: 'Closing a complaint needs a reason the resident can read — it is the record of why the barangay did not act.',
    })
  }

  const outcome = await transaction(async (client) => {
    // Locked, so two administrators pressing at once cannot both move it and
    // write two history rows claiming the same transition.
    const found = await client.query<ComplaintRow>(
      `select * from barangay_complaints
        where id = $1 and barangay_id = $2
        for update`,
      [req.params.id, barangayId]
    )
    const complaint = found.rows[0]
    if (!complaint) return { kind: 'missing' as const }
    if (!canMove(complaint.status, to)) {
      return { kind: 'refused' as const, message: refusalFor(complaint.status, to) }
    }

    // `response` keeps the latest note on the parent row so the resident's list
    // needs no join; the history keeps every one of them.
    const updated = await client.query<ComplaintRow>(
      `update barangay_complaints
          set status = $2, handled_by = $3, handled_at = now(),
              response = coalesce($4, response)
        where id = $1
        returning *`,
      [complaint.id, to, req.user!.id, note ?? null]
    )

    await recordComplaintHistory(client, {
      complaintId: complaint.id,
      from: complaint.status,
      to,
      note: note ?? null,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
    })

    const notification = await notifyComplaint(client, complaint.resident_id, complaint, to)
    return { kind: 'moved' as const, complaint: updated.rows[0]!, notification }
  })

  if (outcome.kind === 'missing') return res.status(404).json({ error: 'Complaint not found.' })
  if (outcome.kind === 'refused') return res.status(409).json({ error: outcome.message })

  // After the commit, so a slow mail server cannot hold the queue open.
  void deliverNotification(outcome.notification)
  res.json(serializeComplaint(outcome.complaint))
})

/**
 * Proof, watched in the console rather than downloaded.
 *
 * Inline and ranged, so a five-minute clip can be scrubbed to the ten seconds
 * that matter instead of watched through. What makes serving it inline safe is
 * the type set: evidence is only ever an image or a video sniffed from its own
 * bytes, neither of which can carry script the way a resident-supplied PDF
 * can, and `nosniff` still stands.
 *
 * Both roles may watch it. A clerk who can read the complaint but not its
 * photograph is reading half a complaint.
 */
barangayComplaintsStaffRouter.get('/:id/evidence/:evidenceId', async (req, res) => {
  const barangayId = await staffBarangay(req.user!.id)
  if (!barangayId) return res.status(409).json(NO_BARANGAY)

  const row = await one<{ storage_key: string; file_name: string; content_type: string }>(
    `select e.storage_key, e.file_name, e.content_type
       from barangay_complaint_evidence e
       join barangay_complaints c on c.id = e.complaint_id
      where e.id = $1 and e.complaint_id = $2 and c.barangay_id = $3`,
    [req.params.evidenceId, req.params.id, barangayId]
  )
  if (!row) return res.status(404).json({ error: 'Evidence not found.' })
  await sendEvidence(req, res, row)
})

export { LABEL as COMPLAINT_STATUS_LABEL }
export type { ComplaintStatus }
