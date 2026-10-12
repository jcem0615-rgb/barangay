import { Router } from 'express'
import { one } from '../db.ts'

export const verifyRouter = Router()

/**
 * Confirms a document is genuine, for a counter clerk or a bank looking at a
 * printout. Deliberately public — the holder already has the document — but it
 * returns only what is needed to match the paper in hand against the record,
 * and nothing that would make the endpoint useful to harvest. Codes are long
 * and random, so it cannot be enumerated.
 */
verifyRouter.get('/:code', async (req, res) => {
  const code = req.params.code.trim().toUpperCase()

  const row = await one<{
    reference_no: string; service_name: string; office_name: string
    resident_name: string; issued_at: Date; status: string
  }>(
    `select r.reference_no, s.name as service_name, dep.office_name,
            u.full_name as resident_name, d.issued_at, r.status
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
      receipt_no: string; issued_to: string; particulars: string
      amount_centavos: number; issued_at: Date; issuer: { municipality?: string }
    }>(
      `select receipt_no, issued_to, particulars, amount_centavos, issued_at, issuer
         from receipts where verification_code = $1`,
      [code]
    )
    if (receipt) {
      return res.json({
        valid: true,
        kind: 'receipt',
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
    return res.status(404).json({
      valid: false,
      error: 'No document or receipt matches that code. It may have been mistyped.',
    })
  }

  res.json({
    valid: true,
    kind: 'document',
    referenceNo: row.reference_no,
    documentType: row.service_name,
    issuedBy: row.office_name,
    issuedTo: row.resident_name,
    issuedAt: row.issued_at.toISOString(),
    // A completed request is the only state a document is released in; surfaced
    // so a later reversal is visible to whoever is checking.
    status: row.status,
  })
})
