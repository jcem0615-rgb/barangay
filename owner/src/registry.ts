import type { PoolClient } from 'pg'
import { z } from 'zod'
import { one, query, tx } from './db.ts'
import { newOpsToken, seal } from './seal.ts'
import type { OwnerUser } from './auth.ts'

export type Tier = 'municipal' | 'barangay'
export type DeploymentStatus = 'draft' | 'provisioning' | 'live' | 'suspended' | 'decommissioned'

export type Deployment = {
  id: string
  slug: string
  tier: Tier
  municipality_code: string
  municipality_name: string
  municipality_province: string
  barangay_id: string | null
  barangay_name: string | null
  public_url: string
  status: DeploymentStatus
  ops_token_sealed: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  notes: string
  last_status: Record<string, unknown> | null
  last_seen_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  decommissioned_at: string | null
  decommission_reason: string | null
}

/** What a place is called on screen, in one phrase. */
export const placeOf = (d: Pick<Deployment, 'tier' | 'barangay_name' | 'municipality_name' | 'municipality_province'>) =>
  d.tier === 'barangay'
    ? `Barangay ${d.barangay_name}, ${d.municipality_name}`
    : `${d.municipality_name}, ${d.municipality_province}`

export const productOf = (tier: Tier) =>
  tier === 'barangay' ? 'eBarangay Portal' : 'eLGU Citizen Portal'

/**
 * What a new or edited deployment must look like.
 *
 * Strict, so an unknown key refuses the whole request rather than quietly
 * saving something different — the same rule the municipality's own PATCH
 * follows one level down.
 */
const base = {
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
      'A slug is lowercase letters, numbers and hyphens — it names the database and the container.'),
  tier: z.enum(['municipal', 'barangay']),
  municipalityCode: z.string().trim().min(2).max(120),
  municipalityName: z.string().trim().min(1).max(120),
  municipalityProvince: z.string().trim().min(1).max(120),
  barangayId: z.string().trim().max(120).optional().or(z.literal('')),
  barangayName: z.string().trim().max(120).optional().or(z.literal('')),
  publicUrl: z.string().trim().url('That has to be the full address residents will open, starting with https://'),
  contactName: z.string().trim().max(160).default(''),
  contactEmail: z.string().trim().max(200).default(''),
  contactPhone: z.string().trim().max(60).default(''),
  notes: z.string().trim().max(4000).default(''),
}

/**
 * A barangay deployment names a barangay; a municipal one must not.
 *
 * The database says the same thing in a check constraint, and both are worth
 * having: the constraint is what makes it true, and this is what produces a
 * sentence somebody can act on instead of a 500.
 */
const tierShape = <T extends { tier: Tier; barangayId?: string; barangayName?: string }>(v: T, ctx: z.RefinementCtx) => {
  if (v.tier === 'barangay') {
    if (!v.barangayId) ctx.addIssue({ code: 'custom', path: ['barangayId'], message: 'A barangay deployment needs the roster id it serves.' })
    if (!v.barangayName) ctx.addIssue({ code: 'custom', path: ['barangayName'], message: 'A barangay deployment needs the barangay name.' })
  } else {
    if (v.barangayId) ctx.addIssue({ code: 'custom', path: ['barangayId'], message: 'A municipal deployment serves the whole roster — leave the barangay blank.' })
  }
}

export const newDeploymentSchema = z.object(base).strict().superRefine(tierShape)

/** Editing leaves out the two things that are not a rename. See below. */
export const editDeploymentSchema = z.object({
  municipalityName: base.municipalityName,
  municipalityProvince: base.municipalityProvince,
  barangayName: base.barangayName,
  publicUrl: base.publicUrl,
  contactName: base.contactName,
  contactEmail: base.contactEmail,
  contactPhone: base.contactPhone,
  notes: base.notes,
}).strict()

export type NewDeployment = z.infer<typeof newDeploymentSchema>

/** The address with any trailing slash removed, so the QR and the links match. */
export const normaliseUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

/**
 * Records what was done, in the same transaction as the doing.
 *
 * The same rule and the same reasoning as `admin_audit` inside a deployment:
 * an owner can point a customer's URL anywhere or decommission them by
 * mistake, and the only defence against a change nobody noticed is a record
 * that still has the old value in it. The actor's name is stored beside the
 * id rather than joined at read time, so a removed account does not erase who
 * did what.
 */
export async function recordEvent(
  c: PoolClient,
  d: { id: string | null; slug: string },
  kind: string,
  summary: string,
  actor: OwnerUser | null,
  before?: unknown,
  after?: unknown
): Promise<void> {
  await c.query(
    `insert into deployment_events
       (deployment_id, deployment_slug, kind, summary, before, after, actor_id, actor_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      d.id, d.slug, kind, summary,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      actor?.id ?? null, actor?.name ?? 'system',
    ]
  )
}

export const listDeployments = () =>
  query<Deployment>(
    `select * from deployments
      order by case status when 'live' then 0 when 'provisioning' then 1 when 'draft' then 2
                           when 'suspended' then 3 else 4 end,
               municipality_name, coalesce(barangay_name, '')`
  )

export const getDeployment = (id: string) =>
  one<Deployment>(`select * from deployments where id = $1`, [id])

export const getDeploymentBySlug = (slug: string) =>
  one<Deployment>(`select * from deployments where slug = $1`, [slug])

/**
 * Adds a customer, and mints the token the prober will use.
 *
 * The plain token is returned **once** and never again — it is sealed on the
 * row and this is the only moment it can be copied into the deployment's own
 * environment. That is deliberate rather than awkward: a secret the console
 * will show you again is a secret sitting in a page somebody leaves open.
 */
export async function addDeployment(input: NewDeployment, actor: OwnerUser): Promise<{ deployment: Deployment; opsToken: string }> {
  const opsToken = newOpsToken()
  return tx(async (c) => {
    const { rows } = await c.query<Deployment>(
      `insert into deployments
         (slug, tier, municipality_code, municipality_name, municipality_province,
          barangay_id, barangay_name, public_url, ops_token_sealed,
          contact_name, contact_email, contact_phone, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        input.slug, input.tier, input.municipalityCode, input.municipalityName, input.municipalityProvince,
        input.tier === 'barangay' ? input.barangayId! : null,
        input.tier === 'barangay' ? input.barangayName! : null,
        normaliseUrl(input.publicUrl), seal(opsToken),
        input.contactName, input.contactEmail, input.contactPhone, input.notes,
      ]
    )
    const deployment = rows[0]!
    await recordEvent(c, deployment, 'added', `Added ${placeOf(deployment)}`, actor, undefined, {
      slug: deployment.slug, tier: deployment.tier, publicUrl: deployment.public_url,
    })
    return { deployment, opsToken }
  })
}

/**
 * Edits the facts that are safe to correct.
 *
 * **The slug, the tier, the municipality code and the barangay id are not
 * editable, and that is the same rule the portal applies to its own.** Every
 * account in a deployment is stamped with its municipality code and sign-in
 * refuses an account from another register, so changing it here would not
 * rename anything — it would make this registry disagree with the instance,
 * which is precisely the mismatch the whole design exists to make visible.
 * What a place is *called* can be corrected; which place it is cannot.
 */
export async function editDeployment(
  id: string,
  patch: z.infer<typeof editDeploymentSchema>,
  actor: OwnerUser
): Promise<Deployment> {
  return tx(async (c) => {
    const { rows: before } = await c.query<Deployment>(`select * from deployments where id = $1 for update`, [id])
    const was = before[0]
    if (!was) throw new Error('That deployment is no longer in the registry.')

    const { rows } = await c.query<Deployment>(
      `update deployments set
         municipality_name = $2, municipality_province = $3,
         barangay_name = case when tier = 'barangay' then $4 else null end,
         public_url = $5, contact_name = $6, contact_email = $7, contact_phone = $8,
         notes = $9, updated_at = now()
       where id = $1 returning *`,
      [
        id, patch.municipalityName, patch.municipalityProvince,
        patch.barangayName || was.barangay_name,
        normaliseUrl(patch.publicUrl), patch.contactName, patch.contactEmail, patch.contactPhone, patch.notes,
      ]
    )
    const now = rows[0]!
    const moved = was.public_url !== now.public_url
    await recordEvent(
      c, now, 'edited',
      moved ? `Edited ${placeOf(now)} — address changed` : `Edited ${placeOf(now)}`,
      actor,
      { publicUrl: was.public_url, name: was.municipality_name, barangay: was.barangay_name, contact: was.contact_email },
      { publicUrl: now.public_url, name: now.municipality_name, barangay: now.barangay_name, contact: now.contact_email }
    )
    return now
  })
}

/** Moves a deployment between draft / provisioning / live / suspended. */
export async function setStatus(id: string, status: DeploymentStatus, actor: OwnerUser): Promise<Deployment> {
  return tx(async (c) => {
    const { rows: before } = await c.query<Deployment>(`select * from deployments where id = $1 for update`, [id])
    const was = before[0]
    if (!was) throw new Error('That deployment is no longer in the registry.')
    const { rows } = await c.query<Deployment>(
      `update deployments set status = $2, updated_at = now() where id = $1 returning *`,
      [id, status]
    )
    const now = rows[0]!
    await recordEvent(c, now, 'status', `${placeOf(now)}: ${was.status} → ${status}`, actor,
      { status: was.status }, { status })
    return now
  })
}

/** A fresh ops token, which also retires the old one the moment it is saved. */
export async function rotateOpsToken(id: string, actor: OwnerUser): Promise<{ deployment: Deployment; opsToken: string }> {
  const opsToken = newOpsToken()
  return tx(async (c) => {
    const { rows } = await c.query<Deployment>(
      `update deployments set ops_token_sealed = $2, updated_at = now() where id = $1 returning *`,
      [id, seal(opsToken)]
    )
    const deployment = rows[0]
    if (!deployment) throw new Error('That deployment is no longer in the registry.')
    await recordEvent(c, deployment, 'token', `Rotated the ops token for ${placeOf(deployment)}`, actor)
    return { deployment, opsToken }
  })
}

/**
 * Decommissioning, which is not deleting.
 *
 * It marks the row, stops the prober and keeps every event — because "what
 * happened to Bugallon?" is a question somebody asks a year later, and a
 * registry that answers it by having no row is not a registry. **It does not
 * touch the customer's database**, and the console says so: dropping an LGU's
 * records is an act somebody performs deliberately against a backup they have
 * checked, not a consequence of a button in a web page.
 */
export async function decommission(id: string, reason: string, actor: OwnerUser): Promise<Deployment> {
  return tx(async (c) => {
    const { rows } = await c.query<Deployment>(
      `update deployments
          set status = 'decommissioned', decommissioned_at = now(),
              decommission_reason = $2, ops_token_sealed = null, updated_at = now()
        where id = $1 returning *`,
      [id, reason]
    )
    const now = rows[0]
    if (!now) throw new Error('That deployment is no longer in the registry.')
    await recordEvent(c, now, 'decommissioned', `Decommissioned ${placeOf(now)}: ${reason}`, actor)
    return now
  })
}

/**
 * Removing the row for good.
 *
 * Only a decommissioned deployment, and only after the slug has been typed
 * back — the two together are what stop this being one misclick from erasing
 * a customer's history. The events survive, because they carry the slug as
 * text rather than only a foreign key.
 */
export async function forget(id: string, actor: OwnerUser): Promise<string> {
  return tx(async (c) => {
    const { rows } = await c.query<Deployment>(`select * from deployments where id = $1 for update`, [id])
    const d = rows[0]
    if (!d) throw new Error('That deployment is no longer in the registry.')
    if (d.status !== 'decommissioned') {
      throw new Error('Decommission it first. Removing a live customer from the registry would leave an instance nobody is watching.')
    }
    await recordEvent(c, { id: null, slug: d.slug }, 'forgotten', `Removed ${placeOf(d)} from the registry`, actor)
    await c.query(`delete from deployments where id = $1`, [id])
    return d.slug
  })
}

export const eventsFor = (id: string, limit = 50) =>
  query<{ kind: string; summary: string; actor_name: string; created_at: string; before: unknown; after: unknown }>(
    `select kind, summary, actor_name, created_at, before, after
       from deployment_events where deployment_id = $1
      order by created_at desc limit $2`,
    [id, limit]
  )

export const checksFor = (id: string, limit = 40) =>
  query<{ ok: boolean; http_status: number | null; error: string | null; duration_ms: number | null; checked_at: string }>(
    `select ok, http_status, error, duration_ms, checked_at
       from deployment_checks where deployment_id = $1
      order by checked_at desc limit $2`,
    [id, limit]
  )
