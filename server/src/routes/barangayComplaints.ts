import { mkdtemp, open as openFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import {
  detectEvidenceType, EVIDENCE_DESCRIPTION, isVideo,
  MAX_COMPLAINT_VIDEO_SECONDS, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES,
} from '../uploads.ts'
import { putFileFromPath } from '../storage.ts'
import { sendEvidence } from '../attachments.ts'
import { scanBuffer } from '../antivirus.ts'
import { deliverNotification } from '../notifications.ts'
import {
  complaintFileSchema, notifyComplaint, recordComplaintHistory,
  serializeComplaint, type ComplaintRow, type EvidenceRow, type HistoryRow,
} from '../barangayComplaints.ts'

/**
 * A resident complaining to their own barangay.
 *
 * The barangay had a book the secretary writes (the blotter) and a board the
 * barangay posts to (the notices). Neither ran in this direction: a resident
 * with a photograph of an overflowing bin had nowhere to put it but a walk to
 * the hall.
 *
 * **Everything here is scoped to the resident's own account**, and that is the
 * whole authorization model — there is no complaint id a resident can name that
 * is not theirs, because every statement carries `resident_id = $me`. So
 * another resident's complaint reads as *not found* rather than refused, which
 * is the same answer a complaint that does not exist gives.
 *
 * The barangay comes off the resident's own row too, never from the body. A
 * resident cannot file into a barangay they do not live in, and there is no
 * parameter with which to try.
 */

export const barangayComplaintsRouter = Router()
barangayComplaintsRouter.use(authenticate, requireRole('resident'))

const COMPLAINT_PREFIX = 'BCOM'

/** The resident's own row is the only source of which barangay this is. */
async function residentBarangay(userId: string): Promise<string | null> {
  const row = await one<{ barangay_id: string | null }>(
    `select barangay_id from users where id = $1`,
    [userId]
  )
  return row?.barangay_id ?? null
}

barangayComplaintsRouter.post('/', async (req, res) => {
  const parsed = complaintFileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const barangayId = await residentBarangay(req.user!.id)
  // An account registered before the barangay became a row has none, and every
  // statement here scopes on it. The barangay hub asks for it once; saying so
  // is better than a 500 or a complaint filed into nowhere.
  if (!barangayId) {
    return res.status(409).json({
      error: 'Your account is not attached to a barangay yet. Open the barangay hub and choose yours first.',
    })
  }

  const created = await transaction(async (client) => {
    // From a counter, like every other number in this app: a closed complaint
    // must not free its number for the next one to reuse.
    const year = new Date().getFullYear()
    const seq = await client.query<{ last_number: number }>(
      `insert into barangay_complaint_counters (year, last_number) values ($1, 1)
       on conflict (year) do update
         set last_number = barangay_complaint_counters.last_number + 1
       returning last_number`,
      [year]
    )
    const reference = `${COMPLAINT_PREFIX}-${year}-${String(seq.rows[0]!.last_number).padStart(5, '0')}`

    const inserted = await client.query<ComplaintRow>(
      `insert into barangay_complaints
         (reference_no, barangay_id, resident_id, category, details, location)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [reference, barangayId, req.user!.id, body.category, body.details, body.location ?? null]
    )
    const complaint = inserted.rows[0]!

    // The trail starts where the complaint does, with the resident as the
    // actor, rather than at whatever the barangay does first. Otherwise the
    // history of an untouched complaint is empty and reads as nothing having
    // happened, when what happened is that somebody filed it.
    await recordComplaintHistory(client, {
      complaintId: complaint.id,
      from: null,
      to: 'new',
      note: null,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: 'resident',
    })

    // Their own confirmation, in the same transaction as the filing — the rule
    // everywhere else here. Nothing reaches the person a complaint may name:
    // that name is prose inside `details` and is attached to no account.
    const notification = await notifyComplaint(client, req.user!.id, complaint, 'new')
    return { complaint, notification }
  })

  // After the commit, so a slow mail server cannot hold the filing open.
  void deliverNotification(created.notification)

  res.status(201).json(serializeComplaint(created.complaint))
})

/** The resident's own complaints, newest first. */
barangayComplaintsRouter.get('/', async (req, res) => {
  const rows = await query<ComplaintRow>(
    `select * from barangay_complaints
      where resident_id = $1
      order by filed_at desc`,
    [req.user!.id]
  )
  res.json({ complaints: rows.map((row) => serializeComplaint(row)) })
})

/**
 * One of their own, with its history and its evidence.
 *
 * The history is published to the resident deliberately. The blotter shows a
 * resident nothing at all, because a blotter entry is the barangay's account of
 * a quarrel and half of it is somebody else's side; a complaint is the
 * resident's own words, so the trail of what the barangay then did with it is
 * exactly what they asked for by filing it.
 */
barangayComplaintsRouter.get('/:id', async (req, res) => {
  const complaint = await one<ComplaintRow>(
    `select * from barangay_complaints where id = $1 and resident_id = $2`,
    [req.params.id, req.user!.id]
  )
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })

  const history = await query<HistoryRow>(
    `select from_status, to_status, note, actor_name, actor_role, created_at
       from barangay_complaint_history
      where complaint_id = $1
      order by created_at asc`,
    [complaint.id]
  )
  const evidence = await query<EvidenceRow>(
    `select id, content_type, byte_size, duration_seconds, uploaded_at
       from barangay_complaint_evidence
      where complaint_id = $1
      order by uploaded_at asc`,
    [complaint.id]
  )
  res.json(serializeComplaint(complaint, { history, evidence }))
})

/**
 * Proof, streamed to disk rather than buffered.
 *
 * Five minutes of phone video is a few hundred megabytes and reading one into
 * a Buffer to hash it would make a single upload capable of taking the server
 * down, so it goes to a temporary file and `putFileFromPath` hashes by
 * streaming. Same pipeline as incident evidence; the ceiling is the difference.
 */
const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      void (async () => {
        try {
          done(null, await mkdtemp(join(tmpdir(), 'elgu-complaint-')))
        } catch (error) {
          done(error as Error, '')
        }
      })()
    },
    filename: (_req, _file, done) => done(null, 'upload.bin'),
  }),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
})

barangayComplaintsRouter.post('/:id/evidence', (req, res) => {
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
    if (!temp) return res.status(400).json({ error: 'No file was attached.' })

    try {
      // Theirs, and still open. Adding proof to a complaint the barangay has
      // already resolved would change the record behind a decision that cites
      // it, so it is refused rather than quietly accepted.
      const complaint = await one<{ id: string; status: string }>(
        `select id, status from barangay_complaints where id = $1 and resident_id = $2`,
        [req.params.id, req.user!.id]
      )
      if (!complaint) {
        await cleanup()
        return res.status(404).json({ error: 'Complaint not found.' })
      }
      if (complaint.status === 'resolved' || complaint.status === 'closed') {
        await cleanup()
        return res.status(409).json({
          error: 'This complaint is already finished, so it cannot take new proof. File a new one if it has happened again.',
        })
      }

      const existing = await one<{ count: string }>(
        `select count(*)::text as count from barangay_complaint_evidence where complaint_id = $1`,
        [complaint.id]
      )
      if (Number(existing?.count ?? 0) >= MAX_EVIDENCE_FILES) {
        await cleanup()
        return res.status(409).json({ error: `At most ${MAX_EVIDENCE_FILES} files per complaint.` })
      }

      // Type comes from the leading bytes, never the filename or the declared
      // MIME type: a PDF renamed `photo.jpg` is not proof of a flooded path,
      // and accepting one would put it in a player that cannot play it.
      //
      // Only the first 32 bytes are read, through a handle rather than
      // `readFile`, because the file on the other end of this may be a
      // five-minute video and the point of streaming it to disk was not to
      // hold it in memory.
      const head = Buffer.alloc(32)
      const handle = await openFile(temp, 'r')
      try {
        await handle.read(head, 0, 32, 0)
      } finally {
        await handle.close()
      }
      const detected = detectEvidenceType(head)
      if (!detected) {
        await cleanup()
        return res.status(415).json({ error: `Attach ${EVIDENCE_DESCRIPTION}.` })
      }

      // The browser reads duration off the file before uploading and sends it;
      // the server bounds what it is told rather than trusting it. Demuxing
      // every container server-side to learn the same number is the thing this
      // avoids, and the byte cap is the limit that does not depend on a client.
      const declared = Number(req.body?.durationSeconds)
      const duration = Number.isFinite(declared) && declared > 0 ? Math.round(declared) : null
      if (isVideo(detected.contentType) && duration !== null && duration > MAX_COMPLAINT_VIDEO_SECONDS) {
        await cleanup()
        return res.status(413).json({
          error: `Videos can be up to ${MAX_COMPLAINT_VIDEO_SECONDS / 60} minutes.`,
        })
      }

      // Scanning reads the whole file, so photos are scanned and video goes
      // through on its type and size alone — worth stating rather than
      // implying a video was checked.
      if (!isVideo(detected.contentType)) {
        await scanBuffer(await readFile(temp))
      }

      const stored = await putFileFromPath(temp)
      const inserted = await query<{ id: string; uploaded_at: string }>(
        `insert into barangay_complaint_evidence
           (complaint_id, uploaded_by, file_name, content_type, byte_size, duration_seconds, storage_key, checksum)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, uploaded_at`,
        [
          complaint.id, req.user!.id,
          `proof-${Date.now()}.${detected.extension}`,
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

/** Their own proof back, streamed so a video can be scrubbed rather than re-fetched. */
barangayComplaintsRouter.get('/:id/evidence/:evidenceId', async (req, res) => {
  const row = await one<{ storage_key: string; file_name: string; content_type: string }>(
    `select e.storage_key, e.file_name, e.content_type
       from barangay_complaint_evidence e
       join barangay_complaints c on c.id = e.complaint_id
      where e.id = $1 and e.complaint_id = $2 and c.resident_id = $3`,
    [req.params.evidenceId, req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Evidence not found.' })
  await sendEvidence(req, res, row)
})
