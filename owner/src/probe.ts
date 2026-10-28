import { env } from './env.ts'
import { query, one } from './db.ts'
import { unseal } from './seal.ts'
import type { Deployment } from './registry.ts'

/**
 * Asking each deployment how it is.
 *
 * **The owner never reads a customer's database.** It asks the instance over
 * HTTP and takes what `/api/ops/status` chooses to publish, which is counts,
 * identity and health and no row of any kind. A control plane holding every
 * `DATABASE_URL` would be a single account that can see across every
 * municipality — the exact thing the portal's whole isolation model exists to
 * make impossible — and it would be the most valuable target in the system.
 *
 * So this is the only direction data moves: outward from the deployment, as
 * numbers, when asked with that deployment's own token.
 */

export type ProbeResult = {
  ok: boolean
  httpStatus: number | null
  error: string | null
  payload: Record<string, unknown> | null
  durationMs: number
}

/**
 * Whether what answered is the deployment we think it is.
 *
 * A probe that got a 200 from *something* is not the same as a probe that
 * reached the right instance. A DNS change, a reverse proxy pointed at the
 * wrong container, a restore into the wrong environment — all of them answer
 * healthily under the wrong identity, and all of them are silent. So the
 * identity in the response is compared against the registry and a mismatch is
 * reported as a failure with both sides named, which is the same check the
 * deployment itself performs against its own database on boot.
 */
function identityMismatch(d: Deployment, payload: Record<string, unknown>): string | null {
  const muni = payload.municipality as { code?: string } | null | undefined
  const brgy = payload.barangay as { id?: string } | null | undefined
  const tier = payload.tier

  if (tier !== d.tier) {
    return `It answers as a ${String(tier)} deployment; the registry has it as ${d.tier}.`
  }
  // A development copy on the sample data reports the sample municipality,
  // which is not a mismatch worth alarming about — it is a copy nobody sold.
  if (payload.configuredFrom === 'environment' && muni?.code && muni.code !== d.municipality_code) {
    return `It answers for "${muni.code}"; the registry has "${d.municipality_code}". ` +
      `A database wired to the wrong instance looks exactly like this.`
  }
  if (d.tier === 'barangay' && brgy?.id && brgy.id !== d.barangay_id) {
    return `It serves barangay "${brgy.id}"; the registry has "${d.barangay_id}".`
  }
  return null
}

/**
 * What actually went wrong, in words an operator can act on.
 *
 * Node reports a refused connection, an unresolvable host and a rejected
 * certificate all as "fetch failed", which tells whoever is on call nothing
 * about where to look. The cause carries the code.
 */
function explain(err: unknown, fallback: string): string {
  const cause = (err as { cause?: { code?: string; message?: string } } | undefined)?.cause
  const code = cause?.code
  switch (code) {
    case 'ECONNREFUSED': return 'Nothing is listening on that address — the container is probably down.'
    case 'ENOTFOUND': case 'EAI_AGAIN': return 'That hostname does not resolve. Check DNS, or the address on this row.'
    case 'ECONNRESET': return 'The connection was reset before it answered.'
    case 'CERT_HAS_EXPIRED': return 'Its TLS certificate has expired.'
    case 'DEPTH_ZERO_SELF_SIGNED_CERT': case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'Its TLS certificate could not be verified.'
    default: return cause?.message ? `${fallback} (${cause.message})` : fallback
  }
}

export async function probe(d: Deployment): Promise<ProbeResult> {
  const started = Date.now()
  const token = unseal(d.ops_token_sealed)
  if (!token) {
    return {
      ok: false, httpStatus: null, durationMs: 0, payload: null,
      error: d.ops_token_sealed
        ? 'The stored ops token could not be opened — OWNER_TOKEN_KEY may have changed. Rotate the token and set the new one on the deployment.'
        : 'No ops token. Rotate one here and set OPS_TOKEN on the deployment.',
    }
  }

  const url = `${d.public_url.replace(/\/+$/, '')}/api/ops/status`
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(env.probeTimeoutMs),
      redirect: 'manual',
    })
    const durationMs = Date.now() - started

    if (!res.ok) {
      // 401 and 404 mean something specific and actionable, so they are not
      // flattened into "it is down" — an operator seeing "unreachable" would
      // go and check the container, which is the wrong place to look.
      const hint =
        res.status === 401 ? 'The token here and the OPS_TOKEN on the deployment do not match.'
        : res.status === 404 ? 'No ops endpoint. OPS_TOKEN is probably not set on the deployment, so the route is not mounted.'
        : ''
      return { ok: false, httpStatus: res.status, durationMs, payload: null, error: `HTTP ${res.status}. ${hint}`.trim() }
    }

    const payload = (await res.json()) as Record<string, unknown>
    const mismatch = identityMismatch(d, payload)
    if (mismatch) return { ok: false, httpStatus: res.status, durationMs, payload, error: mismatch }
    return { ok: true, httpStatus: res.status, durationMs, payload, error: null }
  } catch (err) {
    const durationMs = Date.now() - started
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false, httpStatus: null, durationMs, payload: null,
      // `fetch failed` is what Node says for everything from a refused
      // connection to a bad certificate, and it is useless to whoever has to
      // go and fix it. The cause underneath says which.
      error: message.includes('timed out') || message.toLowerCase().includes('abort')
        ? `No answer within ${env.probeTimeoutMs / 1000}s.`
        : explain(err, message),
    }
  }
}

/** Probes one deployment and writes what happened. */
export async function probeAndRecord(d: Deployment): Promise<ProbeResult> {
  const result = await probe(d)
  await query(
    `insert into deployment_checks (deployment_id, ok, http_status, error, payload, duration_ms)
     values ($1,$2,$3,$4,$5,$6)`,
    [d.id, result.ok, result.httpStatus, result.error, result.payload ? JSON.stringify(result.payload) : null, result.durationMs]
  )
  // `last_seen_at` only moves on success, so "last seen" means the last time
  // it actually answered rather than the last time we tried.
  await query(
    `update deployments
        set last_status = coalesce($2, last_status),
            last_seen_at = case when $3 then now() else last_seen_at end,
            last_error = $4
      where id = $1`,
    [d.id, result.payload ? JSON.stringify(result.payload) : null, result.ok, result.error]
  )
  return result
}

/**
 * Which deployments are worth asking.
 *
 * A draft has not been stood up yet and a decommissioned one is gone, so
 * probing either produces a permanent red light for something that is working
 * exactly as intended — and an alarm that is always on is one nobody reads.
 */
const PROBED = `status in ('provisioning', 'live', 'suspended')`

export async function probeAll(): Promise<{ checked: number; down: number; skipped: number }> {
  const rows = await query<Deployment>(`select * from deployments where ${PROBED}`)
  const skipped = await one<{ n: number }>(
    `select count(*)::int as n from deployments where status = 'draft'`
  )
  let down = 0
  // Sequential on purpose. This is a handful of municipal halls, and a monitor
  // that opens forty sockets at once is a monitor that looks like an attack.
  for (const d of rows) {
    const result = await probeAndRecord(d)
    if (!result.ok) down++
  }
  return { checked: rows.length, down, skipped: Number(skipped?.n ?? 0) }
}

let timer: NodeJS.Timeout | null = null

export function startProbing(): void {
  if (timer) return
  const run = () => {
    probeAll()
      .then(({ checked, down }) => {
        if (checked) console.log(`probed ${checked} deployment(s)${down ? `, ${down} not answering` : ''}`)
      })
      .catch((err) => console.error('probe sweep failed', err))
  }
  // Not on the very first tick: a container that has just started is often
  // racing its own database, and a red light in the first second of the
  // console's life is noise.
  timer = setInterval(run, env.probeIntervalMs)
  setTimeout(run, 3_000).unref?.()
}

export function stopProbing(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** The most recent check for each deployment, for the list page. */
export const lastChecks = () =>
  one<{ n: number }>(`select count(*)::int as n from deployment_checks`)
