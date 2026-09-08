/**
 * Shrinks a photo before it is uploaded.
 *
 * A phone camera produces a 3–8 MB image of a document that only ever needs to
 * be legible on a clerk's screen. On the connections this app is used over,
 * sending the original is a minute of waiting and a real chance of failure, so
 * the photo is re-encoded at a sane size first.
 *
 * Deliberately conservative: anything the browser cannot decode is passed
 * through untouched rather than rejected, and a result that came out larger
 * than the original is discarded. The upload always gets a real file.
 */

/** Long edge for a photographed document — comfortably readable, ~10x smaller. */
export const DOCUMENT_MAX_EDGE = 2000

/** A portrait on an ID card is small on screen and never needs more. */
export const PORTRAIT_MAX_EDGE = 900

const JPEG_QUALITY = 0.82

/** HEIC decodes in almost no browser's canvas, so it is never re-encoded. */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface CompressOptions {
  maxEdge?: number
  /** Crop to a centred square — what an ID portrait wants. */
  square?: boolean
}

export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxEdge = DOCUMENT_MAX_EDGE, square = false } = options
  if (!COMPRESSIBLE.has(file.type)) return file

  let bitmap: ImageBitmap
  try {
    // `from-image` applies the EXIF rotation a phone records rather than
    // baking in, so a portrait photo does not arrive on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  try {
    const source = square ? centredSquare(bitmap) : { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
    const scale = Math.min(1, maxEdge / Math.max(source.w, source.h))
    const width = Math.max(1, Math.round(source.w * scale))
    const height = Math.max(1, Math.round(source.h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, source.x, source.y, source.w, source.h, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    // A small or already-optimised image can come out bigger; keep the original.
    if (!blob || (blob.size >= file.size && !square)) return file

    return new File([blob], renameToJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    bitmap.close()
  }
}

function centredSquare(bitmap: ImageBitmap) {
  const size = Math.min(bitmap.width, bitmap.height)
  return {
    x: Math.round((bitmap.width - size) / 2),
    y: Math.round((bitmap.height - size) / 2),
    w: size,
    h: size,
  }
}

/** The bytes are JPEG now, so the name must not still claim otherwise. */
function renameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]*$/, '') || 'photo'
  return `${base}.jpg`
}
