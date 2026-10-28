import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { one } from '../db.ts'
import { env } from '../env.ts'
import { configuredTier, productName, configuredMunicipality } from '../deployment.ts'

/**
 * What a deployment tells the people who run it, and nothing else.
 *
 * The owner portal needs to know that a town's instance is alive, which
 * version it is on, and roughly how much it is being used. It has no business
 * knowing *who* uses it — and the whole isolation model of this app is that
 * there is no account anywhere that can see across two municipalities. A
 * control plane holding every `DATABASE_URL` and querying residents directly
 * would throw that away in one line and would be the single most valuable
 * target in the system.
 *
 * So the owner never reads a deployment's database. It asks the deployment,
 * over HTTP, and what comes back is **counts, identity and health**: no name,
 * no address, no reference number, no row of any kind. Everything here is a
 * number or a fact about the instance itself. A leak of this endpoint's entire
 * output tells somebody how busy a barangay is.
 *
 * **It is not mounted unless `OPS_TOKEN` is set**, which is the same rule the
 * hall's routers follow in barangay tier: a route that answers 401 still tells
 * a caller it exists and is one mistake away from answering properly, while a
 * route that was never mounted cannot be reached at all. A deployment that is
 * not being monitored therefore has no ops surface whatsoever.
 */
export const opsRouter = Router()

/** When this process came up — the one thing only the process itself knows. */
const STARTED_AT = new Date()

/**
 * Constant-time, and length-safe.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a
 * timing signal and, worse, a 500 instead of a 401. The lengths are compared
 * first and a mismatch is simply false.
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

opsRouter.use((req, res, next) => {
  const expected = env.opsToken
  // Belt and braces: the mount is conditional, so this cannot normally happen.
  if (!expected) return res.status(404).json({ error: 'Not found.' })

  const header = req.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!given || !tokenMatches(given, expected)) {
    return res.status(401).json({ error: 'Not authorised.' })
  }
  next()
})

/** One scalar count, or null where the table does not exist in this tier. */
async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: number }>(sql, params)
  return Number(row?.n ?? 0)
}

/**
 * The state of this deployment, as numbers.
 *
 * Read in one go rather than streamed or paged: every figure here is a
 * `count(*)` over a table a municipality's size, and the whole answer is a few
 * hundred bytes. The owner portal polls this on a schedule, so it is also
 * deliberately cheap — no joins, no scans of anything but indexes and small
 * tables.
 */
opsRouter.get('/status', async (_req, res) => {
  const tier = configuredTier()
  const municipality = await one<{ code: string; name: string; province: string }>(
    `select code, name, province from municipality limit 1`
  )
  const barangay =
    tier === 'barangay'
      ? await one<{ id: string; name: string }>(`select id, name from barangays limit 1`)
      : null

  const [
    residents, staffAccounts, barangayAccounts, barangays,
    requests, requestsOpen, documents, receipts, payments,
    certificateRequests, certificateRequestsOpen, certificates,
    notices, households, householdMembers, blotterEntries,
    attachments, appointments, complaints, incidents, verifications,
  ] = await Promise.all([
    count(`select count(*)::int as n from users where role = 'resident'`),
    count(`select count(*)::int as n from users where role in ('staff','admin')`),
    count(`select count(*)::int as n from users where role in ('barangay_admin','barangay_officer','barangay_kagawad')`),
    count(`select count(*)::int as n from barangays`),
    count(`select count(*)::int as n from requests`),
    count(`select count(*)::int as n from requests where status not in ('completed','rejected')`),
    count(`select count(*)::int as n from documents`),
    count(`select count(*)::int as n from receipts`),
    count(`select count(*)::int as n from payments where status = 'settled'`),
    count(`select count(*)::int as n from barangay_requests`),
    count(`select count(*)::int as n from barangay_requests where status not in ('released','rejected')`),
    count(`select count(*)::int as n from barangay_documents`),
    count(`select count(*)::int as n from barangay_announcements where archived_at is null`),
    count(`select count(*)::int as n from households where status = 'active'`),
    count(`select count(*)::int as n from household_members`),
    count(`select count(*)::int as n from blotter_entries`),
    count(`select count(*)::int as n from attachments`),
    count(`select count(*)::int as n from appointments`),
    count(`select count(*)::int as n from complaints`),
    count(`select count(*)::int as n from incident_reports`),
    count(`select count(*)::int as n from document_verifications`),
  ])

  /**
   * The newest timestamp anything happened at, across the two tables that
   * actually move daily. It is what tells an owner the difference between a
   * deployment that is quiet and one that is dead — an instance can be up,
   * answering health checks and migrated, with nobody having touched it for a
   * month, and that is the thing worth ringing the customer about.
   */
  const lastActivity = await one<{ at: string | null }>(
    `select greatest(
       (select max(submitted_at) from requests),
       (select max(requested_at) from barangay_requests),
       (select max(created_at) from users)
     )::text as at`
  )

  const migrations = await count(`select count(*)::int as n from schema_migrations`)

  res.json({
    // Identity. The owner matches this against what it has on record, so a
    // deployment answering under the wrong name is visible rather than silent
    // — the same reasoning as the municipality check on boot.
    tier,
    productName: productName(),
    municipality: municipality ?? null,
    barangay: barangay ?? null,
    configuredFrom: configuredMunicipality().source,

    // Health.
    startedAt: STARTED_AT.toISOString(),
    serverTime: new Date().toISOString(),
    migrations,
    publicUrl: env.publicUrl,
    // Whether the things a live deployment must have are actually on. An
    // instance taking real submissions with no virus scanning and no mail is
    // the state the pre-launch checklist exists to prevent, and it is
    // invisible from outside unless the deployment says so.
    mail: env.mailTransport,
    sms: env.smsTransport,
    push: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
    virusScanning: Boolean(env.clamavHost),
    paymentProvider: env.paymentProvider,

    // Use. Counts only — there is no name or row in this response anywhere.
    counts: {
      residents, staffAccounts, barangayAccounts, barangays,
      requests, requestsOpen, documents, receipts, payments,
      certificateRequests, certificateRequestsOpen, certificates,
      notices, households, householdMembers, blotterEntries,
      attachments, appointments, complaints, incidents, verifications,
    },
    lastActivity: lastActivity?.at ?? null,
  })
})
