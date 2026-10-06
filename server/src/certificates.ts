import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { toCentavos, toPesos } from './serialize.ts'
import { recordAudit } from './municipality.ts'

/**
 * The barangay certificate catalogue, and who may change what in it.
 *
 * One module rather than two, because the municipal administrator and a
 * barangay administrator are doing the same thing to the same table and the
 * only difference is which rows they own. Two implementations would drift, and
 * the half that drifted would be the validation.
 *
 * **The split is the row's `barangay_id`.** Null is the shared catalogue — the
 * documents every barangay issues, which stay the municipality's to define so
 * that a clearance means the same thing on every street. A barangay id is that
 * barangay's own document, which only it issues and only its residents can see.
 * Neither side can reach the other's rows, and that is enforced in the `where`
 * clause rather than by a check somebody has to remember.
 */

export const CERTIFICATE_FIELDS = z.object({
  name: z.string().min(3, 'Give it the name people will ask for at the counter.').max(120),
  description: z.string().min(10, 'Say what it is for.').max(400),
  fee: z.number().min(0).max(10000),
  purposeHint: z.string().max(200).optional(),
  /**
   * Null means the barangay states no validity period, which is a different
   * thing from forever and is said in those words on the resident's screen.
   */
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
})

export const certificateCreateSchema = CERTIFICATE_FIELDS
export const certificateEditSchema = CERTIFICATE_FIELDS.partial().extend({
  // Reordering is a presentation choice and is allowed on its own.
  sortOrder: z.number().int().min(0).max(999).optional(),
})

/**
 * An id a person could read in a URL, with a random tail.
 *
 * The tail is not decoration: two barangays will both add "Tricycle Permit",
 * and the id is this table's primary key across every barangay at once. The
 * hotlines settled this the same way for the same reason.
 */
export function certificateId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug || 'certificate'}-${randomBytes(3).toString('hex')}`
}

export interface CertificateRow {
  id: string; name: string; description: string; fee_centavos: number
  purpose_hint: string; sort_order: number; active: boolean
  validity_days: number | null; barangay_id: string | null
}

export function serializeCertificateType(row: CertificateRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fee: toPesos(row.fee_centavos),
    purposeHint: row.purpose_hint,
    sortOrder: row.sort_order,
    active: row.active,
    validityDays: row.validity_days,
    /** Null for the shared catalogue; a barangay id for one barangay's own. */
    barangayId: row.barangay_id,
  }
}

interface Actor { id: string; fullName: string }

/**
 * Adding one.
 *
 * `barangayId` decides which catalogue it lands in, and it comes from the
 * caller's own account rather than from the request body — the rule the whole
 * barangay console runs on.
 */
export async function createCertificateType(
  client: PoolClient,
  input: z.infer<typeof certificateCreateSchema>,
  barangayId: string | null,
  actor: Actor
) {
  const id = certificateId(input.name)
  const inserted = await client.query<CertificateRow>(
    `insert into barangay_certificate_types
       (id, name, description, fee_centavos, purpose_hint, sort_order, steps,
        validity_days, barangay_id)
     values ($1, $2, $3, $4, $5,
             (select coalesce(max(sort_order), 0) + 1 from barangay_certificate_types),
             '[]'::jsonb, $6, $7)
     returning *`,
    [
      id, input.name.trim(), input.description.trim(), toCentavos(input.fee),
      input.purposeHint?.trim() ?? '', input.validityDays ?? null, barangayId,
    ]
  )
  const row = inserted.rows[0]!
  await recordAudit(client, {
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'certificate.create',
    target: id,
    after: serializeCertificateType(row),
  })
  return row
}

/**
 * Changing one, scoped to the catalogue the caller owns.
 *
 * `barangayId` null finds only shared rows; a barangay id finds only that
 * barangay's. So a barangay editing a shared clearance does not get a refusal —
 * it gets "not found", because from where it is standing there is no such row.
 * Returns null when nothing matched, which the route turns into a 404.
 */
export async function updateCertificateType(
  client: PoolClient,
  id: string,
  input: z.infer<typeof certificateEditSchema>,
  barangayId: string | null,
  actor: Actor
) {
  const current = await client.query<CertificateRow>(
    `select * from barangay_certificate_types
      where id = $1 and barangay_id is not distinct from $2 for update`,
    [id, barangayId]
  )
  const before = current.rows[0]
  if (!before) return null

  const updated = await client.query<CertificateRow>(
    `update barangay_certificate_types
        set name         = coalesce($3, name),
            description  = coalesce($4, description),
            fee_centavos = coalesce($5, fee_centavos),
            purpose_hint = coalesce($6, purpose_hint),
            sort_order   = coalesce($7, sort_order),
            validity_days = case when $8 then $9 else validity_days end
      where id = $1 and barangay_id is not distinct from $2
      returning *`,
    [
      id, barangayId,
      input.name?.trim() ?? null,
      input.description?.trim() ?? null,
      input.fee === undefined ? null : toCentavos(input.fee),
      input.purposeHint?.trim() ?? null,
      input.sortOrder ?? null,
      'validityDays' in input, input.validityDays ?? null,
    ]
  )
  const after = updated.rows[0]!
  await recordAudit(client, {
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'certificate.update',
    target: id,
    before: serializeCertificateType(before),
    after: serializeCertificateType(after),
  })
  return after
}

/**
 * Taking one off the list.
 *
 * Never a delete. `barangay_requests.type_id` references this row, and a
 * certificate somebody was issued last year has to keep rendering its own name
 * — a hard delete would either orphan that request or be refused by the
 * database, and neither is what an administrator means by "remove this".
 * Residents stop being offered it; the history keeps working.
 */
export async function withdrawCertificateType(
  client: PoolClient,
  id: string,
  active: boolean,
  barangayId: string | null,
  actor: Actor
) {
  const updated = await client.query<CertificateRow>(
    `update barangay_certificate_types set active = $3
      where id = $1 and barangay_id is not distinct from $2 and active <> $3
      returning *`,
    [id, barangayId, active]
  )
  const row = updated.rows[0]
  if (!row) return null
  await recordAudit(client, {
    actorId: actor.id,
    actorName: actor.fullName,
    action: active ? 'certificate.restore' : 'certificate.withdraw',
    target: id,
    after: serializeCertificateType(row),
  })
  return row
}
