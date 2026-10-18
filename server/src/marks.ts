import multer from 'multer'
import { detectType, MAX_SEAL_BYTES, SEAL_DESCRIPTION, SEAL_TYPES } from './uploads.ts'
import { scanBuffer } from './antivirus.ts'

/**
 * A seal or a signature: the two pictures an official document is printed with.
 *
 * They are the same kind of file under the same rules, so they share one check
 * rather than four copies of it that drift. PNG and JPEG only, decided by the
 * leading bytes rather than the filename, because the PDF writer embeds nothing
 * else — a HEIC seal would be accepted, previewed in the console, and then
 * silently missing from every document printed with it.
 *
 * Scanned in memory, so nothing infected reaches disk, and it fails closed
 * where a scanner is configured and unreachable, exactly as attachments do.
 */
export const markUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SEAL_BYTES, files: 1 },
})

export type MarkCheck =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; status: number; error: string }

/**
 * @param what  what the picture is, for the refusal a person reads — "a seal",
 *              "a signature". The message names what it will be printed on,
 *              since that is why the type is narrow.
 */
export async function checkMark(
  file: Express.Multer.File | undefined,
  what: string,
  printedOn: string
): Promise<MarkCheck> {
  if (!file) return { ok: false, status: 400, error: 'Choose an image to upload.' }

  const detected = detectType(file.buffer)
  if (!detected || !SEAL_TYPES.has(detected.contentType)) {
    return {
      ok: false,
      status: 415,
      error: `${what} has to be a ${SEAL_DESCRIPTION} image — those are the two ${printedOn} can be printed with.`,
    }
  }

  const scan = await scanBuffer(file.buffer)
  if (scan.status === 'infected') {
    return { ok: false, status: 422, error: 'That file was rejected by our virus scan.' }
  }
  if (scan.status === 'unavailable') {
    console.error(`virus scan unavailable: ${scan.reason}`)
    return {
      ok: false,
      status: 503,
      error: "We can't check files for viruses right now. Please try again shortly.",
    }
  }

  return { ok: true, bytes: file.buffer, contentType: detected.contentType }
}

/**
 * Serves a stored mark inline, for the preview in a console.
 *
 * Inline is safe only because the type came from the magic bytes and SVG is not
 * among the accepted ones; `nosniff` still stands, and nothing is cached.
 */
export function sendMark(
  res: import('express').Response,
  content: Buffer,
  contentType: string | null
): void {
  res.setHeader('Content-Type', contentType ?? 'image/png')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(content)
}
