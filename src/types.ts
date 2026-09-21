export type ServiceCategoryId = 'bpls' | 'cswdo' | 'lcr' | 'treasury' | 'obo' | 'health'

export interface ServiceCategory {
  id: ServiceCategoryId
  name: string
  officeName: string
  description: string
  icon: string // lucide icon name, resolved in ServiceTile
  /**
   * Where to find the office in person. Seed placeholders for this sample
   * municipality — replace them before a real deployment. Null where an office
   * has not published the detail.
   */
  address?: string | null
  hours?: string | null
  phone?: string | null
  email?: string | null
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
  /**
   * The same promise as `processingTime`, in working days, so an expected date
   * can be computed rather than parsed out of a sentence. 0 means same day.
   */
  processingDaysMin: number
  processingDaysMax: number
  fee: number // in PHP, 0 = free
  requiresPayment: boolean
  requirements: string[]
  fields: ServiceField[]
  /**
   * What residents actually call this, in either language.
   *
   * Nobody searches for "BOSS Business Permit Application"; they search for
   * "sari-sari store" or "negosyo". These are the words that bridge the gap,
   * and they are catalogue data for the same reason fees are — a term a
   * municipality finds people typing is a row to add, not a release to cut.
   * Never shown; they only widen what matches.
   */
  searchTerms: string[]
}

export const WORKFLOW_STEPS = [
  'Submitted',
  'Municipal Treasury Assessment',
  'Payment',
  'e-Document Release',
] as const

export type WorkflowStepLabel = (typeof WORKFLOW_STEPS)[number]

/**
 * Whose move each step is.
 *
 * The one question a resident actually has when they open a request is whether
 * they are waiting or being waited on, and a row of step labels does not answer
 * it. Only payment is theirs; everything else is the office's, which is also
 * exactly why the ready-date clock pauses at that step and nowhere else.
 */
/** The municipality a deployment serves; published on the public catalogue. */
export interface Municipality {
  code: string
  name: string
  province: string
}

export const STEP_OWNER: Record<WorkflowStepLabel, 'office' | 'resident'> = {
  'Submitted': 'office',
  'Municipal Treasury Assessment': 'office',
  'Payment': 'resident',
  'e-Document Release': 'office',
}

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
  /**
   * When the office expects to have this ready, computed server-side over
   * working days. Absent while the request is waiting on the resident to pay,
   * because the office is not working on it then, and once it is closed.
   */
  expectedReady?: { from: string; to: string } | null
  /** True when the estimate is paused because the resident still owes a fee. */
  awaitingResident?: boolean
}

/**
 * A number to ring when something goes wrong, shown on the digital ID.
 * Authored here, seeded, and read back from the catalogue like everything else
 * the municipality publishes.
 */
export interface EmergencyContact {
  id: string
  /** What the resident is looking for: "Fire", "Ambulance". */
  label: string
  /** Who answers, spelled out rather than left as an acronym. */
  agency: string
  phone: string
  /** Nationwide numbers, grouped apart from the municipal ones. */
  isNational: boolean
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
  /** Sectoral and poverty-reduction memberships, newest office record first. */
  programs: ResidentProgram[]
}
