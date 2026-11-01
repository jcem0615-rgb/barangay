import webpush from 'web-push'
import { query } from './db.ts'
import { env } from './env.ts'
import type { NotificationKind } from './notifications.ts'

/**
 * Web Push.
 *
 * The app tells residents it will let them know when a document is ready. Until
 * this, that meant email and SMS — neither configured in a default install — so
 * the promise was empty unless somebody wired a mail server.
 *
 * Subscriptions are per device: the same person on a phone and a laptop is two
 * rows, and both should ring. The endpoint is the identity, so re-subscribing
 * the same browser updates its row rather than stacking a second one that would
 * ring twice.
 */

let configured = false

export function pushEnabled(): boolean {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false
  if (!configured) {
    // The subject tells a push service who to complain to about a misbehaving
    // sender; a mailto is what the spec asks for.
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey)
    configured = true
  }
  return true
}

/**
 * Kinds whose detail must not appear on a lock screen.
 *
 * A push notification is readable by anyone holding the phone, without
 * unlocking it. "Your Cedula is ready" is harmless. "You have been enrolled in
 * 4Ps" is a poverty-programme membership announced to whoever is standing
 * nearby, and a complaint reply can quote the complaint. The people this app
 * serves are exactly the people for whom that is not a small thing.
 *
 * So these push the title and an invitation to open the app, and the real text
 * stays behind the lock screen where the resident chose to put it.
 */
const PRIVATE_KINDS: ReadonlySet<string> = new Set<NotificationKind>([
  'program_granted', 'program_revoked', 'complaint_answered',
  // A barangay complaint is free text and may name a neighbour, so what the
  // barangay wrote back about it is the last thing that should appear on a
  // lock screen in front of whoever is holding the phone. The filing
  // confirmation is private for the same reason — it quotes nothing, but the
  // title alone beside a reference is enough to tell a room that somebody
  // complained.
  'barangay_complaint_filed', 'barangay_complaint_updated',
])

export function pushBodyFor(kind: NotificationKind, body: string): string {
  return PRIVATE_KINDS.has(kind) ? 'Open the app to read it.' : body
}

export interface PushRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Sends to every device a resident has registered.
 *
 * A push service answering 404 or 410 is telling us the subscription is dead —
 * the browser was uninstalled, or the permission revoked. Deleting it there and
 * then is the only thing that stops dead rows accumulating forever and being
 * retried on every notification for the rest of the account's life.
 *
 * Never throws. The notification is already saved and the change it describes
 * already committed; a push service being down is not a reason to fail a
 * resident's request.
 */
export async function pushToResident(
  userId: string, payload: { title: string; body: string; url?: string }
): Promise<{ sent: number; removed: number }> {
  if (!pushEnabled()) return { sent: 0, removed: 0 }

  const rows = await query<PushRow>(
    `select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1`,
    [userId]
  )
  let sent = 0
  let removed = 0

  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 60 * 60 }
      )
      sent += 1
      await query(`update push_subscriptions set last_used_at = now() where id = $1`, [row.id])
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await query(`delete from push_subscriptions where id = $1`, [row.id])
        removed += 1
      } else {
        console.error('push failed', status ?? err)
      }
    }
  }))

  return { sent, removed }
}
