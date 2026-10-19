import type { PoolClient } from 'pg'
import PDFDocument from 'pdfkit'
import { one } from './db.ts'
import { drawableMark, drawSignature, makeVerificationCode } from './documents.ts'
import { getFile } from './storage.ts'
import { documentVerificationUrl, drawQr, QR_BOX_HEIGHT, QR_SIZE } from './qr.ts'

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
 * **What the certificate says is the barangay's statement, not the app's.** The
 * attestation is authored per certificate type (`BarangayCertificateType.attestation`,
 * stored on the row) and this renderer only fills in the names and the dates.
 * Nothing here cross-checks the blotter before printing "no pending case", and
 * nothing could: the blotter names its parties as free text precisely so that it
 * is not a lookup on the user table. The officer who releases the certificate is
 * the one making the statement, and the console says so where they press the
 * button. A type with no attestation falls back to a plain sentence that claims
 * only what the barangay actually did.
 */

/**
 * The names the attestation may use.
 *
 * Closed on purpose, and checked at the point of saving rather than at the
 * point of printing: a placeholder this renderer cannot fill would come out as
 * literal braces in the middle of an official document, and the first person to
 * see it would be a resident at a bank.
 */
export const ATTESTATION_PLACEHOLDERS = [
  'name', 'residence', 'barangay', 'municipality', 'province', 'purpose', 'date',
] as const

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]*)\}/g

/** The placeholders an authored attestation uses that this renderer does not know. */
export function unknownPlaceholders(attestation: string): string[] {
  const known = new Set<string>(ATTESTATION_PLACEHOLDERS)
  const found = new Set<string>()
  for (const match of attestation.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1] ?? ''
    if (!known.has(name)) found.add(match[0])
  }
  return [...found]
}

/**
 * Fills an authored attestation.
 *
 * `residence` rather than a bare address because the sentence has to read
 * either way: a resident with no address on file still lives in a barangay, and
 * "a resident of , Barangay Poblacion" is the kind of thing that gets noticed
 * at a counter rather than here.
 */
function fillAttestation(template: string, data: BarangayCertificateData): string {
  const residence = data.residentAddress
    ? `${data.residentAddress}, Barangay ${data.barangayName}`
    : `Barangay ${data.barangayName}`
  const values: Record<string, string> = {
    name: data.residentName,
    residence,
    barangay: data.barangayName,
    municipality: data.municipality,
    province: data.province,
    purpose: data.purpose,
    date: longDate(data.issuedAt),
  }
  return template.replace(PLACEHOLDER_PATTERN, (whole, key: string) =>
    key in values ? values[key]! : whole
  )
}

export interface BarangaySealSource {
  /** PNG or JPEG bytes, or null where the barangay has uploaded none. */
  seal: Buffer | null
  sealType: string | null
  /** The two officials' signatures, under the same rules as the seal. */
  captainSignature: Buffer | null
  captainSignatureType: string | null
  secretarySignature: Buffer | null
  secretarySignatureType: string | null
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
  const row = await one<{
    seal_key: string | null; seal_type: string | null
    captain_signature_key: string | null; captain_signature_type: string | null
    secretary_signature_key: string | null; secretary_signature_type: string | null
  }>(
    `select seal_key, seal_type,
            captain_signature_key, captain_signature_type,
            secretary_signature_key, secretary_signature_type
       from barangays where id = $1`,
    [barangayId]
  )

  const read = async (key: string | null | undefined): Promise<Buffer | null> => {
    if (!key) return null
    try {
      return await getFile(key)
    } catch {
      return null
    }
  }

  const [seal, captainSignature, secretarySignature] = await Promise.all([
    read(row?.seal_key),
    read(row?.captain_signature_key),
    read(row?.secretary_signature_key),
  ])

  return {
    seal,
    sealType: seal ? row?.seal_type ?? null : null,
    captainSignature,
    captainSignatureType: captainSignature ? row?.captain_signature_type ?? null : null,
    secretarySignature,
    secretarySignatureType: secretarySignature ? row?.secretary_signature_type ?? null : null,
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
  /** Authored on the certificate type; null falls back to the plain sentence. */
  attestation: string | null
  issuedAt: Date
  /** Stamped when the barangay marked it ready; null where the type states none. */
  validUntil: string | null
  verificationCode: string
  seal: Buffer | null
  sealType: string | null
  captainSignature: Buffer | null
  captainSignatureType: string | null
  secretarySignature: Buffer | null
  secretarySignatureType: string | null
  /**
   * The code of the certificate this one replaces, where it is a reissue.
   *
   * Printed on the face for the reason the municipal document gives: the
   * withdrawn paper was not destroyed, so a resident may be holding both, and a
   * clerk comparing two certificates for the same reference should be able to
   * see which is current without scanning either.
   */
  supersedes: string | null
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
    /**
     * The withdrawn certificate this one replaces, where this is a reissue.
     *
     * Its presence is also what tells the insert which collision it is allowed
     * to have: a release must not mint a second live certificate, while a
     * reissue is a new row beside a withdrawn one and is the whole point.
     */
    reissueOf?: string
  }
): Promise<IssuedBarangayCertificate | null> {
  const verificationCode = makeVerificationCode()
  const content = await renderBarangayCertificate({ ...input.data, verificationCode })
  const fileName = barangayCertificateFileName(
    input.data.certificateName,
    input.data.referenceNo
  )

  // `on conflict do nothing` against the partial unique index: one *live*
  // certificate per request, as a database guarantee rather than something the
  // release path has to remember. A status set to `released` twice cannot mint
  // two; a reissue beside a withdrawn one does not collide at all.
  const inserted = await client.query<{ id: string }>(
    `insert into barangay_documents
       (request_id, verification_code, barangay_id, issued_by, file_name, content,
        byte_size, reissue_of)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (request_id) where revoked_at is null do nothing
     returning id`,
    [
      input.requestId, verificationCode, input.barangayId, input.issuedBy,
      fileName, content, content.length, input.reissueOf ?? null,
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
    const seal = drawableMark(data.seal, data.sealType)

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
    if (data.supersedes) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5)
        .text(
          `REISSUED COPY — replaces withdrawn certificate ${data.supersedes}`,
          left, doc.y + 3, { width, align: 'center', characterSpacing: 0.4 }
        )
    }
    y = doc.y + 24

    // ------------------------------------------------------------------- body
    doc.fillColor(INK).font('Helvetica').fontSize(11)
      .text('TO WHOM IT MAY CONCERN:', left, y, { width })
    doc.moveDown(0.8)

    // What the barangay attests, as the barangay wrote it. A type with none
    // falls back to a sentence that claims only what the barangay actually did
    // — which is what a certificate added in a console gets until somebody
    // authors its text.
    const where = data.residentAddress
      ? `${data.residentAddress}, Barangay ${data.barangayName}`
      : `Barangay ${data.barangayName}`
    const body = data.attestation?.trim()
      ? fillAttestation(data.attestation.trim(), data)
      : `This is to certify that ${data.residentName}, a resident of ${where}, ` +
        `Municipality of ${data.municipality}, Province of ${data.province}, ` +
        `has been issued this ${data.certificateName} by the Barangay Government of ` +
        `${data.barangayName} on ${longDate(data.issuedAt)}.\n\n` +
        `Issued upon the request of the above-named person for the purpose of: ${data.purpose}.`

    const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    paragraphs.forEach((paragraph, i) => {
      doc.text(paragraph, { width, align: 'justify', lineGap: 3 })
      if (i < paragraphs.length - 1) doc.moveDown(0.7)
    })
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

    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('ATTESTED BY', left, sigY, { width: sigWidth, align: 'center', characterSpacing: 0.8 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('ISSUED BY', left + sigWidth + 40, sigY, {
        width: sigWidth, align: 'center', characterSpacing: 0.8,
      })
    drawSignature(doc, {
      x: left, y: sigY + 14, width: sigWidth,
      name: data.secretary, title: 'Barangay Secretary',
      image: drawableMark(data.secretarySignature, data.secretarySignatureType),
    })
    drawSignature(doc, {
      x: left + sigWidth + 40, y: sigY + 14, width: sigWidth,
      name: data.captain, title: 'Punong Barangay',
      image: drawableMark(data.captainSignature, data.captainSignatureType),
    })

    // ------------------------------------------------------------ verification
    //
    // The QR and the code carry the same reference. Both, because they are read
    // by different people: a bank or an employer points a phone at one, and
    // somebody checking over a telephone reads the other out.
    const boxY = sigY + 86
    doc.roundedRect(left, boxY, width, QR_BOX_HEIGHT, 6).fillAndStroke('#f2f5fd', RULE)

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
        'Scan the code or check this reference at the municipality\'s portal. A certificate ' +
          'whose code does not match the record is not one this barangay issued.',
        left + 16, boxY + 53, { width: codeWidth }
      )

    // ----------------------------------------------------------------- footing
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        data.captainSignature || data.secretarySignature
          ? 'Issued electronically by the barangay named above. The signatures are copies held ' +
            'on file — the verification code is what proves this certificate.'
          : 'Issued electronically by the barangay named above. This copy is valid without a manual signature.',
        // High enough that a second line sits inside the bottom margin rather
        // than pushing the footer onto a page of its own.
        left, doc.page.height - 86, { width, align: 'center' }
      )

    doc.end()
  })
}
