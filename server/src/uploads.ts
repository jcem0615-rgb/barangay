/**
 * Upload validation.
 *
 * The browser's declared Content-Type and the uploaded filename are both
 * caller-controlled, so neither decides what a file is — the leading bytes do.
 * A file whose contents don't match one of the accepted types is rejected
 * rather than stored and served back later.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_FILES_PER_REQUEST = 10

interface Signature {
  contentType: string
  extension: string
  /** Bytes that must appear at `offset`. */
  magic: number[]
  offset?: number
}

const SIGNATURES: Signature[] = [
  { contentType: 'application/pdf', extension: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { contentType: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { contentType: 'image/png', extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // HEIC — what an iPhone camera produces, so residents photographing an ID hit
  // this constantly.
  { contentType: 'image/heic', extension: 'heic', magic: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], offset: 4 },
  { contentType: 'image/heic', extension: 'heic', magic: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x78], offset: 4 },
  { contentType: 'image/heic', extension: 'heic', magic: [0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31], offset: 4 },
]

export const ACCEPTED_DESCRIPTION = 'PDF, JPEG, PNG, or HEIC'

/**
 * A portrait must be a picture. Rejecting PDF here is not fussiness: the ID
 * renders the file inline in an <img>, and only image bytes belong there.
 */
export const PORTRAIT_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic'])
export const PORTRAIT_DESCRIPTION = 'JPEG, PNG, or HEIC'

/** A portrait is one small picture; the 10 MB request limit is far too loose. */
export const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024

export interface DetectedType {
  contentType: string
  extension: string
}

/** Returns the real type of the bytes, or null if it isn't one we accept. */
export function detectType(content: Buffer): DetectedType | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0
    if (content.length < offset + sig.magic.length) continue
    if (sig.magic.every((byte, i) => content[offset + i] === byte)) {
      return { contentType: sig.contentType, extension: sig.extension }
    }
  }
  return null
}

/**
 * A display name safe to echo back and to put in a Content-Disposition header.
 * The original is caller-controlled, so directory parts, control characters and
 * quotes come out, and the extension is the one we detected rather than the one
 * the caller claimed.
 */
export function safeFileName(original: string, extension: string): string {
  const base = (original.split(/[\\/]/).pop() ?? 'file')
    .replace(/[\x00-\x1f\x7f"']/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80)
  return `${base || 'file'}.${extension}`
}
