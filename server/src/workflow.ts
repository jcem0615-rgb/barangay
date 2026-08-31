/**
 * The server owns the workflow. The client renders these labels but never
 * decides which step a request is on — only the API advances a request.
 */
export const WORKFLOW_STEPS = [
  'Submitted',
  'Municipal Treasury Assessment',
  'Payment',
  'e-Document Release',
] as const

export const STEP_SUBMITTED = 0
export const STEP_ASSESSMENT = 1
export const STEP_PAYMENT = 2
export const STEP_RELEASE = 3

export type RequestStatus =
  | 'draft' | 'submitted' | 'in_progress' | 'for_payment' | 'completed' | 'rejected'

/** Reference numbers are issued server-side so they can't collide or be forged. */
export function makeReferenceNo(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${seq.toString().padStart(5, '0')}`
}

export const DEPARTMENT_PREFIX: Record<string, string> = {
  bpls: 'BOSS',
  cswdo: 'CSWDO',
  lcr: 'LCR',
  treasury: 'MTO',
  obo: 'OBO',
  health: 'MHO',
}
