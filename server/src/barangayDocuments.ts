import type { PoolClient } from 'pg'
import PDFDocument from 'pdfkit'
import { one } from './db.ts'
import { makeVerificationCode } from './documents.ts'
import { getFile } from './storage.ts'

/**
 * The barangay certificate, rendered.
 *
 * The municipal tier has produced a verifiable PDF since the first release and
 * the barangay tier produced nothing — which was backwards, because the
 * barangay is the tier most residents actually deal with in a year. A
 * clearance, a residency certificate, an indigency certificate: all of them
 * went out as paper the app could not verify, could not reproduce if it was
 * lost, and could not show a bank.
 *
 * **What this is not.** The attestation wording below is generic across every
 * certificate type, exactly as the municipal renderer's is across all
 * seventeen services. A real barangay's clearance form carries type-specific
 * text — "is known to me to be of good moral character", "is listed among the
 * indigent families of this barangay" — and the app has nowhere to author it
 * per type. Getting that wrong under the barangay's own name is worse than
 * being plain, so this certifies what the barangay actually did and nothing
 * more. See CLAUDE.md.
 */

export interface BarangaySealSource {
  /** PNG or JPEG bytes, or null where the barangay has uploaded none. */
  seal: Buffer | null
  sealType: string | null
}

/**
 * The seal, fetched before the release transaction opens.
 *
 * Reading it is file I/O and holding a transaction across it would turn a slow
 * disk into a lock on the barangay queue. Nothing about it depends on the
 * release winning, so there is nothing to gain by waiting — and a seal that
 * cannot be read is not a reason to fail a release. A certificate without the
 * seal is still a certificate; a release that failed because an image was
 * missing is a resident standing at a counter being told to come back.
 */
export async function loadBarangaySeal(barangayId: string): Promise<BarangaySealSource> {
  const row = await one<{ seal_key: string | null; seal_type: string | null }>(
    `select seal_key, seal_type from barangays where id = $1`,
    [barangayId]
  )
  if (!row?.seal_key) return { seal: null, sealType: null }
  try {
    return { seal: await getFile(row.seal_key), sealType: row.seal_type }
  } catch {
    return { seal: null, sealType: null }
  }
}

export interface BarangayCertificateData {
  referenceNo: string
  certificateName: string
  purpose: string
  residentName: string
  residentAddress: string | null
  barangayName: string
  municipality: string
  province: string
  hallAddress: string | null
  phone: string | null
  email: string | null
  captain: string | null
  secretary: string | null
  feePesos: number
  issuedAt: Date
  /** Stamped when the barangay marked it ready; null where the type states none. */
  validUntil: string | null
  verificationCode: string
  seal: Buffer | null
  sealType: string | null
}

export interface IssuedBarangayCertificate {
  verificationCode: string
  fileName: string
}

/**
 * Issues the certificate, inside the caller's transaction.
 *
 * The seal was fetched before the transaction opened, so the only work here is
 * CPU and one statement. Returns null when one already exists, which is what a
 * second release of the same request would produce and is not an error.
 */
export async function issueBarangayCertificate(
  client: PoolClient,
  input: {
    requestId: string
    barangayId: string
    issuedBy: string
    data: Omit<BarangayCertificateData, 'verificationCode'>
  }
): Promise<IssuedBarangayCertificate | null> {
  const verificationCode = makeVerificationCode()
  const content = await renderBarangayCertificate({ ...input.data, verificationCode })
  const fileName = barangayCertificateFileName(
    input.data.certificateName,
    input.data.referenceNo
  )

  const inserted = await client.query<{ id: string }>(
    `insert into barangay_documents
       (request_id, verification_code, barangay_id, issued_by, file_name, content, byte_size)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (request_id) do nothing
     returning id`,
    [
      input.requestId, verificationCode, input.barangayId, input.issuedBy,
      fileName, content, content.length,
    ]
  )
  if (inserted.rowCount === 0) return null
  return { verificationCode, fileName }
}

/** e.g. barangay-clearance-BRGY-2026-00012.pdf */
export function barangayCertificateFileName(name: string, referenceNo: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug || 'certificate'}-${referenceNo}.pdf`
}

// ---------------------------------------------------------------------------

const NAVY = '#1e3a8a'
const INK = '#0f1d4d'
const MUTED = '#64748b'
const RULE = '#c7d2fe'

const longDate = (d: Date) =>
  d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

/** A `date` column, formatted without letting a time zone shift the day. */
const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

/** Only PNG and JPEG are drawn; pdfkit embeds nothing else. */
function drawable(data: BarangayCertificateData): Buffer | null {
  if (!data.seal) return null
  if (data.sealType !== 'image/png' && data.sealType !== 'image/jpeg') return null
  return data.seal
}

export function renderBarangayCertificate(data: BarangayCertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const width = right - left
    const seal = drawable(data)

    // The watermark first, so everything else sits over it.
    if (seal) {
      try {
        doc.save().opacity(0.05)
          .image(seal, left + width / 2 - 135, 300, { fit: [270, 270] })
          .restore()
      } catch {
        // An image pdfkit will not decode is not a reason to fail a release.
      }
    }

    // ----------------------------------------------------------------- header
    if (seal) {
      try {
        doc.image(seal, left, 48, { fit: [64, 64] })
      } catch {
        // as above
      }
    }

    const hx = left + (seal ? 78 : 0)
    const hw = width - (seal ? 78 : 0)
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('Republic of the Philippines', hx, 50, { width: hw })
    doc.text(`Province of ${data.province}`, { width: hw })
    doc.text(`Municipality of ${data.municipality}`, { width: hw })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
      .text(`BARANGAY ${data.barangayName.toUpperCase()}`, { width: hw })

    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
    if (data.hallAddress) doc.text(data.hallAddress, { width: hw })
    const contact = [data.phone, data.email].filter(Boolean).join('  ·  ')
    if (contact) doc.text(contact, { width: hw })

    const ruleY = Math.max(doc.y, 118) + 10
    doc.rect(left, ruleY, width, 2.5).fill(NAVY)

    // ------------------------------------------------------------------ title
    let y = ruleY + 26
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(19)
      .text(data.certificateName.toUpperCase(), left, y, { width, align: 'center' })
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
      .text(`Reference No. ${data.referenceNo}`, left, doc.y + 4, { width, align: 'center' })
    y = doc.y + 24

    // ------------------------------------------------------------------- body
    doc.fillColor(INK).font('Helvetica').fontSize(11)
      .text('TO WHOM IT MAY CONCERN:', left, y, { width })
    doc.moveDown(0.8)

    const where = data.residentAddress
      ? `${data.residentAddress}, Barangay ${data.barangayName}`
      : `Barangay ${data.barangayName}`
    doc.text(
      `This is to certify that ${data.residentName}, a resident of ${where}, ` +
        `Municipality of ${data.municipality}, Province of ${data.province}, ` +
        `has been issued this ${data.certificateName} by the Barangay Government of ` +
        `${data.barangayName} on ${longDate(data.issuedAt)}.`,
      { width, align: 'justify', lineGap: 3 }
    )
    doc.moveDown(0.7)
    doc.text(
      `Issued upon the request of the above-named person for the purpose of: ${data.purpose}.`,
      { width, align: 'justify', lineGap: 3 }
    )
    doc.moveDown(1.3)

    // ---------------------------------------------------------------- details
    const rows: Array<[string, string]> = [
      ['Issued on', longDate(data.issuedAt)],
      [
        'Valid until',
        data.validUntil
          ? longDay(data.validUntil)
          : 'This barangay states no validity period for this certificate.',
      ],
      [
        'Fee',
        data.feePesos > 0
          ? `PHP ${data.feePesos.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, paid at the barangay hall`
          : 'No fee',
      ],
    ]
    for (const [label, value] of rows) {
      const rowY = doc.y
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(label, left, rowY, { width: 110 })
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
        .text(value, left + 118, rowY, { width: width - 118 })
      doc.moveDown(0.5)
    }

    // -------------------------------------------------------------- signatures
    //
    // A barangay certificate goes out over the Punong Barangay's name and is
    // attested by the Secretary, which is why both sit on the `barangays` row.
    // A missing name leaves the rule and the title, so the paper can still be
    // signed by hand rather than printing a title over nothing.
    doc.moveDown(1.6)
    const sigY = Math.max(doc.y, 520)
    const sigWidth = (width - 40) / 2

    const signature = (x: number, name: string | null, title: string) => {
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
        .text(name ?? ' ', x, sigY + 16, { width: sigWidth, align: 'center' })
      doc.moveTo(x, sigY + 32).lineTo(x + sigWidth, sigY + 32).lineWidth(0.7).stroke(RULE)
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
        .text(title, x, sigY + 37, { width: sigWidth, align: 'center' })
    }
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('ATTESTED BY', left, sigY, { width: sigWidth, align: 'center', characterSpacing: 0.8 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('ISSUED BY', left + sigWidth + 40, sigY, {
        width: sigWidth, align: 'center', characterSpacing: 0.8,
      })
    signature(left, data.secretary, 'Barangay Secretary')
    signature(left + sigWidth + 40, data.captain, 'Punong Barangay')

    // ------------------------------------------------------------ verification
    const boxY = sigY + 72
    doc.roundedRect(left, boxY, width, 74, 6).fillAndStroke('#f2f5fd', RULE)
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text('VERIFICATION CODE', left + 16, boxY + 13, { width: width - 32, characterSpacing: 0.8 })
    doc.fillColor(INK).font('Courier-Bold').fontSize(15)
      .text(data.verificationCode, left + 16, boxY + 28, { width: width - 32 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Check this certificate at the municipality\'s portal or at any barangay or municipal ' +
          'counter. A certificate whose code does not match the record is not one this barangay issued.',
        left + 16, boxY + 52, { width: width - 32 }
      )

    // ----------------------------------------------------------------- footing
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Issued electronically by the barangay named above. This copy is valid without a manual signature.',
        left, doc.page.height - 70, { width, align: 'center' }
      )

    doc.end()
  })
}
