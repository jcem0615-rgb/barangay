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

/**
 * The municipality's seal, for the official receipt.
 *
 * PNG and JPEG only, and narrower than the portrait rule on purpose: this image
 * is drawn into a PDF, and the PDF writer embeds nothing else. HEIC is a
 * perfectly good photograph and a seal that cannot be printed — accepting one
 * would mean an administrator uploading a seal, seeing it in the console, and
 * finding out it is missing only when a resident opens a receipt.
 */
export const SEAL_TYPES = new Set(['image/png', 'image/jpeg'])
export const SEAL_DESCRIPTION = 'PNG or JPEG'

/** A seal is a small mark. 2 MB is already generous for one. */
export const MAX_SEAL_BYTES = 2 * 1024 * 1024

/**
 * Evidence on an incident report: a photograph, or a video.
 *
 * Video is a different animal from every other upload here. A requirement photo
 * is a few hundred KB; half an hour of phone video is a gigabyte or more, which
 * is why evidence is streamed to disk rather than buffered in memory like the
 * rest, and why the ceiling is expressed two ways.
 *
 * **Duration is the rule residents were given: thirty minutes.** It is checked
 * in the browser, because duration is only cheaply knowable where the file and a
 * decoder already are — reading it server-side would mean demuxing the container
 * for every upload.
 *
 * **Bytes are the rule the server can actually enforce**, and the two do not
 * line up: 30 minutes at a modern phone's 1080p bitrate is roughly 1–2 GB, so a
 * long recording at full quality will hit the byte cap before the time limit.
 * Raise `MAX_EVIDENCE_MB` if the deployment's storage and connection can take
 * it — but a resident uploading a gigabyte over mobile data at the scene of
 * something is not a thing that completes, and the honest fix for long video is
 * resumable upload straight to object storage rather than a bigger number here.
 */
export const MAX_EVIDENCE_SECONDS = 30 * 60

/**
 * The ceiling for a **barangay complaint's** video, which is five minutes
 * rather than thirty.
 *
 * It is a separate constant rather than a lower global because the two are
 * different promises to different people: an incident report is a municipal
 * surface with its own history, and narrowing it here would quietly shorten
 * what residents of a municipal deployment have already been told they can
 * send.
 *
 * Five is also the first of these numbers that is **honest about the byte cap
 * above it.** Thirty minutes of 1080p is 1–2 GB and hits `MAX_EVIDENCE_BYTES`
 * long before the clock, so the duration limit was advice the server could not
 * keep; five minutes is a few hundred megabytes, which fits inside 512 MB and
 * is an upload a phone on mobile data can actually finish. A limit that agrees
 * with the one underneath it is the point — a resident whose proof is rejected
 * after five minutes of uploading stops sending proof.
 */
export const MAX_COMPLAINT_VIDEO_SECONDS = 5 * 60

export const MAX_EVIDENCE_BYTES =
  Number(process.env.MAX_EVIDENCE_MB ?? 512) * 1024 * 1024

export const MAX_EVIDENCE_FILES = 6

const VIDEO_SIGNATURES: Signature[] = [
  // ISO base media (MP4 and QuickTime both): "ftyp" at offset 4, then a brand.
  { contentType: 'video/mp4', extension: 'mp4', magic: [0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], offset: 4 },
  { contentType: 'video/mp4', extension: 'mp4', magic: [0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32], offset: 4 },
  // What an iPhone camera produces.
  { contentType: 'video/quicktime', extension: 'mov', magic: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20], offset: 4 },
  // What Android Chrome's MediaRecorder produces: Matroska/WebM.
  { contentType: 'video/webm', extension: 'webm', magic: [0x1a, 0x45, 0xdf, 0xa3] },
]

export const EVIDENCE_DESCRIPTION = 'JPEG, PNG, HEIC, MP4, MOV, or WebM'

/** True for the video types evidence accepts. */
export function isVideo(contentType: string): boolean {
  return contentType.startsWith('video/')
}

/**
 * The real type of an evidence file. Pictures and video only — a PDF is not
 * evidence of a flooded road, and accepting one here would mean a document
 * rendered in a player that cannot play it.
 */
export function detectEvidenceType(head: Buffer): DetectedType | null {
  for (const sig of [...SIGNATURES, ...VIDEO_SIGNATURES]) {
    if (sig.contentType === 'application/pdf') continue
    const offset = sig.offset ?? 0
    if (head.length < offset + sig.magic.length) continue
    if (sig.magic.every((byte, i) => head[offset + i] === byte)) {
      return { contentType: sig.contentType, extension: sig.extension }
    }
  }
  return null
}

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
