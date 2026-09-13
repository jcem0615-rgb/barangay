import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'

import { pushEnabled } from '../push.ts'
import { env } from '../env.ts'

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

// ---------------------------------------------------------------------------
// Push subscriptions
//
// One row per browser. The endpoint is the identity, so a browser that
// re-subscribes replaces its own row rather than stacking a second one that
// would ring twice.
// ---------------------------------------------------------------------------

const subscriptionBody = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
})

/**
 * What the browser needs before it can subscribe at all: the public half of the
 * VAPID key pair. Public by definition — it is handed to every push service —
 * but it still requires a session, because there is no reason for the app to
 * describe its own push setup to someone who is not using it.
 */
notificationsRouter.get('/push-key', (_req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? env.vapidPublicKey : null })
})

notificationsRouter.get('/push', async (req, res) => {
  res.json(
    await query(
      `select id, user_agent as "userAgent", created_at as "createdAt",
              last_used_at as "lastUsedAt"
         from push_subscriptions where user_id = $1 order by created_at`,
      [req.user!.id]
    )
  )
})

notificationsRouter.post('/push', async (req, res) => {
  if (!pushEnabled()) {
    return res.status(503).json({ error: 'Push is not configured on this server.' })
  }
  const parsed = subscriptionBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'That is not a push subscription.' })
  const { endpoint, keys } = parsed.data

  // A subscription belongs to whoever is signed in now. Two people sharing a
  // phone means the second sign-in takes the browser over — which is right:
  // the notifications that arrive should be the ones for the account using it.
  const rows = await query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh,
           auth = excluded.auth, user_agent = excluded.user_agent
     returning id, user_agent as "userAgent", created_at as "createdAt"`,
    [req.user!.id, endpoint, keys.p256dh, keys.auth, String(req.get('user-agent') ?? '').slice(0, 300)]
  )
  res.status(201).json(rows[0])
})

notificationsRouter.delete('/push', async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  if (!endpoint) return res.status(400).json({ error: 'Say which subscription to remove.' })
  await query(
    `delete from push_subscriptions where user_id = $1 and endpoint = $2`,
    [req.user!.id, endpoint]
  )
  res.status(204).end()
})
