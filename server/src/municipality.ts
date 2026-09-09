import type { PoolClient } from 'pg'

/**
 * The audit record for a change to the municipality's own data.
 *
 * Written inside the same transaction as the change it describes, for the same
 * reason notifications are: a log that can be missing the entry for a change
 * that happened is not a log, it is a suggestion. If the write fails the change
 * fails with it.
 *
 * `before` is the whole row as it was. That is what makes the log useful rather
 * than merely accusatory — an administrator who mistypes the fire hotline needs
 * the old number back, not a note that somebody changed it.
 */
export interface AuditEntry {
  actorId: string
  actorName: string
  action: string
  target: string
  before?: unknown
  after?: unknown
}

export async function recordAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `insert into admin_audit (actor_id, actor_name, action, target, before, after)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId,
      entry.actorName,
      entry.action,
      entry.target,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ]
  )
}

/**
 * A phone number a resident can actually dial.
 *
 * Deliberately loose. Philippine numbers are written every which way — (045)
 * 961-2400, 0917 123 4567, +63 2 8888 4000, and a three-digit hotline like 911
 * — and a validator strict enough to have an opinion about which is correct
 * would reject a number that rings perfectly well. All this rules out is the
 * genuinely unusable: something with no digits in it, or long enough to be a
 * paste of something else.
 *
 * The real check is a person ringing it, which is what the pre-launch list in
 * DEPLOY.md asks for.
 */
export function looksDialable(phone: string): boolean {
  const trimmed = phone.trim()
  if (trimmed.length === 0 || trimmed.length > 40) return false
  if (!/^[0-9+().\-\s#*]+$/.test(trimmed)) return false
  return (trimmed.match(/\d/g)?.length ?? 0) >= 3
}

/** A real calendar date, not merely a well-shaped string: 2026-02-31 is not one. */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
}
