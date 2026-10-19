import { Router } from 'express'
import { one } from '../db.ts'
import { checkCount, recordCheck, type VerifiableKind } from '../verification.ts'

export const verifyRouter = Router()

/**
 * Confirms a document is genuine, for a counter clerk or a bank looking at a
 * printout. Deliberately public — the holder already has the document — but it
 * returns only what is needed to match the paper in hand against the record,
 * and nothing that would make the endpoint useful to harvest. Codes are long
 * and random, so it cannot be enumerated.
 */
/**
 * Every answer records that it was asked, and carries the running count.
 *
 * The count is what a copy looks like. A permit is checked once or twice in its
 * life; one checked forty times is circulating. It is shown to whoever is
 * checking rather than kept for the console alone, because the person deciding
 * whether to accept the paper is the one who can act on it — and it is weak
 * information to a forger, who already knows what they printed.
 */
async function answer(
  res: import('express').Response,
  kind: VerifiableKind,
  subjectId: string,
  body: Record<string, unknown>
) {
  await recordCheck(kind, subjectId)
  res.json({ ...body, kind, checks: await checkCount(kind, subjectId) })
}

/**
 * Whether the office has withdrawn this, and why.
 *
 * `valid` stays true: the code *is* one this municipality issued, and saying
 * otherwise would read as "forgery" when the truth is "genuine, and no longer
 * good". Those are different things at a counter and are reported apart, the
 * same way the ID check reports unknown, expired and used as three answers
 * rather than one failure.
 */
const revocation = (row: {
  revoked_at: Date | null; revoked_reason: string | null
  replaced: boolean; reissue_of: string | null
}) => ({
  // Whether this copy is itself a replacement for one that was withdrawn.
  // Said on a valid answer too: a clerk who has been handed a reissue should
  // know why there are two papers for this reference in circulation.
  reissued: row.reissue_of !== null,
  ...(row.revoked_at === null
    ? { revoked: false }
    : {
        revoked: true,
        revokedAt: row.revoked_at.toISOString(),
        // The reason is required at the point of revoking, so a resident or a
        // counter is never told only that something was withdrawn.
        revokedReason: row.revoked_reason,
        // And whether the office has since issued a replacement, which is the
        // difference between "this document is no good" and "this document is
        // no good, ask them for the current one". Withdrawing in error and
        // reissuing is the ordinary case, so the person at the counter needs
        // the second answer rather than the first.
        replaced: row.replaced,
      }),
})

verifyRouter.get('/:code', async (req, res) => {
  const code = req.params.code.trim().toUpperCase()

  const row = await one<{
    id: string
    reference_no: string; service_name: string; office_name: string
    resident_name: string; issued_at: Date; status: string
    revoked_at: Date | null; revoked_reason: string | null
    reissue_of: string | null; replaced: boolean
  }>(
    `select d.id, r.reference_no, s.name as service_name, dep.office_name,
            u.full_name as resident_name, d.issued_at, r.status,
            d.revoked_at, d.revoked_reason, d.reissue_of,
            exists (select 1 from documents n where n.reissue_of = d.id) as replaced
       from documents d
       join requests r on r.id = d.request_id
       join services s on s.id = r.service_id
       join departments dep on dep.id = r.department_id
       join users u on u.id = r.resident_id
      where d.verification_code = $1`,
    [code]
  )

  if (!row) {
    // A receipt carries a code for the same reason a document does, so the same
    // endpoint answers for both: a clerk holding a printout should not have to
    // know which of the two kinds of paper they are looking at before they can
    // check it.
    const receipt = await one<{
      id: string
      receipt_no: string; issued_to: string; particulars: string
      amount_centavos: number; issued_at: Date; issuer: { municipality?: string }
    }>(
      `select id, receipt_no, issued_to, particulars, amount_centavos, issued_at, issuer
         from receipts where verification_code = $1`,
      [code]
    )
    if (receipt) {
      // A receipt is never revoked. It records that money arrived, and money
      // that arrived cannot be un-received; a reversal is a refund, which this
      // app does not do.
      return answer(res, 'receipt', receipt.id, {
        valid: true,
        referenceNo: receipt.receipt_no,
        documentType: 'Official Receipt',
        issuedBy: receipt.issuer?.municipality ?? 'the municipality',
        issuedTo: receipt.issued_to,
        issuedAt: receipt.issued_at.toISOString(),
        particulars: receipt.particulars,
        // Pesos, like everywhere else that crosses the wire.
        amount: receipt.amount_centavos / 100,
        status: 'settled',
      })
    }
    // The third kind. A clerk holding a printout should not have to know which
    // tier issued it before they can check it, so one endpoint answers for a
    // municipal document, a receipt and a barangay certificate alike.
    const certificate = await one<{
      id: string
      reference_no: string; type_name: string; barangay_name: string
      resident_name: string; issued_at: Date; valid_until: Date | string | null
      status: string
      revoked_at: Date | null; revoked_reason: string | null
      reissue_of: string | null; replaced: boolean
    }>(
      `select d.id, r.reference_no, t.name as type_name, b.name as barangay_name,
              u.full_name as resident_name, d.issued_at, r.valid_until, r.status,
              d.revoked_at, d.revoked_reason, d.reissue_of,
              exists (
                select 1 from barangay_documents n where n.reissue_of = d.id
              ) as replaced
         from barangay_documents d
         join barangay_requests r on r.id = d.request_id
         join barangay_certificate_types t on t.id = r.type_id
         join barangays b on b.id = d.barangay_id
         join users u on u.id = r.resident_id
        where d.verification_code = $1`,
      [code]
    )
    if (certificate) {
      const validUntil =
        certificate.valid_until instanceof Date
          ? certificate.valid_until.toLocaleDateString('en-CA')
          : (certificate.valid_until ?? null)
      return answer(res, 'barangay_certificate', certificate.id, {
        valid: true,
        referenceNo: certificate.reference_no,
        documentType: certificate.type_name,
        issuedBy: `Barangay ${certificate.barangay_name}`,
        issuedTo: certificate.resident_name,
        issuedAt: certificate.issued_at.toISOString(),
        validUntil,
        // Derived here rather than stored, like everywhere else this date is
        // read: a certificate that lapsed yesterday has to say so today, and
        // nothing is scheduled to make that true.
        expired:
          validUntil !== null &&
          validUntil < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        status: certificate.status,
        ...revocation(certificate),
      })
    }

    return res.status(404).json({
      valid: false,
      error: 'No document, receipt or certificate matches that code. It may have been mistyped.',
    })
  }

  await answer(res, 'document', row.id, {
    valid: true,
    referenceNo: row.reference_no,
    documentType: row.service_name,
    issuedBy: row.office_name,
    issuedTo: row.resident_name,
    issuedAt: row.issued_at.toISOString(),
    // A completed request is the only state a document is released in; surfaced
    // so a later reversal is visible to whoever is checking.
    status: row.status,
    ...revocation(row),
  })
})
