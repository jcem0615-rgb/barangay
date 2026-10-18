import qrcode from 'qrcode-generator'
import { env } from './env.ts'

/**
 * The QR printed on every document this app issues.
 *
 * **It does not make a document un-copyable, and nothing printed could.** A
 * photocopy carries the same code, and the code is genuine, so the copy
 * verifies. What the QR buys is that the check *actually happens*: a clerk
 * holding a permit has sixteen characters to type, and in practice nobody
 * types them. A phone camera reads this in a second, which is the difference
 * between a verification rule and a verification habit.
 *
 * What it defeats is the altered printout. The page says one thing, the server
 * says another, and the clerk can see both in the time it takes to point a
 * phone.
 *
 * A QR rather than a barcode, for the reason the digital ID already gives: a
 * 1D barcode holds twenty characters, has no error correction and wants a
 * laser scanner, and a permit lives folded in a wallet. A QR carries a whole
 * URL, every phone camera reads it with no app, and error correction M
 * recovers about 15% of a creased or smudged code.
 */

/**
 * A link into the public check, not the bare code.
 *
 * The scanner is whoever's phone is nearest — a counter clerk, a bank, an
 * employer — and a phone knows what to do with a URL and nothing at all with
 * sixteen loose characters.
 *
 * `?doc=` rather than the `?verify=` the ID card uses, deliberately: that one
 * opens a staff-only, single-use identity check and this one opens a public,
 * repeatable document check. Telling two different checks apart by the shape
 * of the code would be exactly the kind of filter that eventually gets it
 * wrong, so they do not share a parameter.
 */
/**
 * The verification panel is sized around the QR rather than the text.
 *
 * One pair of numbers for all three documents, so the municipal release, the
 * receipt and the barangay certificate print a code of the same size — a clerk
 * who has learnt where to point a phone on one should not have to look for it
 * on the next.
 *
 * 78pt is about 27mm, which puts a 33-module symbol at roughly 0.8mm per
 * module. That is the size this is for: a phone camera, at arm's length, on a
 * page that has been folded into a wallet and printed on whatever the hall
 * owns. A smaller code fits the layout more neatly and is read less reliably,
 * and a code that usually scans is worse than one that always does — the clerk
 * stops trying.
 */
export const QR_SIZE = 78
export const QR_BOX_HEIGHT = 104

export function documentVerificationUrl(code: string): string {
  return `${env.publicUrl}/?doc=${encodeURIComponent(code)}`
}

/**
 * Draws the QR into a PDF as vector squares.
 *
 * Rectangles rather than an embedded image: the modules stay crisp at whatever
 * resolution the hall's printer runs at, and a QR printed soft is a QR that
 * does not scan. `size` is the drawn width of the code itself; the quiet zone
 * the spec requires (four modules of background on every side, which scanners
 * rely on to find the symbol) is drawn *outside* it, so the caller can place
 * the code against a tinted panel without strangling it.
 */
export function drawQr(
  doc: PDFKit.PDFDocument,
  content: string,
  opts: { x: number; y: number; size: number; color?: string }
): void {
  const qr = qrcode(0, 'M') // 0 = smallest version the content fits in
  qr.addData(content)
  qr.make()

  const count = qr.getModuleCount()
  const module = opts.size / count
  const quiet = module * 4

  doc.save()
  // Always dark on white. An inverted code is legal and not reliably read, and
  // a counter is the wrong place to find out which scanners cope.
  doc.rect(opts.x - quiet, opts.y - quiet, opts.size + quiet * 2, opts.size + quiet * 2)
    .fill('#ffffff')
  doc.fillColor(opts.color ?? '#000000')
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue
      // A hair of overlap, so neighbouring modules do not leave a white seam
      // between them when the renderer rounds to device pixels.
      doc.rect(opts.x + col * module, opts.y + row * module, module + 0.2, module + 0.2).fill()
    }
  }
  doc.restore()
}
