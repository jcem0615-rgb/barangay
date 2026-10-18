import type { PoolClient } from 'pg'
import { one, query } from './db.ts'

/**
 * Counting the checks.
 *
 * The QR and the public page catch the altered printout: the paper says one
 * thing, the server says another. Neither touches a *copy* — a photocopy
 * carries a genuine code and verifies genuinely, and nothing that can be
 * printed changes that.
 *
 * What changes it is the count. A permit is checked once or twice in its life,
 * when its holder is asked to prove it. One checked forty times in a week is a
 * copy doing the rounds, and that is visible only if somebody is counting.
 *
 * **Who checked is deliberately not recorded** — see the migration. The
 * endpoint is public, so the only identity available would be an IP address,
 * and keeping one would turn this into a record of who looked at whose permit.
 * The count and the times are the whole signal; the checker is not part of it.
 */
export type VerifiableKind = 'document' | 'receipt' | 'barangay_certificate'

/**
 * Writes the check, and never fails the check it is recording.
 *
 * A verification that answered correctly and could not be logged is still a
 * verification that answered correctly, and a clerk at a counter should not be
 * told a genuine permit cannot be checked because a write failed. The log is
 * for noticing a pattern afterwards, which is a weaker promise than the answer
 * itself.
 */
export async function recordCheck(kind: VerifiableKind, subjectId: string): Promise<void> {
  try {
    await query(
      `insert into document_verifications (kind, subject_id) values ($1, $2)`,
      [kind, subjectId]
    )
  } catch (err) {
    console.error('could not record a document check', err)
  }
}

/** How many times this one has been checked, this check included. */
export async function checkCount(kind: VerifiableKind, subjectId: string): Promise<number> {
  const row = await one<{ count: string }>(
    `select count(*)::text as count from document_verifications
      where kind = $1 and subject_id = $2`,
    [kind, subjectId]
  )
  return Number(row?.count ?? 0)
}

export interface CheckedOften {
  kind: VerifiableKind
  referenceNo: string
  documentType: string
  issuedBy: string
  issuedAt: string
  checks: number
  firstChecked: string
  lastChecked: string
  revoked: boolean
}

/**
 * What has been checked most in a period.
 *
 * Ordered by the count rather than filtered on a threshold: what counts as
 * "unusual" depends on how much a municipality issues, and a hard-coded number
 * would be wrong for every town but one. The administrator reads the top of the
 * list and knows their own normal.
 */
export async function checkedOften(
  sinceDays: number, limit: number
): Promise<CheckedOften[]> {
  return query<CheckedOften>(
    `with counted as (
       select kind, subject_id,
              count(*)::int as checks,
              min(checked_at) as first_checked,
              max(checked_at) as last_checked
         from document_verifications
        where checked_at >= now() - ($1 || ' days')::interval
        group by kind, subject_id
     )
     select c.kind, c.checks,
            c.first_checked as "firstChecked",
            c.last_checked as "lastChecked",
            coalesce(r.reference_no, br.reference_no, rc.receipt_no) as "referenceNo",
            coalesce(s.name, t.name, 'Official Receipt')             as "documentType",
            coalesce(dep.office_name, 'Barangay ' || b.name, $3)     as "issuedBy",
            coalesce(d.issued_at, bd.issued_at, rc.issued_at)        as "issuedAt",
            coalesce(d.revoked_at, bd.revoked_at) is not null        as revoked
       from counted c
       left join documents d           on c.kind = 'document' and d.id = c.subject_id
       left join requests r            on r.id = d.request_id
       left join services s            on s.id = r.service_id
       left join departments dep       on dep.id = r.department_id
       left join barangay_documents bd on c.kind = 'barangay_certificate' and bd.id = c.subject_id
       left join barangay_requests br  on br.id = bd.request_id
       left join barangay_certificate_types t on t.id = br.type_id
       left join barangays b           on b.id = bd.barangay_id
       left join receipts rc           on c.kind = 'receipt' and rc.id = c.subject_id
      -- A row whose document has since been deleted is a check of nothing a
      -- reader could act on, so it is left out rather than shown blank.
      where coalesce(r.reference_no, br.reference_no, rc.receipt_no) is not null
      order by c.checks desc, c.last_checked desc
      limit $2`,
    [String(sinceDays), limit, 'the municipality']
  )
}

export interface RevocationInput {
  table: 'documents' | 'barangay_documents'
  requestId: string
  actorId: string
  reason: string
}

/**
 * Marks a released document revoked, inside the caller's transaction.
 *
 * Returns null where there is nothing to revoke or it is already revoked —
 * both of which the caller turns into a refusal rather than a silent success.
 * Revocation is final: there is no route back. A document that goes on
 * verifying after it was withdrawn is the whole problem this solves, and one
 * that can be un-withdrawn is a flag rather than a revocation.
 */
export async function revokeDocument(
  client: PoolClient, input: RevocationInput
): Promise<{ verificationCode: string } | null> {
  const { rows } = await client.query<{ verification_code: string }>(
    `update ${input.table === 'documents' ? 'documents' : 'barangay_documents'}
        set revoked_at = now(), revoked_by = $2, revoked_reason = $3
      where request_id = $1 and revoked_at is null
      returning verification_code`,
    [input.requestId, input.actorId, input.reason]
  )
  if (rows.length === 0) return null
  return { verificationCode: rows[0]!.verification_code }
}
