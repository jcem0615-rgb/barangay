export type ServiceCategoryId = 'bpls' | 'cswdo' | 'lcr' | 'treasury' | 'obo' | 'health'

export interface ServiceCategory {
  id: ServiceCategoryId
  name: string
  officeName: string
  description: string
  icon: string // lucide icon name, resolved in ServiceTile
}

export type FieldType = 'text' | 'select' | 'date' | 'textarea' | 'number'

export interface ServiceField {
  id: string
  label: string
  type: FieldType
  placeholder?: string
  options?: string[]
  required?: boolean
  helper?: string
}

export interface ServiceDefinition {
  id: string
  categoryId: ServiceCategoryId
  name: string
  shortDescription: string
  processingTime: string
  fee: number // in PHP, 0 = free
  requiresPayment: boolean
  requirements: string[]
  fields: ServiceField[]
}

export const WORKFLOW_STEPS = [
  'Submitted',
  'Municipal Treasury Assessment',
  'Payment',
  'e-Document Release',
] as const

export type WorkflowStepLabel = (typeof WORKFLOW_STEPS)[number]

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'in_progress' | 'for_payment' | 'completed' | 'rejected'

export interface Application {
  id: string
  referenceNo: string
  serviceId: string
  serviceName: string
  categoryId: ServiceCategoryId
  dateSubmitted: string // ISO string
  currentStepIndex: number // index into WORKFLOW_STEPS
  status: ApplicationStatus
  fee: number
  paid: boolean
  paymentMethod?: 'GCash' | 'Maya' | 'Landbank Online'
  formValues: Record<string, string>
  isOfflineDraft?: boolean
  rejectionReason?: string
}

/**
 * A sectoral registry or poverty-reduction programme the municipality keeps.
 * Authored in src/data/mockData.ts, seeded into the database, and read back
 * from the server as part of the catalogue.
 */
export interface SectoralProgram {
  code: string
  name: string
  /** Short label for the badge on the ID card face. */
  shortName: string
  kind: 'poverty_reduction' | 'sectoral'
  description: string
  /** What the membership entitles the resident to. */
  benefit: string
  issuingOffice: string
  /** Label for the programme's own number, or null when it issues none. */
  idLabel: string | null
  expires: boolean
}

/** One resident's membership in a programme, as issued by the office. */
export interface ResidentProgram {
  code: string
  referenceNo: string | null
  enrolledOn: string
  /** ISO date, or null when the membership does not lapse. */
  validUntil: string | null
  expired: boolean
}

export interface ResidentProfile {
  fullName: string
  firstName: string
  philSysId: string
  philSysSynced: boolean
  barangay: string
  municipality: string
  province: string
  birthDate: string
  address: string
  qrSeed: string
  /** Sectoral and poverty-reduction memberships, newest office record first. */
  programs: ResidentProgram[]
}
