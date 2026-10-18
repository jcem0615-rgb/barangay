import { randomBytes } from 'node:crypto'
import PDFDocument from 'pdfkit'
import { one } from './db.ts'
import { getFile } from './storage.ts'
import { documentVerificationUrl, drawQr, QR_BOX_HEIGHT, QR_SIZE } from './qr.ts'

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
  /** The municipality's seal. PNG or JPEG bytes, or null where none is on file. */
  seal: Buffer | null
  sealType: string | null
  /** Who signs for the releasing office, and their signature. */
  headName: string | null
  headTitle: string | null
  signature: Buffer | null
  signatureType: string | null
}

/**
 * Only PNG and JPEG are drawn; pdfkit embeds nothing else.
 *
 * Shared by all three renderers rather than copied into each, because the rule
 * is a property of the PDF writer and not of any one document.
 */
export function drawableMark(bytes: Buffer | null, contentType: string | null): Buffer | null {
  if (!bytes) return null
  if (contentType !== 'image/png' && contentType !== 'image/jpeg') return null
  return bytes
}

/**
 * Draws a signature block: the signature image, the rule, the name, the title.
 *
 * The image sits *above* the rule rather than on it, the way a signed page
 * looks, and a missing one leaves the rule and the title so the paper can still
 * be signed by hand. Shared with the barangay certificate, which has two of
 * these side by side.
 */
export function drawSignature(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number; y: number; width: number
    name: string | null; title: string
    image: Buffer | null
    align?: 'center' | 'right'
  }
): void {
  const align = opts.align ?? 'center'
  if (opts.image) {
    try {
      // Fitted into the space above the rule. A tall signature is scaled down
      // rather than allowed to collide with whatever is above it.
      doc.image(opts.image, opts.x, opts.y - 4, {
        fit: [opts.width, 40],
        align,
        valign: 'bottom',
      })
    } catch {
      // An image pdfkit will not decode is not a reason to fail a release.
    }
  }
  doc.moveTo(opts.x, opts.y + 36).lineTo(opts.x + opts.width, opts.y + 36).lineWidth(0.7).stroke(RULE)
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5)
    .text(opts.name ?? ' ', opts.x, opts.y + 41, { width: opts.width, align })
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
    .text(opts.title, opts.x, doc.y + 1, { width: opts.width, align })
}

const NAVY = '#1e3a8a'
const INK = '#0f1d4d'
const MUTED = '#64748b'
const RULE = '#c7d2fe'

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
    const seal = drawableMark(data.seal, data.sealType)
    const signature = drawableMark(data.signature, data.signatureType)

    // The watermark first, so everything else sits over it.
    if (seal) {
      try {
        doc.save().opacity(0.05)
          .image(seal, left + width / 2 - 130, 290, { fit: [260, 260] })
          .restore()
      } catch {
        // An image pdfkit will not decode is not a reason to fail a release.
      }
    }

    // Header
    doc.rect(left, 50, width, 4).fill(NAVY)
    if (seal) {
      try {
        doc.image(seal, left, 66, { fit: [58, 58] })
      } catch {
        // as above
      }
    }
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

    // -------------------------------------------------------------- signature
    //
    // Who signs is the releasing office's head, because the sentence above
    // already names that office — a single municipal signature printed on a
    // cedula and on a birth certificate alike would be wrong on one of them.
    // A missing name leaves the rule and the office, so the paper can still be
    // signed by hand rather than printing a title over nothing.
    doc.moveDown(2)
    const sigY = Math.min(doc.y, doc.page.height - 260)
    const sigWidth = width * 0.44
    drawSignature(doc, {
      x: left + width - sigWidth,
      y: sigY,
      width: sigWidth,
      name: data.headName,
      title: data.headTitle ?? data.officeName,
      image: signature,
      align: 'center',
    })

    // ----------------------------------------------------------- verification
    //
    // The QR and the code say the same thing, and both are here because they
    // are read by different people: a clerk points a phone, and somebody on a
    // telephone reads the characters out. The code alone was what this carried,
    // and sixteen characters is enough work that in practice nobody checked.
    doc.y = Math.max(doc.y, sigY + 70)
    doc.moveDown(1.6)
    const boxY = doc.y
    doc.roundedRect(left, boxY, width, QR_BOX_HEIGHT, 6).fillAndStroke('#f2f5fd', '#c7d2fe')

    drawQr(doc, documentVerificationUrl(data.verificationCode), {
      x: left + width - 16 - QR_SIZE,
      y: boxY + (QR_BOX_HEIGHT - QR_SIZE) / 2,
      size: QR_SIZE,
      color: INK,
    })
    const codeWidth = width - 32 - QR_SIZE - 20

    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text('VERIFICATION CODE', left + 16, boxY + 14, { width: codeWidth, characterSpacing: 0.8 })
    doc.fillColor(INK).font('Courier-Bold').fontSize(15)
      .text(data.verificationCode, left + 16, boxY + 29, { width: codeWidth })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Scan the code or check this reference at the LGU portal. The record there is what ' +
          'this document says; a printout that disagrees with it has been altered.',
        left + 16, boxY + 53, { width: codeWidth }
      )

    // Footer
    //
    // The signature above is a picture the office uploaded, not a cryptographic
    // one, so it is the code that proves the document and the footer says which
    // is which. Claiming more than that on the face of an official paper is the
    // one thing this document must not do.
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        signature
          ? 'Released electronically. The signature is a copy held on file — the verification ' +
            'code is what proves this document.'
          : 'Released electronically. This copy is valid without a manual signature.',
        // High enough that a second line sits inside the bottom margin rather
        // than pushing the footer onto a page of its own.
        left, doc.page.height - 86, { width, align: 'center' }
      )

    doc.end()
  })
}

/**
 * The seal and the signature a released document is printed with.
 *
 * Read *before* the release transaction opens, like the receipt's seal and the
 * barangay's: reading them is file I/O, and holding a transaction across it
 * would turn a slow disk into a lock on the request queue. Nothing about them
 * depends on the release winning, and a mark that cannot be read is not a
 * reason to fail one — a document without the seal is still a document, while a
 * release that failed over a missing image is a resident told to come back.
 */
export async function loadReleaseMarks(departmentId: string): Promise<ReleaseMarks> {
  const [town, office] = await Promise.all([
    one<{ seal_key: string | null; seal_type: string | null }>(
      `select seal_key, seal_type from municipality limit 1`
    ),
    one<{
      head_name: string | null; head_title: string | null
      signature_key: string | null; signature_type: string | null
    }>(
      `select head_name, head_title, signature_key, signature_type
         from departments where id = $1`,
      [departmentId]
    ),
  ])

  const read = async (key: string | null): Promise<Buffer | null> => {
    if (!key) return null
    try {
      return await getFile(key)
    } catch {
      return null
    }
  }

  const [seal, signature] = await Promise.all([
    read(town?.seal_key ?? null),
    read(office?.signature_key ?? null),
  ])

  return {
    seal,
    sealType: seal ? town?.seal_type ?? null : null,
    headName: office?.head_name ?? null,
    headTitle: office?.head_title ?? null,
    signature,
    signatureType: signature ? office?.signature_type ?? null : null,
  }
}

export type ReleaseMarks = Pick<
  DocumentData,
  'seal' | 'sealType' | 'headName' | 'headTitle' | 'signature' | 'signatureType'
>

/** e.g. cedula-MTO-2026-00012.pdf */
export function documentFileName(serviceName: string, referenceNo: string): string {
  const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug}-${referenceNo}.pdf`
}
