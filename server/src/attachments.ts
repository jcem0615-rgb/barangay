import type { Response } from 'express'
import { fileSize, fileStream, getFile } from './storage.ts'

/**
 * Always sent as a download, never rendered inline. A resident-supplied PDF can
 * carry script, so letting the browser open one on our origin would make an
 * upload into stored XSS. nosniff is already set globally by helmet.
 */
export async function sendAttachment(
  res: Response,
  row: { storage_key: string; file_name: string; content_type: string }
) {
  let content: Buffer
  try {
    content = await getFile(row.storage_key)
  } catch {
    return res.status(410).json({ error: 'That file is no longer available.' })
  }
  res.setHeader('Content-Type', row.content_type)
  res.setHeader('Content-Disposition', `attachment; filename="${row.file_name}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(content)
}

/**
 * Evidence on an incident report, played in the console rather than downloaded.
 *
 * This is the one place a stored upload is served inline, and the reason it is
 * safe here and not for request attachments is the type set: evidence is only
 * ever a picture or a video, sniffed from its own leading bytes, and neither can
 * carry script the way a resident-supplied PDF can. `nosniff` still stands, so
 * the browser treats it as exactly what we say it is.
 *
 * Ranged, because a player that cannot seek makes somebody watch thirty minutes
 * of video to find the ten seconds that matter.
 */
export async function sendEvidence(
  req: { headers: Record<string, string | string[] | undefined> },
  res: Response,
  row: { storage_key: string; file_name: string; content_type: string }
) {
  let total: number
  try {
    total = await fileSize(row.storage_key)
  } catch {
    return res.status(410).json({ error: 'That file is no longer available.' })
  }

  res.setHeader('Content-Type', row.content_type)
  res.setHeader('Content-Disposition', `inline; filename="${row.file_name}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Accept-Ranges', 'bytes')

  const header = req.headers.range
  const match = typeof header === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!match) {
    res.setHeader('Content-Length', String(total))
    return fileStream(row.storage_key).pipe(res)
  }

  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1
  if (!Number.isFinite(start) || start >= total || end < start) {
    res.setHeader('Content-Range', `bytes */${total}`)
    return res.status(416).end()
  }

  res.status(206)
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
  res.setHeader('Content-Length', String(end - start + 1))
  fileStream(row.storage_key, { start, end }).pipe(res)
}
