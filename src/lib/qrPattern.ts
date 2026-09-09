import qrcode from 'qrcode-generator'

/**
 * A real, scannable QR matrix.
 *
 * This used to be a seeded pseudo-random grid that merely looked like a QR
 * code. On a government ID that is worse than no code at all: a clerk points a
 * phone at it, nothing happens, and the ID looks broken rather than decorative.
 * So it encodes real content now, and nothing draws one without content to put
 * in it.
 *
 * Error correction is **M** (~15% recoverable). A QR on a phone screen is read
 * off glass, at an angle, under whatever light a municipal hall has — L is too
 * fragile for that, and H would push the module count up until the individual
 * squares are smaller than the scan can resolve at this size.
 */
export function generateQrGrid(content: string): boolean[][] {
  // Type 0 picks the smallest version that fits the content.
  const qr = qrcode(0, 'M')
  qr.addData(content)
  qr.make()

  const count = qr.getModuleCount()
  const grid: boolean[][] = []
  for (let r = 0; r < count; r++) {
    const row: boolean[] = []
    for (let c = 0; c < count; c++) row.push(qr.isDark(r, c))
    grid.push(row)
  }
  return grid
}

/**
 * What the QR on a resident's ID actually carries: a link that opens this
 * portal with the verification code already filled in.
 *
 * A link rather than the bare code, because the scanner is the clerk's own
 * phone camera — the same reasoning as handing document photos to the phone's
 * camera app instead of building a preview in the page. Any phone can already
 * read a URL and open it; none of them know what to do with twelve loose
 * characters. The staff side still requires a staff session, so the link is a
 * shortcut into the check, never the check itself.
 */
export function verificationUrl(code: string, origin = window.location.origin): string {
  return `${origin}/?verify=${encodeURIComponent(code)}`
}
