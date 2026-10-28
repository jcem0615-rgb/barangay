import qrcode from 'qrcode-generator'

/**
 * A real, scannable QR, drawn as vector rectangles.
 *
 * The same decision the documents' codes are drawn with one level down: rects
 * rather than an embedded image, so it stays crisp at whatever resolution the
 * printer runs at. A QR printed soft is a QR that does not scan, and the
 * people scanning this one are residents in a barangay hall holding whatever
 * phone they own.
 *
 * Error correction **M** (~15% recoverable). A poster taped to a wall gets
 * creased, rained on and photographed at an angle; L is too fragile for that,
 * and H pushes the module count up until the squares are smaller than a cheap
 * camera resolves at this size.
 */
export function qrSvg(content: string, opts: { size?: number; ink?: string; id?: string } = {}): string {
  const { size = 200, ink = '#111c44' } = opts
  const qr = qrcode(0, 'M')
  qr.addData(content)
  qr.make()

  const n = qr.getModuleCount()
  // Four modules of quiet zone on every side: the spec requires it and
  // scanners rely on it. A code printed hard against a border is the classic
  // reason one will not read.
  const span = n + 8

  let rects = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) rects += `<rect x="${c + 4}" y="${r + 4}" width="1" height="1"/>`
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}"
    shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeAttr(content)}">
    <rect width="${span}" height="${span}" fill="#ffffff"/>
    <g fill="${ink}">${rects}</g>
  </svg>`
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
