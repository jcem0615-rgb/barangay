import type { PoolClient } from 'pg'
import { query } from './db.ts'

/**
 * Sectoral registries and poverty-reduction programmes.
 *
 * A membership here is worth real money at a counter — a senior-citizen badge
 * is a 20% statutory discount, a 4Ps record is a cash grant — so it is issued,
 * never self-declared. Only the social welfare office and administrators may
 * write one, whatever queue the staff member happens to be looking at.
 */

/** The office that maintains the sectoral registers in this municipality. */
export const REGISTRAR_DEPARTMENT = 'cswdo'

export interface ResidentProgramRow {
  code: string
  referenceNo: string | null
  enrolledOn: string
  validUntil: string | null
  expired: boolean
}

/**
 * A resident's memberships, ordered as the catalogue orders them so the ID card
 * lists poverty-reduction programmes before the sectoral ones.
 *
 * `expired` is computed here rather than stored: a lapsed solo-parent ID should
 * show as needing renewal on the day it lapses, without a nightly job.
 */
export async function listResidentPrograms(userId: string): Promise<ResidentProgramRow[]> {
  return query<ResidentProgramRow>(
    `select rp.program_code as code,
            rp.reference_no as "referenceNo",
            rp.enrolled_on::text as "enrolledOn",
            rp.valid_until::text as "validUntil",
            (rp.valid_until is not null and rp.valid_until < current_date) as expired
       from resident_programs rp
       join sectoral_programs sp on sp.code = rp.program_code
      where rp.user_id = $1
      order by sp.sort_order, sp.name`,
    [userId]
  )
}

/** Same list, inside an open transaction. */
export async function listResidentProgramsIn(
  client: PoolClient,
  userId: string
): Promise<ResidentProgramRow[]> {
  const result = await client.query<ResidentProgramRow>(
    `select rp.program_code as code,
            rp.reference_no as "referenceNo",
            rp.enrolled_on::text as "enrolledOn",
            rp.valid_until::text as "validUntil",
            (rp.valid_until is not null and rp.valid_until < current_date) as expired
       from resident_programs rp
       join sectoral_programs sp on sp.code = rp.program_code
      where rp.user_id = $1
      order by sp.sort_order, sp.name`,
    [userId]
  )
  return result.rows
}

/**
 * May this staff member write programme records? Admins always may; staff only
 * if they are assigned to the registering office. Being able to open someone's
 * request in another queue is not authority to enrol them in 4Ps.
 */
export function mayAdministerPrograms(
  role: string,
  departments: readonly string[]
): boolean {
  return role === 'admin' || departments.includes(REGISTRAR_DEPARTMENT)
}

export function programNoticeFor(
  action: 'granted' | 'revoked',
  programName: string,
  office: string
): { title: string; body: string } {
  return action === 'granted'
    ? {
        title: `${programName} — you are now enrolled`,
        body:
          `${office} has recorded you under ${programName}. ` +
          'It now appears on your digital ID; show it when you transact with the LGU.',
      }
    : {
        title: `${programName} — record removed`,
        body:
          `${office} has removed your ${programName} record. ` +
          'It no longer appears on your digital ID. Contact the office if this is a mistake.',
      }
}
