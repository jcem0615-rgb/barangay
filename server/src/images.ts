import { crc32 } from 'node:zlib'
import { inflateSync } from 'node:zlib'

/**
 * Whether a PNG will actually decode, checked before anything tries to draw it.
 *
 * This exists because of a crash rather than a theory. The magic bytes say a
 * file is a PNG; they say nothing about whether its pixel data is intact. A PNG
 * with a damaged `IDAT` — a truncated upload, a byte flipped in transit — passes
 * every check this app had, is stored, previews as a broken image in the
 * console, and then **takes the process down** the first time a document is
 * released with it: pdfkit's PNG decoder inflates the pixel data inside a zlib
 * callback and throws from there, which is outside any try/catch the renderer
 * can put around `doc.image()`. One bad seal would have meant every release
 * failing until somebody found it.
 *
 * So the same inflate is done here, up front, where it can be caught: the
 * upload is refused while the person is still looking at the file they chose,
 * and `drawableMark` asks again at render time so a mark already in the store
 * from before this check is simply left off rather than fatal. That is the
 * promise the renderers already make everywhere else — a mark that cannot be
 * read is never a reason to fail a release.
 *
 * Chunk CRCs are checked too, since that is what catches the damage before the
 * inflate has to, and it is the same arithmetic.
 *
 * JPEG needs no equivalent: pdfkit only parses its markers, synchronously, and
 * throws where the renderer can catch it.
 */
export function pngDecodes(bytes: Buffer): boolean {
  if (bytes.length < 8) return false

  const idat: Buffer[] = []
  let offset = 8
  let sawHeader = false

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    const dataEnd = offset + 8 + length
    // A declared length running past the file is the truncated-upload case.
    if (length > bytes.length || dataEnd + 4 > bytes.length) return false

    const declared = bytes.readUInt32BE(dataEnd)
    if (crc32(bytes.subarray(offset + 4, dataEnd)) !== declared) return false

    if (type === 'IHDR') sawHeader = true
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, dataEnd))
    if (type === 'IEND') break

    offset = dataEnd + 4
  }

  if (!sawHeader || idat.length === 0) return false
  try {
    inflateSync(Buffer.concat(idat))
    return true
  } catch {
    return false
  }
}
