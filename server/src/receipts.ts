import type { PoolClient } from 'pg'
import PDFDocument from 'pdfkit'
import { one } from './db.ts'
import { drawableMark, drawSignature, makeVerificationCode } from './documents.ts'
import { documentVerificationUrl, drawQr, QR_BOX_HEIGHT, QR_SIZE } from './qr.ts'
import { getFile } from './storage.ts'

/**
 * The electronic official receipt.
 *
 * Every other thing this app issues leaves the resident holding something — a
 * released document, a queue number, a reference. Money, which is the one
 * transaction they are most likely to be asked to prove, left them with a line
 * in a list. This is the receipt for it.
 *
 * **What it is and is not.** A Philippine LGU's Official Receipt is an
 * accountable form, and issuing one electronically is something the
 * municipality has to be authorised to do. Nothing here grants that authority,
 * and `formLabel` is null until an administrator fills in the form number the
 * municipality was actually issued — a receipt citing a form number this app
 * invented would be worse than one citing none. See DEPLOY.md.
 */

/**
 * The municipality as it is printed on a receipt.
 *
 * Read before the settlement transaction, frozen onto the row at issue. A
 * receipt re-rendered from the current row a year later would carry the current
 * treasurer's name over last year's payment, which is the one thing a receipt
 * must never do.
 */
export interface ReceiptIssuer {
  municipality: string
  province: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  tin: string | null
  treasurerName: string | null
  treasurerTitle: string
  prefix: string
  formLabel: string | null
  footer: string | null
  /** PNG or JPEG bytes, or null where the municipality has uploaded no seal. */
  seal: Buffer | null
  sealType: string | null
  /** The treasurer's signature, printed above their name. Same rules as the seal. */
  treasurerSignature: Buffer | null
  treasurerSignatureType: string | null
}

export interface MunicipalityRow {
  name: string
  province: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  tin: string | null
  treasurer_name: string | null
  treasurer_title: string
  receipt_prefix: string
  receipt_form_label: string | null
  receipt_footer: string | null
  seal_key: string | null
  seal_type: string | null
  treasurer_signature_key: string | null
  treasurer_signature_type: string | null
}

export const MUNICIPALITY_SELECT = `
  code, name, province, address, phone, email, website, tin,
  treasurer_name, treasurer_title, receipt_prefix, receipt_form_label,
  receipt_footer, seal_key, seal_type, seal_updated_at,
  treasurer_signature_key, treasurer_signature_type, treasurer_signature_updated_at
`

/**
 * Everything the renderer needs, gathered *before* the settlement transaction.
 *
 * Deliberately outside it: reading the seal off the object store is file I/O,
 * and holding a transaction open across it would make a slow disk into a lock
 * on the payments table. None of this depends on who wins the settle race, so
 * there is nothing to gain by waiting.
 *
 * A seal that cannot be read is not an error. A receipt without the seal is
 * still a receipt; a payment that failed to settle because an image was missing
 * is a resident who paid and is told they did not.
 */
export async function loadIssuer(): Promise<ReceiptIssuer> {
  const row = await one<MunicipalityRow>(`select ${MUNICIPALITY_SELECT} from municipality limit 1`)
  const read = async (key: string | null | undefined): Promise<Buffer | null> => {
    if (!key) return null
    try {
      return await getFile(key)
    } catch {
      return null
    }
  }
  const [seal, treasurerSignature] = await Promise.all([
    read(row?.seal_key),
    read(row?.treasurer_signature_key),
  ])
  return {
    municipality: row?.name ?? 'Municipality',
    province: row?.province ?? '',
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    tin: row?.tin ?? null,
    treasurerName: row?.treasurer_name ?? null,
    treasurerTitle: row?.treasurer_title ?? 'Municipal Treasurer',
    prefix: row?.receipt_prefix ?? 'OR',
    formLabel: row?.receipt_form_label ?? null,
    footer: row?.receipt_footer ?? null,
    seal,
    sealType: row?.seal_type ?? null,
    treasurerSignature,
    treasurerSignatureType: treasurerSignature ? row?.treasurer_signature_type ?? null : null,
  }
}

/** What goes on the receipt about the payment itself. */
export interface ReceiptInput {
  paymentId: string
  requestId: string
  issuedTo: string
  issuedToAddress: string | null
  particulars: string
  amountCentavos: number
  paymentMethod: string | null
  provider: string
  providerRef: string | null
  paymentReference: string
  issuer: ReceiptIssuer
}

export interface IssuedReceipt {
  receiptNo: string
  verificationCode: string
  fileName: string
}

/**
 * Issues the receipt, inside the caller's transaction.
 *
 * The only work here is CPU and two statements: the seal was fetched by
 * `loadIssuer` before the transaction opened, so nothing in this function waits
 * on a disk. That is what makes it safe to do in the same transaction that
 * settles the payment — and settling in one transaction is what makes "a
 * settled payment always has a receipt" true rather than merely usual.
 *
 * Returns null if a receipt already exists for this payment, which is what a
 * retried gateway callback produces and is not an error.
 */
export async function issueReceipt(
  client: PoolClient,
  input: ReceiptInput
): Promise<IssuedReceipt | null> {
  const issuedAt = new Date()
  const year = issuedAt.getUTCFullYear()

  const seq = await client.query<{ last_number: number }>(
    `insert into receipt_counters (year, last_number) values ($1, 1)
     on conflict (year) do update set last_number = receipt_counters.last_number + 1
     returning last_number`,
    [year]
  )
  const receiptNo = `${input.issuer.prefix}-${year}-${String(seq.rows[0]!.last_number).padStart(6, '0')}`
  const verificationCode = makeVerificationCode()

  const content = await renderReceipt({
    receiptNo,
    verificationCode,
    issuedAt,
    issuedTo: input.issuedTo,
    issuedToAddress: input.issuedToAddress,
    particulars: input.particulars,
    amountCentavos: input.amountCentavos,
    paymentMethod: input.paymentMethod,
    providerRef: input.providerRef,
    paymentReference: input.paymentReference,
    issuer: input.issuer,
  })
  const fileName = receiptFileName(receiptNo)

  const inserted = await client.query<{ id: string }>(
    `insert into receipts
       (payment_id, request_id, receipt_no, verification_code, issued_to,
        issued_to_address, particulars, amount_centavos, payment_method,
        provider, provider_ref, issuer, issued_at, file_name, content, byte_size)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     on conflict (payment_id) do nothing
     returning id`,
    [
      input.paymentId, input.requestId, receiptNo, verificationCode, input.issuedTo,
      input.issuedToAddress, input.particulars, input.amountCentavos, input.paymentMethod,
      input.provider, input.providerRef, JSON.stringify(serializeIssuer(input.issuer)),
      issuedAt, fileName, content, content.length,
    ]
  )
  if (inserted.rowCount === 0) return null
  return { receiptNo, verificationCode, fileName }
}

/** The seal bytes are not part of the record; everything else about it is. */
function serializeIssuer(issuer: ReceiptIssuer) {
  const {
    seal: _seal, sealType: _sealType,
    treasurerSignature: _sig, treasurerSignatureType: _sigType,
    ...rest
  } = issuer
  return {
    ...rest,
    hadSeal: issuer.seal !== null,
    hadTreasurerSignature: issuer.treasurerSignature !== null,
  }
}

export function receiptFileName(receiptNo: string): string {
  return `official-receipt-${receiptNo}.pdf`
}

// ---------------------------------------------------------------------------
// Pesos, in words
//
// Standard on a Philippine official receipt, and the reason is older than the
// form: a figure can be altered with a pen and a sentence cannot. Worth getting
// right rather than approximating.
// ---------------------------------------------------------------------------

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES: Array<[number, string]> = [
  [1_000_000_000, 'Billion'],
  [1_000_000, 'Million'],
  [1_000, 'Thousand'],
]

function underThousand(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`)
    n %= 100
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]!)
    n %= 10
    if (n > 0) parts.push(ONES[n]!)
  } else if (n > 0) {
    parts.push(ONES[n]!)
  }
  return parts.join(' ')
}

function wholeInWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  for (const [value, name] of SCALES) {
    if (n >= value) {
      parts.push(`${wholeInWords(Math.floor(n / value))} ${name}`)
      n %= value
    }
  }
  if (n > 0) parts.push(underThousand(n))
  return parts.join(' ')
}

/** e.g. 125050 -> "One Thousand Two Hundred Fifty Pesos and 50/100" */
export function pesosInWords(centavos: number): string {
  const whole = Math.floor(Math.abs(centavos) / 100)
  const cents = Math.abs(centavos) % 100
  return `${wholeInWords(whole)} Peso${whole === 1 ? '' : 's'} and ${String(cents).padStart(2, '0')}/100`
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const NAVY = '#1e3a8a'
const INK = '#0f1d4d'
const MUTED = '#64748b'
const RULE = '#c7d2fe'

export interface ReceiptRender {
  receiptNo: string
  verificationCode: string
  issuedAt: Date
  issuedTo: string
  issuedToAddress: string | null
  particulars: string
  amountCentavos: number
  paymentMethod: string | null
  providerRef: string | null
  paymentReference: string
  issuer: ReceiptIssuer
}

const peso = (centavos: number) =>
  `PHP ${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const longDate = (d: Date) =>
  d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })


export function renderReceipt(data: ReceiptRender): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 52 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const width = right - left
    // pdfkit embeds nothing but PNG and JPEG, and the upload route refuses
    // everything else for that reason — but a row written before that rule, or
    // a file that changed underneath us, must not take down a settlement.
    const seal = drawableMark(data.issuer.seal, data.issuer.sealType)
    const signature = drawableMark(
      data.issuer.treasurerSignature, data.issuer.treasurerSignatureType
    )

    // The watermark goes down first so everything else sits over it. Faint
    // enough to be a texture rather than a thing to read through.
    if (seal) {
      try {
        doc.save().opacity(0.05)
          .image(seal, left + width / 2 - 130, 250, { fit: [260, 260], align: 'center' })
          .restore()
      } catch {
        // An image pdfkit will not decode is not a reason to fail a settlement.
      }
    }

    // ----------------------------------------------------------------- header
    if (seal) {
      try {
        doc.image(seal, left, 48, { fit: [62, 62] })
      } catch {
        // as above
      }
    }

    const headerLeft = left + (seal ? 76 : 0)
    const headerWidth = width - (seal ? 76 : 0)
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('Republic of the Philippines', headerLeft, 50, { width: headerWidth })
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`Province of ${data.issuer.province}`, { width: headerWidth })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14)
      .text(data.issuer.municipality.toUpperCase(), { width: headerWidth })

    const contactLine = [data.issuer.phone, data.issuer.email, data.issuer.website]
      .filter(Boolean).join('  ·  ')
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
    if (data.issuer.address) doc.text(data.issuer.address, { width: headerWidth })
    if (contactLine) doc.text(contactLine, { width: headerWidth })
    if (data.issuer.tin) doc.text(`TIN ${data.issuer.tin}`, { width: headerWidth })

    const ruleY = Math.max(doc.y, 118) + 10
    doc.rect(left, ruleY, width, 2.5).fill(NAVY)

    // ------------------------------------------------------------------ title
    let y = ruleY + 16
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
      .text('ELECTRONIC OFFICIAL RECEIPT', left, y, { width: width * 0.6 })
    if (data.issuer.formLabel) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
        .text(data.issuer.formLabel, left, doc.y + 1, { width: width * 0.6 })
    }

    // Number and date, right-aligned against the title.
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('RECEIPT NO.', left + width * 0.6, y + 1, { width: width * 0.4, align: 'right', characterSpacing: 0.6 })
    doc.fillColor(NAVY).font('Courier-Bold').fontSize(14)
      .text(data.receiptNo, left + width * 0.6, y + 12, { width: width * 0.4, align: 'right' })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text(longDate(data.issuedAt), left + width * 0.6, y + 30, { width: width * 0.4, align: 'right' })

    y = Math.max(doc.y, y + 46) + 14
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).stroke(RULE)

    // ------------------------------------------------------------------- body
    y += 18
    const labelWidth = 128
    const row = (label: string, value: string) => {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, left, y, { width: labelWidth })
      const valueTop = y
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
        .text(value, left + labelWidth + 8, valueTop, { width: width - labelWidth - 8 })
      y = Math.max(doc.y, valueTop + 14) + 9
    }

    row('Received from', data.issuedTo)
    if (data.issuedToAddress) row('Address', data.issuedToAddress)
    row('In payment of', data.particulars)

    // ----------------------------------------------------------------- amount
    y += 4
    const boxHeight = 62
    doc.roundedRect(left, y, width, boxHeight, 6).fillAndStroke('#f2f5fd', RULE)
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('AMOUNT PAID', left + 16, y + 12, { width: width - 32, characterSpacing: 0.8 })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20)
      .text(peso(data.amountCentavos), left + 16, y + 24, { width: width - 32 })
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
      .text(pesosInWords(data.amountCentavos), left + 16, y + 47, { width: width - 32 })
    y += boxHeight + 20

    // -------------------------------------------------------------- how it was
    row('Paid through', data.paymentMethod ?? 'Online payment')
    row('Payment reference', data.paymentReference)
    if (data.providerRef) row('Gateway reference', data.providerRef)

    // --------------------------------------------------------------- signature
    //
    // The treasurer's own, uploaded in the Municipality tab and frozen into
    // this PDF at issue — which is why replacing it never reprints last year's
    // receipt over this year's treasurer.
    y += 22
    const sigWidth = width * 0.46
    drawSignature(doc, {
      x: right - sigWidth,
      y,
      width: sigWidth,
      name: data.issuer.treasurerName,
      title: data.issuer.treasurerTitle,
      image: signature,
      align: 'right',
    })
    y = doc.y + 20

    // ------------------------------------------------------------ verification
    //
    // The QR and the code carry the same reference, because they are read by
    // different people: a counter points a phone at one, and somebody on a
    // telephone reads the other out.
    doc.roundedRect(left, y, width, QR_BOX_HEIGHT, 6).fillAndStroke('#ffffff', RULE)

    drawQr(doc, documentVerificationUrl(data.verificationCode), {
      x: left + width - 16 - QR_SIZE,
      y: y + (QR_BOX_HEIGHT - QR_SIZE) / 2,
      size: QR_SIZE,
      color: INK,
    })
    const codeWidth = width - 32 - QR_SIZE - 20

    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('VERIFICATION CODE', left + 16, y + 13, { width: codeWidth, characterSpacing: 0.8 })
    doc.fillColor(INK).font('Courier-Bold').fontSize(14)
      .text(data.verificationCode, left + 16, y + 27, { width: codeWidth })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Scan the code or check this reference at the municipality\'s portal. A receipt whose ' +
          'code does not match the record is not one this municipality issued.',
        left + 16, y + 49, { width: codeWidth }
      )
    y += QR_BOX_HEIGHT + 14

    // ----------------------------------------------------------------- footing
    if (data.issuer.footer) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
        .text(data.issuer.footer, left, y, { width, align: 'center' })
    }
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        signature
          ? 'Issued electronically for a payment confirmed by the payment provider. The ' +
            'signature is a copy held on file — the verification code is what proves this receipt.'
          : 'Issued electronically for a payment confirmed by the payment provider. ' +
            'Valid without a manual signature.',
        // High enough that a second line sits inside the bottom margin rather
        // than pushing the footer onto a page of its own.
        left, doc.page.height - 86, { width, align: 'center' }
      )

    doc.end()
  })
}
