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
  'City Treasury Assessment',
  'Payment',
  'e-Document Release',
] as const

export type WorkflowStepLabel = (typeof WORKFLOW_STEPS)[number]

export type ApplicationStatus = 'draft' | 'in-progress' | 'for-payment' | 'completed' | 'rejected'

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
  isOfflineDraft: boolean
  rejectionReason?: string
}

export interface ResidentProfile {
  fullName: string
  firstName: string
  philSysId: string
  philSysSynced: boolean
  barangay: string
  city: string
  province: string
  birthDate: string
  address: string
  qrSeed: string
  seniorOrPwd?: 'Senior Citizen' | 'PWD'
}
