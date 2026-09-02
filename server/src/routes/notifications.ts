import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'

export const notificationsRouter = Router()
notificationsRouter.use(authenticate, requireRole('resident'))

/** A resident's own notifications, newest first. */
notificationsRouter.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100)
  const rows = await query(
    `select id, request_id as "requestId", kind, title, body,
            created_at as "createdAt", read_at as "readAt"
       from notifications
      where user_id = $1
      order by created_at desc
      limit $2`,
    [req.user!.id, limit]
  )
  const unread = await one<{ count: number }>(
    `select count(*)::int as count from notifications where user_id = $1 and read_at is null`,
    [req.user!.id]
  )
  res.json({ notifications: rows, unread: unread?.count ?? 0 })
})

notificationsRouter.post('/:id/read', async (req, res) => {
  const row = await one<{ id: string }>(
    `update notifications set read_at = coalesce(read_at, now())
      where id = $1 and user_id = $2 returning id`,
    [req.params.id, req.user!.id]
  )
  if (!row) return res.status(404).json({ error: 'Notification not found.' })
  res.status(204).end()
})

notificationsRouter.post('/read-all', async (req, res) => {
  await query(
    `update notifications set read_at = now() where user_id = $1 and read_at is null`,
    [req.user!.id]
  )
  res.status(204).end()
})

const preferencesSchema = z.object({
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
  // Philippine mobile numbers, in local or international form.
  phone: z.string().regex(/^(\+63|0)9\d{9}$/, 'Enter a mobile number like 09171234567.').or(z.literal('')).optional(),
})

notificationsRouter.get('/preferences', async (req, res) => {
  const row = await one(
    `select u.notify_email as "notifyEmail", u.notify_sms as "notifySms", rp.phone
       from users u
       left join resident_profiles rp on rp.user_id = u.id
      where u.id = $1`,
    [req.user!.id]
  )
  res.json(row)
})

notificationsRouter.patch('/preferences', async (req, res) => {
  const parsed = preferencesSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  if (body.notifyEmail !== undefined || body.notifySms !== undefined) {
    await query(
      `update users
          set notify_email = coalesce($2, notify_email),
              notify_sms = coalesce($3, notify_sms)
        where id = $1`,
      [req.user!.id, body.notifyEmail ?? null, body.notifySms ?? null]
    )
  }
  if (body.phone !== undefined) {
    await query(
      `update resident_profiles set phone = $2 where user_id = $1`,
      [req.user!.id, body.phone || null]
    )
  }

  const row = await one(
    `select u.notify_email as "notifyEmail", u.notify_sms as "notifySms", rp.phone
       from users u
       left join resident_profiles rp on rp.user_id = u.id
      where u.id = $1`,
    [req.user!.id]
  )
  res.json(row)
})
