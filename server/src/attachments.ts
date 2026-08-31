import type { Response } from 'express'
import { getFile } from './storage.ts'

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
