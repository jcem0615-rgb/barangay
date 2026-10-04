import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { requireRole } from '../auth.ts'
import { deliverNotification, recordNotification } from '../notifications.ts'

/**
 * Barangay announcements: the board of notices outside the hall, on a phone.
 *
 * This is the first barangay feature that is *meant* to reach residents. The
 * blotter and the register are the barangay's own books and nothing outside its
 * console can read them; a notice is worthless until the people it concerns
 * have seen it, so the rules invert again.
 *
 * **What is scoped here is relevance, not secrecy.** A resident sees the
 * announcements of the barangay they live in and no other, because a water
 * interruption two barangays away is the noise that teaches people to stop
 * reading the ones that matter.
 *
 * Two routers, because they are mounted differently: the resident's read hangs
 * off the resident barangay router, the writing off the staff one.
 */

export const announcementsStaffRouter = Router()

async function ownBarangay(userId: string) {
  return one<{ id: string; name: string }>(
    `select b.id, b.name from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [userId]
  )
}

interface Row {
  id: string; kind: string; title: string; body: string; urgent: boolean
  expires_at: string | null; archived_at: string | null
  posted_by_name: string | null; created_at: string; updated_at: string
}

export function serializeAnnouncement(row: Row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    urgent: row.urgent,
    expiresAt: row.expires_at,
    archivedAt: row.archived_at,
    postedBy: row.posted_by_name,
    postedAt: row.created_at,
    // A notice corrected after it went out is not the notice people read, and
    // the one who acted on the first version needs to see that it moved.
    editedAt: row.updated_at > row.created_at ? row.updated_at : null,
  }
}

const KINDS = ['general', 'service', 'emergency', 'health', 'event'] as const

const postSchema = z.object({
  kind: z.enum(KINDS).default('general'),
  title: z.string().min(4, 'Give it a title people can scan.').max(160),
  body: z.string().min(10, 'Say what is happening.').max(4000),
  urgent: z.boolean().optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
})

/**
 * Putting a notice up.
 *
 * Both roles may post — a clerk putting up "the hall is closed on Friday" is the
 * ordinary case. Marking one **urgent** is the administrator's alone, because
 * urgent is the only thing here that reaches a phone, and an app where anybody
 * can ring every phone in the barangay is an app whose notifications get turned
 * off — and then the one that mattered goes unread.
 */
announcementsStaffRouter.post('/', async (req, res) => {
  const parsed = postSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  if (body.urgent && req.user!.role !== 'barangay_admin') {
    return res.status(403).json({
      error: 'An urgent notice reaches every resident’s phone, so the barangay administrator posts it.',
    })
  }
  if (body.expiresAt && new Date(body.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: 'That notice would expire before anybody saw it.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const posted = await transaction(async (client) => {
    const inserted = await client.query<Row>(
      `insert into barangay_announcements
         (barangay_id, kind, title, body, urgent, expires_at, posted_by, posted_by_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        barangay.id, body.kind, body.title.trim(), body.body.trim(),
        body.urgent ?? false, body.expiresAt ?? null, req.user!.id, req.user!.fullName,
      ]
    )
    const row = inserted.rows[0]!
    if (!row.urgent) return { row, notified: [] as string[] }

    // Only the residents of this barangay, and only for an urgent notice. The
    // fan-out is one row per resident in the same transaction as the notice, so
    // a notice that was posted was always announced — there is no half state
    // where it is on the board but nobody was told.
    const residents = await client.query<{ id: string }>(
      `select id from users
        where role = 'resident' and barangay_id = $1 and deactivated_at is null`,
      [barangay.id]
    )
    for (const resident of residents.rows) {
      await recordNotification(client, {
        userId: resident.id,
        requestId: null,
        kind: 'barangay_announcement',
        title: `Barangay ${barangay.name}: ${row.title}`,
        body: row.body,
      })
    }
    return { row, notified: residents.rows.map((r) => r.id) }
  })

  // Email, SMS and push go out after the transaction commits, so a slow mail
  // server cannot hold the notice itself open.
  for (const userId of posted.notified) {
    void deliverNotification({
      userId,
      requestId: null,
      kind: 'barangay_announcement',
      title: `Barangay ${barangay.name}: ${posted.row.title}`,
      body: posted.row.body,
    }).catch(() => undefined)
  }

  res.status(201).json({ ...serializeAnnouncement(posted.row), notified: posted.notified.length })
})

const listSchema = z.object({ archived: z.enum(['true', 'false']).optional() })

/** Everything this barangay has posted, including what it has taken down. */
announcementsStaffRouter.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Unknown filter.' })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<Row>(
    `select * from barangay_announcements
      where barangay_id = $1
        and ($2::boolean is null
             or ($2 = true and archived_at is not null)
             or ($2 = false and archived_at is null))
      order by (archived_at is null) desc, urgent desc, created_at desc
      limit 200`,
    [barangay.id, parsed.data.archived === undefined ? null : parsed.data.archived === 'true']
  )
  res.json(rows.map(serializeAnnouncement))
})

const editSchema = z.object({
  kind: z.enum(KINDS).optional(),
  title: z.string().min(4).max(160).optional(),
  body: z.string().min(10).max(4000).optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
})

/**
 * Correcting a notice.
 *
 * `urgent` is deliberately not editable. The notification went when it was
 * posted; letting somebody flip the flag afterwards would either send a second
 * round for the same notice or leave a notice marked urgent that never rang
 * anything. Re-post instead, which is honest about there being a new notice.
 */
announcementsStaffRouter.patch('/:id', async (req, res) => {
  const parsed = editSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data
  if (Object.keys(body).length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await one<Row>(
    `update barangay_announcements
        set kind = coalesce($3::announcement_kind, kind),
            title = coalesce($4, title),
            body = coalesce($5, body),
            expires_at = case when $6 then $7::timestamptz else expires_at end,
            updated_at = now()
      where id = $1 and barangay_id = $2 and archived_at is null
      returning *`,
    [
      req.params.id, barangay.id, body.kind ?? null,
      body.title?.trim() ?? null, body.body?.trim() ?? null,
      'expiresAt' in body, body.expiresAt ?? null,
    ]
  )
  if (!updated) return res.status(404).json({ error: 'Notice not found, or already taken down.' })
  res.json(serializeAnnouncement(updated))
})

/** Taking it down. The administrator's: it is the barangay's public word. */
announcementsStaffRouter.delete('/:id', requireRole('barangay_admin'), async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const archived = await one<{ id: string }>(
    `update barangay_announcements set archived_at = now(), updated_at = now()
      where id = $1 and barangay_id = $2 and archived_at is null
      returning id`,
    [req.params.id, barangay.id]
  )
  if (!archived) return res.status(404).json({ error: 'Notice not found, or already taken down.' })
  res.json({ ok: true })
})

/**
 * The resident's read: the live notices of their own barangay.
 *
 * Expiry is applied here rather than by a job, the same rule `expired` on a
 * programme record follows — a notice stops showing on the day it lapses with
 * nothing scheduled to make that true.
 */
export async function liveAnnouncementsFor(barangayId: string) {
  const rows = await query<Row>(
    `select * from barangay_announcements
      where barangay_id = $1
        and archived_at is null
        and (expires_at is null or expires_at > now())
      order by urgent desc, created_at desc
      limit 50`,
    [barangayId]
  )
  return rows.map(serializeAnnouncement)
}
