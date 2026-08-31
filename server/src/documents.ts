import { randomBytes } from 'node:crypto'
import PDFDocument from 'pdfkit'

/**
 * Verification codes are printed on the document and looked up by anyone
 * holding it. Crockford-style base32 (no I/L/O/U) so they can be read off
 * paper and typed without ambiguity, and long enough that the public
 * verification endpoint cannot be walked.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 16

export function makeVerificationCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
    // Grouped for legibility: XXXX-XXXX-XXXX-XXXX
    if (i % 4 === 3 && i !== CODE_LENGTH - 1) code += '-'
  }
  return code
}

export interface DocumentData {
  referenceNo: string
  serviceName: string
  officeName: string
  municipality: string
  residentName: string
  residentAddress: string | null
  formValues: Record<string, string>
  feePesos: number
  paid: boolean
  submittedAt: Date
  issuedAt: Date
  verificationCode: string
}

const NAVY = '#1e3a8a'
const INK = '#0f1d4d'
const MUTED = '#64748b'

/** Renders the released document. Returns the finished PDF bytes. */
export function renderDocument(data: DocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const width = right - left

    // Header
    doc.rect(left, 50, width, 4).fill(NAVY)
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16)
      .text(data.municipality.toUpperCase(), left, 74, { width, align: 'center' })
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(data.officeName, { width, align: 'center' })
    doc.moveDown(1.4)

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(19)
      .text(data.serviceName.toUpperCase(), { width, align: 'center' })
    doc.moveDown(0.4)
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
      .text(`Reference No. ${data.referenceNo}`, { width, align: 'center' })
    doc.moveDown(1.6)

    // Body
    doc.fillColor(INK).font('Helvetica').fontSize(11)
    doc.text('TO WHOM IT MAY CONCERN:', { width })
    doc.moveDown(0.8)
    doc.text(
      `This certifies that the request above was filed by ${data.residentName}` +
        (data.residentAddress ? ` of ${data.residentAddress}` : '') +
        `, and has been processed and released by the ${data.officeName}.`,
      { width, align: 'justify', lineGap: 3 }
    )
    doc.moveDown(1.2)

    // Details table
    const rows: Array<[string, string]> = [
      ['Filed on', data.submittedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['Released on', data.issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['Fee', data.feePesos > 0
        ? `PHP ${data.feePesos.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${data.paid ? ' (paid)' : ''}`
        : 'No fee'],
      ...Object.entries(data.formValues).map(([k, v]): [string, string] => [
        k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim(),
        v,
      ]),
    ]

    for (const [label, value] of rows) {
      const y = doc.y
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(label, left, y, { width: 150 })
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
        .text(value, left + 155, y, { width: width - 155 })
      doc.moveDown(0.45)
    }

    // Verification block
    doc.moveDown(1.6)
    const boxY = doc.y
    doc.roundedRect(left, boxY, width, 74, 6).fillAndStroke('#f2f5fd', '#c7d2fe')
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text('VERIFICATION CODE', left + 16, boxY + 13, { width: width - 32, characterSpacing: 0.8 })
    doc.fillColor(INK).font('Courier-Bold').fontSize(15)
      .text(data.verificationCode, left + 16, boxY + 28, { width: width - 32 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Verify this document at the LGU portal or at any municipal counter. A document without a matching code is not valid.',
        left + 16, boxY + 52, { width: width - 32 }
      )

    // Footer
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Electronically released. This copy is valid without a manual signature.',
        left, doc.page.height - 70, { width, align: 'center' }
      )

    doc.end()
  })
}

/** e.g. cedula-MTO-2026-00012.pdf */
export function documentFileName(serviceName: string, referenceNo: string): string {
  const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug}-${referenceNo}.pdf`
}
