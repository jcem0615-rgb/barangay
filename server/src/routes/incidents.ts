import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { open as openFile, rm } from 'node:fs/promises'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import {
  detectEvidenceType, EVIDENCE_DESCRIPTION, isVideo,
  MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, MAX_EVIDENCE_SECONDS,
} from '../uploads.ts'
import { putFileFromPath, removeFile } from '../storage.ts'
import { scanBuffer } from '../antivirus.ts'

/**
 * Reporting something that has gone wrong.
 *
 * The hotlines answer the thing happening *now*. This is the other half: a
 * flooded road, a downed line, a fire that is already out — something the
 * municipality needs to know about and send somebody to, with a photograph or a
 * video so the office is not dispatching on a description alone.
 *
 * It is deliberately **not** a request. Nobody applied for anything, there is no
 * fee, no workflow and no document at the end, so folding it into `requests`
 * would put a thing with none of those in every department's queue.
 */

export const incidentsRouter = Router()
incidentsRouter.use(authenticate, requireRole('resident'))

const KINDS = [
  'flood', 'fire', 'road', 'power', 'medical', 'crime', 'garbage', 'other',
] as const

const reportSchema = z.object({
  kind: z.enum(KINDS),
  description: z.string().min(10, 'Say what happened, in a sentence or two.').max(2000),
  location: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

const INCIDENT_PREFIX = 'INC'

incidentsRouter.post('/', async (req, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const created = await transaction(async (client) => {
    // From a counter rather than a row count, like request and queue numbers: a
    // deleted report must not free its number for a second one to reuse.
    const year = new Date().getFullYear()
    const seq = await client.query<{ last_number: number }>(
      `insert into incident_counters (year, last_number) values ($1, 1)
       on conflict (year) do update set last_number = incident_counters.last_number + 1
       returning last_number`,
      [year]
    )
    const referenceNo = `${INCIDENT_PREFIX}-${year}-${String(seq.rows[0]!.last_number).padStart(5, '0')}`

    const inserted = await client.query<{ id: string; reference_no: string; reported_at: string }>(
      `insert into incident_reports
         (reference_no, reporter_id, kind, description, location, latitude, longitude)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, reference_no, reported_at`,
      [
        referenceNo, req.user!.id, body.kind, body.description,
        body.location ?? null, body.latitude ?? null, body.longitude ?? null,
      ]
    )
    return inserted.rows[0]!
  })

  res.status(201).json({
    id: created.id,
    referenceNo: created.reference_no,
    reportedAt: created.reported_at,
    status: 'new',
    evidence: [],
  })
})

/** What the resident filed, so they can follow it up. */
incidentsRouter.get('/', async (req, res) => {
  const rows = await query<{
    id: string; reference_no: string; kind: string; description: string
    location: string | null; status: string; reported_at: string
    office_note: string | null; handled_at: string | null; evidence_count: string
  }>(
    `select r.id, r.reference_no, r.kind, r.description, r.location, r.status,
            r.reported_at, r.office_note, r.handled_at,
            (select count(*) from incident_evidence e where e.incident_id = r.id) as evidence_count
       from incident_reports r
      where r.reporter_id = $1
      order by r.reported_at desc
      limit 50`,
    [req.user!.id]
  )
  res.json(rows.map(serializeForResident))
})

function serializeForResident(row: {
  id: string; reference_no: string; kind: string; description: string
  location: string | null; status: string; reported_at: string
  office_note: string | null; handled_at: string | null; evidence_count?: string
}) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    kind: row.kind,
    description: row.description,
    location: row.location,
    status: row.status,
    reportedAt: row.reported_at,
    officeNote: row.office_note,
    handledAt: row.handled_at,
    evidenceCount: Number(row.evidence_count ?? 0),
  }
}

/**
 * Evidence, streamed to disk rather than buffered.
 *
 * Every other upload in this app is a photograph or a PDF and fits in memory.
 * Half an hour of phone video does not, and reading one into a Buffer to hash
 * it would make a single upload capable of taking the server down.
 */
const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      mkdtemp(join(tmpdir(), 'elgu-evidence-')).then((dir) => done(null, dir), done)
    },
    filename: (_req, _file, done) => done(null, 'upload.bin'),
  }),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
})

incidentsRouter.post('/:id/evidence', (req, res) => {
  evidenceUpload.single('file')(req, res, async (uploadError) => {
    const temp = req.file?.path
    const cleanup = async () => {
      if (temp) await rm(join(temp, '..'), { recursive: true, force: true }).catch(() => undefined)
    }

    if (uploadError) {
      await cleanup()
      const tooBig = (uploadError as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig
          ? `That file is larger than ${Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB. Record a shorter clip, or send a photo.`
          : 'Could not read that upload.',
      })
    }
    if (!req.file || !temp) return res.status(400).json({ error: 'Choose a photo or video.' })

    try {
      const incident = await one<{ id: string; status: string }>(
        `select id, status from incident_reports where id = $1 and reporter_id = $2`,
        [req.params.id, req.user!.id]
      )
      if (!incident) {
        await cleanup()
        return res.status(404).json({ error: 'Report not found.' })
      }
      // Once the office has closed it, the record of what was sent stands.
      if (incident.status === 'closed' || incident.status === 'resolved') {
        await cleanup()
        return res.status(409).json({ error: 'This report is closed and no longer accepts files.' })
      }

      const existing = await one<{ count: string }>(
        `select count(*) as count from incident_evidence where incident_id = $1`,
        [incident.id]
      )
      if (Number(existing?.count ?? 0) >= MAX_EVIDENCE_FILES) {
        await cleanup()
        return res.status(409).json({ error: `At most ${MAX_EVIDENCE_FILES} files per report.` })
      }

      // Type from the leading bytes, never the filename or the declared type —
      // the same rule as every other upload. Only the head is read, so this
      // costs the same for a 2 GB video as for a photo.
      const handle = await openFile(temp, 'r')
      const head = Buffer.alloc(32)
      try {
        await handle.read(head, 0, 32, 0)
      } finally {
        await handle.close()
      }
      const detected = detectEvidenceType(head)
      if (!detected) {
        await cleanup()
        return res.status(415).json({ error: `Evidence must be ${EVIDENCE_DESCRIPTION}.` })
      }

      // The browser reads duration off the file before uploading and sends it;
      // it is a courtesy value, so it is bounded here rather than trusted. The
      // byte cap above is the limit the server actually enforces.
      const declared = Number(req.body?.durationSeconds)
      const duration = Number.isFinite(declared) && declared > 0 ? Math.round(declared) : null
      if (isVideo(detected.contentType) && duration !== null && duration > MAX_EVIDENCE_SECONDS) {
        await cleanup()
        return res.status(413).json({
          error: `Videos can be up to ${MAX_EVIDENCE_SECONDS / 60} minutes.`,
        })
      }

      // Scanning reads the file, so it is only attempted where it is configured
      // and the file is small enough to hand over; a video goes through on its
      // type and size alone, which is worth saying out loud rather than
      // implying it was checked.
      if (!isVideo(detected.contentType)) {
        const content = await (await import('node:fs/promises')).readFile(temp)
        await scanBuffer(content)
      }

      const stored = await putFileFromPath(temp)
      const inserted = await query<{ id: string; uploaded_at: string }>(
        `insert into incident_evidence
           (incident_id, uploaded_by, file_name, content_type, byte_size, duration_seconds, storage_key, checksum)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, uploaded_at`,
        [
          incident.id, req.user!.id,
          `evidence-${Date.now()}.${detected.extension}`,
          detected.contentType, stored.byteSize, duration, stored.storageKey, stored.checksum,
        ]
      )
      await cleanup()

      res.status(201).json({
        id: inserted[0]!.id,
        contentType: detected.contentType,
        byteSize: stored.byteSize,
        durationSeconds: duration,
        uploadedAt: inserted[0]!.uploaded_at,
      })
    } catch (error) {
      await cleanup()
      const message = error instanceof Error ? error.message : 'Could not store that file.'
      res.status(400).json({ error: message })
    }
  })
})

export { KINDS as INCIDENT_KINDS, serializeForResident }
export { removeFile as removeEvidenceFile }
