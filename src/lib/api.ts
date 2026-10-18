import type {
  Application, EmergencyContact, Municipality, ResidentProgram, SectoralProgram,
  ServiceCategory, ServiceDefinition, ServiceStep,
} from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

/**
 * The demo build answers every call in the browser instead of over the network.
 * Guarded by a build-time flag so the constant folds away and the demo server is
 * tree-shaken out of the production bundle entirely.
 */
export interface BarangayRequest {
  id: string
  referenceNo: string
  typeId: string
  typeName: string
  purpose: string
  fee: number
  status: 'pending' | 'processing' | 'ready' | 'released' | 'rejected'
  requestedAt: string
  updatedAt: string
  note: string | null
  barangayName?: string
  residentName?: string
  /** The day it lapses, stamped when the barangay marked it ready. */
  validUntil?: string | null
  /** Derived on read by the server, never stored. */
  expired?: boolean
  /** True once the barangay released it and the PDF was written. */
  hasCertificate?: boolean
  /** The code printed on it, for reading out at a counter. */
  certificateCode?: string | null
  /** Withdrawn by the barangay after release. Final, and always with a reason. */
  revoked?: boolean
  revokedReason?: string | null
}

/**
 * The hall as a resident needs it. Every field is nullable because a barangay
 * that has not filled one in should read as "not stated" rather than as an empty
 * line pretending to be an address.
 */
/** A row of the barangay certificate catalogue, either tier's. */
export interface CertificateType {
  id: string
  name: string
  description: string
  fee: number
  purposeHint: string
  sortOrder: number
  active: boolean
  validityDays: number | null
  /**
   * What the certificate says, as the barangay says it. Null falls back to a
   * plain sentence claiming only that this barangay issued it.
   */
  attestation: string | null
  /** Null for the shared catalogue; a barangay id for one barangay's own. */
  barangayId: string | null
  /** Barangay console only: whether this barangay may edit it. */
  own?: boolean
}

export interface FeeChange {
  id: number
  actorName: string
  action: string
  target: string
  before: { fee?: number; name?: string; barangay?: string } | null
  after: { fee?: number; name?: string; barangay?: string } | null
  createdAt: string
}

export interface BarangayOffice {
  id: string
  name: string
  captain: string | null
  secretary: string | null
  hallAddress: string | null
  officeHours: string | null
  phone: string | null
  email: string | null
  /** Only on the barangay's own console read; the public list carries none of these. */
  hasSeal?: boolean
  sealUpdatedAt?: string | null
  hasCaptainSignature?: boolean
  captainSignatureUpdatedAt?: string | null
  hasSecretarySignature?: boolean
  secretarySignatureUpdatedAt?: string | null
}

export interface BlotterEntry {
  id: string
  referenceNo: string
  complainant: string
  complainantContact: string | null
  respondent: string
  respondentAddress: string | null
  respondentContact: string | null
  nature: string
  narrative: string
  occurredAt: string | null
  status: 'recorded' | 'mediation' | 'settled' | 'unsettled' | 'withdrawn' | 'referred'
  outcomeNote: string | null
  recordedAt: string
  updatedAt: string
  recordedBy: string | null
  summonsCount?: number
  nextHearing?: string | null
}

export interface BlotterSummons {
  id: string
  sequence: number
  hearingAt: string
  venue: string
  note: string | null
  servedAt: string | null
  servedNote: string | null
  /**
   * That a reminder was sent to the contacts the barangay typed, and what came
   * of it. Deliberately separate from `servedAt`: a text message is not service.
   */
  notifiedAt: string | null
  notifyResult: string | null
  outcome: 'pending' | 'appeared' | 'failed_to_appear' | 'rescheduled' | 'cancelled'
  issuedAt: string
  issuedBy: string | null
}

export interface Household {
  id: string
  householdNo: number
  address: string
  purok: string | null
  headName: string
  contact: string | null
  status: 'active' | 'moved' | 'archived'
  statusNote: string | null
  updatedAt: string
  memberCount?: number
}

export interface HouseholdMember {
  id: string
  fullName: string
  birthDate: string | null
  /** Worked out from the birth date on read, never stored. */
  age: number | null
  sex: 'female' | 'male' | null
  relationship: string
  civilStatus: string | null
  occupation: string | null
  /** What the barangay noted, not the sectoral register CSWDO issues. */
  isPwd: boolean
  isFourPs: boolean
  isVoter: boolean
}

export interface Announcement {
  id: string
  kind: 'general' | 'service' | 'emergency' | 'health' | 'event'
  title: string
  body: string
  urgent: boolean
  expiresAt: string | null
  archivedAt: string | null
  postedBy: string | null
  postedAt: string
  /** Set when the notice was corrected after it went out. */
  editedAt: string | null
}

const DEMO = import.meta.env.VITE_DEMO === '1'

/** True in the demo build only. Used to label the UI honestly. */
export const IS_DEMO = DEMO

const TOKEN_KEY = 'elgu-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private browsing can refuse storage; the session still works in-memory.
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()

  if (DEMO) {
    const { handleDemoRequest } = await import('./demoServer')
    const parsed = typeof options.body === 'string' ? JSON.parse(options.body) : undefined
    const out = await handleDemoRequest(options.method ?? 'GET', path, token, parsed)
    if (out.status === 204) return undefined as T
    if (out.status >= 400) {
      throw new ApiError((out.body as { error?: string })?.error ?? 'Something went wrong.', out.status)
    }
    return out.body as T
  }

  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError("Can't reach the LGU server. Check your connection.", 0)
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(body?.error ?? 'Something went wrong. Please try again.', res.status)
  }
  return body as T
}

export interface AuthUser {
  id: string
  email: string
  role: 'resident' | 'staff' | 'admin' | 'barangay_admin' | 'barangay_officer' | 'barangay_kagawad'
  fullName: string
  departments: string[]
}

export interface ResidentProfileData {
  philSysId: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  birthDate: string | null
  address: string | null
  programs: ResidentProgram[]
  /** Whether a portrait is on file; the bytes come from /auth/me/photo. */
  hasPhoto?: boolean
  photoUpdatedAt?: string | null
}

/** What a counter clerk gets back, and no more. */
export interface IdCheck {
  outcome: 'valid'
  residentId: string
  fullName: string
  barangay: string | null
  municipality: string | null
  province: string | null
  philSysLast4: string | null
  hasPhoto: boolean
  programs: ResidentProgram[]
  checkedAt: string
}

/**
 * What the municipality prints on an official receipt.
 *
 * `code`, `name` and `province` are read-only here: what a place is called
 * belongs to the register, which is the same rule a barangay's own name follows
 * one tier down. Everything else is the administrator's to correct.
 */
export interface MunicipalityDetails {
  code: string
  name: string
  province: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  tin: string | null
  treasurerName: string | null
  treasurerTitle: string
  receiptPrefix: string
  receiptFormLabel: string | null
  receiptFooter: string | null
  hasSeal: boolean
  sealUpdatedAt: string | null
  hasTreasurerSignature: boolean
  treasurerSignatureUpdatedAt: string | null
}

export interface ReportRow {
  departmentId: string
  departmentName: string
  serviceId: string
  serviceName: string
  submitted: number
  completed: number
  rejected: number
  inProgress: number
  awaitingPayment: number
  medianOfficeDays: number | null
  medianResidentDays: number | null
  p90OfficeDays: number | null
  metTarget: number
  missedTarget: number
}

export interface ReportSummary {
  from: string
  to: string
  submitted: number
  completed: number
  rejected: number
  stillOpen: number
  medianOfficeDays: number | null
  medianResidentDays: number | null
  metTarget: number
  missedTarget: number
  onTimeRate: number | null
  ratings: number
  averageRating: number | null
  complaintsFiled: number
  complaintsAnswered: number
  complaintsOverdue: number
  rows: ReportRow[]
}

export interface DraftRecord {
  id: string
  serviceId: string
  serviceName?: string
  categoryId?: string
  formValues: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface RequestEvent {
  eventType: string
  fromStep: number | null
  toStep: number | null
  note: string | null
  createdAt: string
  actorName?: string | null
}

/**
 * Files need the Authorization header, so they can't be fetched with a plain
 * link — download them as a blob and save that instead.
 */
async function downloadPdf(path: string): Promise<{ blob: Blob; fileName: string }> {
  const token = getToken()

  if (DEMO) {
    const { handleDemoRequest } = await import('./demoServer')
    const out = await handleDemoRequest('GET', path, token, undefined)
    if (out.status >= 400 || !out.blob) {
      throw new ApiError((out.body as { error?: string })?.error ?? 'Could not download that file.', out.status)
    }
    return { blob: out.blob, fileName: out.fileName ?? 'document.pdf' }
  }

  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error ?? 'Could not download the document.', res.status)
  }
  const disposition = res.headers.get('content-disposition') ?? ''
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'document.pdf'
  return { blob: await res.blob(), fileName }
}

export interface Attachment {
  id: string
  requirement: string | null
  fileName: string
  contentType: string
  byteSize: number
  createdAt: string
}

/** Uploads go as multipart; the browser sets its own Content-Type boundary. */
async function uploadFile<T = Attachment>(
  path: string,
  file: File,
  requirement?: string,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  if (DEMO) {
    const { handleDemoRequest } = await import('./demoServer')
    const out = await handleDemoRequest(method, path, getToken(), undefined, file, requirement)
    if (out.status >= 400) {
      throw new ApiError((out.body as { error?: string })?.error ?? 'Could not attach that file.', out.status)
    }
    return out.body as T
  }

  const form = new FormData()
  form.append('file', file)
  if (requirement) form.append('requirement', requirement)
  const token = getToken()
  const res = await fetch(BASE + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(body?.error ?? 'Could not attach that file.', res.status)
  return body as T
}

/**
 * Fetches an image the page will render. An <img src> cannot carry the bearer
 * token, so the bytes are pulled here and handed to the DOM as an object URL.
 */
async function fetchBlob(path: string): Promise<Blob | null> {
  if (DEMO) {
    const { handleDemoRequest } = await import('./demoServer')
    const out = await handleDemoRequest('GET', path, getToken(), undefined)
    if (out.status === 404) return null
    if (out.status >= 400) throw new ApiError('Could not load that image.', out.status)
    return out.blob ?? null
  }

  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 404) return null
  if (!res.ok) throw new ApiError('Could not load that image.', res.status)
  return res.blob()
}

export interface ResidentCorrection {
  philSysId: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  birthDate: string | null
  address: string | null
  phone: string | null
}

export interface ClosureEffect {
  erased: Record<string, string | null>
  retained: Record<string, string | null>
  howToGoFurther: string
}

export interface Feedback {
  requestId: string
  rating: number
  comment: string | null
  createdAt: string
}

export const COMPLAINT_CATEGORIES = ['delay', 'conduct', 'fees', 'requirements', 'other'] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

export interface Complaint {
  id: string
  referenceNo: string
  departmentId: string
  requestId: string | null
  category: ComplaintCategory
  body: string
  status: 'open' | 'answered'
  dueOn: string
  response: string | null
  respondedAt: string | null
  createdAt: string
  officeName?: string
}

export interface StaffComplaint extends Complaint {
  officeName: string
  residentName: string
  requestRef: string | null
  overdue: boolean
}

export type AppointmentStatus = 'booked' | 'arrived' | 'served' | 'no_show' | 'cancelled'

export interface Appointment {
  id: string
  departmentId: string
  serviceId: string
  requestId: string | null
  scheduledOn: string
  startTime: string
  queueNo: string
  status: AppointmentStatus
  note: string | null
  createdAt: string
  serviceName?: string
  officeName?: string
  officeAddress?: string | null
}

export interface StaffAppointment extends Appointment {
  serviceName: string
  officeName: string
  residentName: string
  referenceNo: string | null
}

export interface OfficeBooking {
  departmentId: string
  enabled: boolean
  opens: string
  closes: string
  slotMinutes: number
  capacity: number
  horizonDays: number
}

export interface BookingDay {
  date: string
  open: boolean
  reason: string | null
}

export interface BookingSlot {
  startTime: string
  booked: number
  capacity: number
  available: boolean
}

export interface Hotline {
  id: string
  label: string
  agency: string
  phone: string
  isNational: boolean
  sortOrder: number
}

export type HotlineInput = Omit<Hotline, 'id' | 'sortOrder'> & { sortOrder?: number }

export interface Holiday {
  date: string
  name: string
  isLocal: boolean
}

/**
 * What `/verify/:code` answers for, across the three kinds of paper this app
 * issues. One endpoint, because a clerk holding a printout should not have to
 * know which tier issued it before they can check it.
 */
export interface VerifyResult {
  valid: boolean
  kind?: 'document' | 'receipt' | 'barangay_certificate'
  referenceNo?: string
  documentType?: string
  issuedBy?: string
  issuedTo?: string
  issuedAt?: string
  /** Certificates only; null where the type states no period. */
  validUntil?: string | null
  /** Certificates only. Derived on the server, on read. */
  expired?: boolean
  /** Receipts only. */
  particulars?: string
  amount?: number
  status?: string
  /**
   * Withdrawn by the office after it was released. `valid` stays true — the
   * code really is one this municipality issued, and saying otherwise would
   * read as "forgery" when the truth is "genuine, and no longer good".
   */
  revoked?: boolean
  revokedAt?: string
  revokedReason?: string | null
  /** How many times this code has been checked, this check included. */
  checks?: number
  error?: string
}

/** One row of the administrator's "checked most often" list. */
export interface DocumentCheckRow {
  kind: 'document' | 'receipt' | 'barangay_certificate'
  referenceNo: string
  documentType: string
  issuedBy: string
  issuedAt: string
  checks: number
  firstChecked: string
  lastChecked: string
  revoked: boolean
}

export interface OfficeContact {
  id: string
  name: string
  officeName: string
  address: string | null
  hours: string | null
  phone: string | null
  email: string | null
  /** Who signs what this office releases, and whether a signature is on file. */
  headName: string | null
  headTitle: string | null
  hasSignature: boolean
  signatureUpdatedAt: string | null
}

export interface AuditRow {
  id: number
  actorName: string
  action: string
  target: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

export interface StaffAccount {
  id: string
  email: string
  fullName: string
  role: 'staff' | 'admin'
  active: boolean
  createdAt: string
  departments: string[]
  position: string | null
  /** Only on creation: false means the invitation email did not go out. */
  invited?: boolean
}

export interface Notification {
  id: string
  requestId: string | null
  kind: 'assessed' | 'advanced' | 'released' | 'rejected'
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

export interface NotificationPreferences {
  notifyEmail: boolean
  notifySms: boolean
  phone: string | null
}

export const api = {
  catalogue: () =>
    request<{
      municipality: Municipality
      departments: ServiceCategory[]
      services: ServiceDefinition[]
      programs: SectoralProgram[]
      emergencyContacts: EmergencyContact[]
      holidays: Array<{ date: string; name: string; isLocal: boolean }>
      workflowSteps: string[]
    }>('/catalogue'),

  register: (body: Record<string, string | boolean>) =>
    request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: AuthUser; profile: ResidentProfileData | null }>('/auth/me'),

  /** The resident's own ID portrait, as a blob the ID card can render. */
  myPhoto: () => fetchBlob('/auth/me/photo'),

  setMyPhoto: (file: File) =>
    uploadFile<{ hasPhoto: boolean }>('/auth/me/photo', file, undefined, 'PUT'),

  removeMyPhoto: () => request<void>('/auth/me/photo', { method: 'DELETE' }),

  /** A fresh short-lived code for the resident's own ID. */
  issueVerification: () =>
    request<{ code: string; expiresAt: string; ttlSeconds: number }>('/auth/me/verification', {
      method: 'POST',
    }),

  /** Staff: check a code a resident is showing. Consumes it. */
  verifyId: (code: string) =>
    request<IdCheck>('/staff/verify-id', { method: 'POST', body: JSON.stringify({ code }) }),

  verifiedPhoto: (residentId: string) => fetchBlob(`/staff/verify-id/${residentId}/photo`),

  staffReport: (from: string, to: string, departmentId?: string) =>
    request<ReportSummary>(
      `/staff/reports?from=${from}&to=${to}${departmentId ? `&departmentId=${departmentId}` : ''}`
    ),

  /** Fetched with the bearer token, then handed to the browser as a download. */
  staffReportCsv: (from: string, to: string, departmentId?: string) =>
    downloadPdf(
      `/staff/reports?from=${from}&to=${to}${departmentId ? `&departmentId=${departmentId}` : ''}&format=csv`
    ),

  listDrafts: () => request<DraftRecord[]>('/requests/drafts'),

  saveDraft: (serviceId: string, formValues: Record<string, string>) =>
    request<DraftRecord>(`/requests/drafts/${encodeURIComponent(serviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ formValues }),
    }),

  discardDraft: (id: string) =>
    request<void>(`/requests/drafts/${id}`, { method: 'DELETE' }),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<void>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  myRequests: () => request<Application[]>('/requests'),

  myRequest: (id: string) =>
    request<Application & {
      events: RequestEvent[]
      /** Set once a payment for this request has settled. */
      receiptNo: string | null
      receiptIssuedAt: string | null
      /** The code printed on it, for reading out at a counter. */
      receiptCode: string | null
      /** The same, for the released document. Null until it is released. */
      documentCode: string | null
      /** Withdrawn by the office after release; the reason is always given. */
      documentRevoked: boolean
      documentRevokedReason: string | null
    }>(`/requests/${id}`),

  submitRequest: (
    serviceId: string,
    formValues: Record<string, string>,
    submittedOfflineAt?: string,
    draftId?: string
  ) =>
    request<Application>('/requests', {
      method: 'POST',
      body: JSON.stringify({ serviceId, formValues, submittedOfflineAt, draftId }),
    }),

  document: (id: string) => downloadPdf(`/requests/${id}/document`),

  /** The official receipt for this request's payment, for the resident who paid. */
  receipt: (id: string) => downloadPdf(`/requests/${id}/receipt`),

  notifications: () =>
    request<{ notifications: Notification[]; unread: number }>('/notifications'),

  markNotificationRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<void>('/notifications/read-all', { method: 'POST' }),

  notificationPreferences: () =>
    request<NotificationPreferences>('/notifications/preferences'),

  updateNotificationPreferences: (body: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  attachments: (id: string) => request<Attachment[]>(`/requests/${id}/attachments`),

  attach: (id: string, file: File, requirement?: string) =>
    uploadFile(`/requests/${id}/attachments`, file, requirement),

  removeAttachment: (id: string, attachmentId: string) =>
    request<void>(`/requests/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),

  attachmentFile: (id: string, attachmentId: string) =>
    downloadPdf(`/requests/${id}/attachments/${attachmentId}`),

  staffAttachments: (id: string) => request<Attachment[]>(`/staff/requests/${id}/attachments`),

  /** A reprint of an issued receipt, for the treasury counter. */
  staffReceipt: (reference: string) =>
    downloadPdf(`/staff/payments/${encodeURIComponent(reference)}/receipt`),

  /** The resident's programme record, read through a request of theirs. */
  staffPrograms: (id: string) =>
    request<{ residentName: string; programs: ResidentProgram[]; mayEdit: boolean }>(
      `/staff/requests/${id}/programs`
    ),

  staffGrantProgram: (
    id: string,
    body: { code: string; referenceNo?: string; validUntil?: string }
  ) =>
    request<{ programs: ResidentProgram[] }>(`/staff/requests/${id}/programs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  staffRevokeProgram: (id: string, code: string) =>
    request<{ programs: ResidentProgram[] }>(`/staff/requests/${id}/programs/${code}`, {
      method: 'DELETE',
    }),

  staffAttachmentFile: (id: string, attachmentId: string) =>
    downloadPdf(`/staff/requests/${id}/attachments/${attachmentId}`),

  staffDocument: (id: string) => downloadPdf(`/staff/requests/${id}/document`),

  /**
   * Withdrawing a released document. Final, and the reason reaches the
   * resident — so the console asks for one before it offers the button.
   */
  revokeDocument: (id: string, reason: string) =>
    request<{ revoked: boolean; verificationCode: string }>(
      `/staff/requests/${id}/revoke-document`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  /**
   * The public document check. No session: whoever is holding the paper already
   * has everything on it, and a check that needs an account is a check that
   * does not happen at a bank counter.
   */
  verify: (code: string) => request<VerifyResult>(`/verify/${encodeURIComponent(code)}`),

  /**
   * Start a payment. The amount is not in the body on purpose: the server reads
   * it off the request's assessment, because the browser does not decide what
   * something costs.
   */
  startPayment: (requestId: string) =>
    request<{
      reference: string
      amount: number
      provider: string
      redirectUrl: string
      status: string
    }>('/payments/intents', { method: 'POST', body: JSON.stringify({ requestId }) }),

  /**
   * What the payment screen polls. The server's record is the only thing that
   * decides whether money arrived — a resident who closed the tab at the gateway
   * is still paid up, and one who forges the return trip is not.
   */
  paymentStatus: (reference: string) =>
    request<{
      reference: string
      status: 'pending' | 'settled' | 'failed' | 'mismatched'
      amount: number
      providerRef: string | null
      method: string | null
      requestId: string
      note: string | null
      /** The official receipt, the moment the money lands. */
      receiptNo: string | null
    }>(`/payments/intents/${encodeURIComponent(reference)}`),

  /**
   * Development only. The server refuses this unless PAYMENT_PROVIDER is `mock`,
   * and it settles nothing itself — it sends the same signed callback a real
   * gateway would.
   */
  mockCompletePayment: (reference: string, method: string) =>
    request<{ delivered: boolean }>(
      `/payments/mock/${encodeURIComponent(reference)}/complete`,
      { method: 'POST', body: JSON.stringify({ method }) }
    ),

  // ---- the barangay tier ----

  /** Public: the sign-up and profile screens need this before any account. */
  barangays: () => request<Array<{ id: string; name: string; captain: string | null }>>('/barangays'),

  /** The certificate catalogue, public — the guide needs it before any account. */
  barangayCertificates: () =>
    request<Array<{
      id: string; name: string; description: string; fee: number
      purposeHint: string; steps: ServiceStep[]; validityDays: number | null
    }>>('/barangays/certificates'),

  /**
   * The resident's own barangay — what it charges, and how to reach it. The
   * hall's details ride along here rather than on the public list because this
   * is the screen that has to answer "come and collect it".
   */
  myBarangay: () =>
    request<{
      barangay: BarangayOffice | null
      certificates: Array<{
        id: string; name: string; description: string; fee: number
        purposeHint: string; steps: ServiceStep[]; validityDays: number | null
      }>
    }>('/barangay/me'),

  setMyBarangay: (barangayId: string) =>
    request<{ ok: true }>('/barangay/me', { method: 'PUT', body: JSON.stringify({ barangayId }) }),

  requestCertificate: (typeId: string, purpose: string) =>
    request<{
      id: string; referenceNo: string; requestedAt: string; status: string
      typeName: string; fee: number
    }>('/barangay/requests', { method: 'POST', body: JSON.stringify({ typeId, purpose }) }),

  myCertificates: () => request<BarangayRequest[]>('/barangay/requests'),

  /** The released certificate, for the resident it was issued to. */
  barangayCertificate: (id: string) =>
    downloadPdf(`/barangay/requests/${id}/certificate`),

  // ---- the barangay's own portal ----

  barangayStaffMe: () =>
    request<{
      barangay: { id: string; name: string; captain: string | null; secretary: string | null }
      role: string
    }>('/barangay-staff/me'),

  barangayQueue: (status?: string) =>
    request<BarangayRequest[]>(`/barangay-staff/requests${status ? `?status=${status}` : ''}`),

  advanceCertificate: (id: string, status: string, note?: string) =>
    request<{ ok: true }>(`/barangay-staff/requests/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, note }),
    }),

  /** What this barangay currently charges — its overrides, else the default. */
  barangayFees: () =>
    request<Array<{ id: string; name: string; fee: number }>>('/barangay-staff/fees'),

  setBarangayFee: (typeId: string, fee: number) =>
    request<{ ok: true; fee: number }>(`/barangay-staff/fees/${typeId}`, {
      method: 'PUT', body: JSON.stringify({ fee }),
    }),

  /** The hall's own details: both roles read, only the administrator writes. */
  barangayOffice: () => request<BarangayOffice>('/barangay-staff/office'),

  updateBarangayOffice: (patch: Partial<Pick<
    BarangayOffice, 'captain' | 'secretary' | 'hallAddress' | 'officeHours' | 'phone' | 'email'
  >>) =>
    request<BarangayOffice>('/barangay-staff/office', {
      method: 'PATCH', body: JSON.stringify(patch),
    }),

  /**
   * The barangay's seal, printed on every certificate it releases.
   * The administrator uploads and removes it; both roles can see it.
   */
  barangaySeal: () => fetchBlob('/barangay-staff/office/seal'),

  uploadBarangaySeal: (file: File) =>
    uploadFile<BarangayOffice>('/barangay-staff/office/seal', file, undefined, 'PUT'),

  removeBarangaySeal: () =>
    request<BarangayOffice>('/barangay-staff/office/seal', { method: 'DELETE' }),

  /**
   * The two officials' signatures, printed above their names on a certificate.
   * A picture, not a digital signature — the verification code is what proves
   * the certificate, and the console says so where these are uploaded.
   */
  barangaySignature: (who: 'captain' | 'secretary') =>
    fetchBlob(`/barangay-staff/office/signature/${who}`),

  uploadBarangaySignature: (who: 'captain' | 'secretary', file: File) =>
    uploadFile<BarangayOffice>(`/barangay-staff/office/signature/${who}`, file, undefined, 'PUT'),

  removeBarangaySignature: (who: 'captain' | 'secretary') =>
    request<BarangayOffice>(`/barangay-staff/office/signature/${who}`, { method: 'DELETE' }),

  /** A copy of a certificate this barangay released, for the counter. */
  barangayStaffCertificate: (id: string) =>
    downloadPdf(`/barangay-staff/requests/${id}/certificate`),

  /** Withdrawing one. The administrator's, final, and the reason is told. */
  revokeBarangayCertificate: (id: string, reason: string) =>
    request<{ revoked: boolean; verificationCode: string }>(
      `/barangay-staff/requests/${id}/revoke-certificate`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  /** Shared catalogue plus this barangay's own; `own` says which it may edit. */
  // ---- the shared certificate catalogue, the municipality's ----

  sharedCertificates: () => request<CertificateType[]>('/admin/certificates'),

  addSharedCertificate: (body: {
    name: string; description: string; fee: number
    purposeHint?: string; validityDays?: number | null; attestation?: string | null
  }) => request<CertificateType>('/admin/certificates', {
    method: 'POST', body: JSON.stringify(body),
  }),

  editSharedCertificate: (id: string, body: Partial<{
    name: string; description: string; fee: number
    purposeHint: string; validityDays: number | null; attestation: string | null
  }>) => request<CertificateType>(`/admin/certificates/${id}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),

  withdrawSharedCertificate: (id: string, restore = false) =>
    request<CertificateType>(
      `/admin/certificates/${id}${restore ? '?restore=true' : ''}`,
      { method: 'DELETE' }
    ),

  /** What changed about money, for the office that collects it. */
  feeChanges: () => request<FeeChange[]>('/staff/fee-changes'),

  barangayCertificateCatalogue: () =>
    request<CertificateType[]>('/barangay-staff/certificates'),

  addBarangayCertificate: (body: {
    name: string; description: string; fee: number
    purposeHint?: string; validityDays?: number | null; attestation?: string | null
  }) => request<CertificateType>('/barangay-staff/certificates', {
    method: 'POST', body: JSON.stringify(body),
  }),

  editBarangayCertificate: (id: string, body: Partial<{
    name: string; description: string; fee: number
    purposeHint: string; validityDays: number | null; attestation: string | null
  }>) => request<CertificateType>(`/barangay-staff/certificates/${id}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),

  /** Withdrawn, never deleted — an issued certificate keeps its name. */
  withdrawBarangayCertificate: (id: string, restore = false) =>
    request<CertificateType>(
      `/barangay-staff/certificates/${id}${restore ? '?restore=true' : ''}`,
      { method: 'DELETE' }
    ),

  barangayOfficers: () =>
    request<Array<{ id: string; fullName: string; email: string; role: string; active: boolean }>>(
      '/barangay-staff/officers'
    ),

  /**
   * Issuing one. The barangay may create an officer or a kagawad and never an
   * administrator — that stays a municipal act, which is what keeps this from
   * being a way to manufacture authority.
   */
  issueBarangayAccount: (body: {
    email: string; fullName: string; role: 'barangay_officer' | 'barangay_kagawad'
  }) =>
    request<{
      id: string; fullName: string; email: string; role: string; active: boolean; invited: boolean
    }>('/barangay-staff/officers', { method: 'POST', body: JSON.stringify(body) }),

  revokeBarangayAccount: (id: string) =>
    request<void>(`/barangay-staff/officers/${id}/deactivate`, { method: 'POST' }),

  restoreBarangayAccount: (id: string) =>
    request<void>(`/barangay-staff/officers/${id}/reactivate`, { method: 'POST' }),

  resendBarangayInvite: (id: string) =>
    request<{ sent: boolean }>(`/barangay-staff/officers/${id}/send-reset`, { method: 'POST' }),

  // ---- the council's own view ----
  //
  // A separate mount, not a branch of the staff routes: a kagawad is refused by
  // every route in that console, including ones added later. Figures, never
  // people — there is no endpoint here that returns a resident.

  kagawadMe: () =>
    request<{ barangay: { id: string; name: string; captain: string | null }; role: string }>(
      '/barangay-kagawad/me'
    ),

  kagawadSummary: () =>
    request<{
      barangay: string
      counts: { pending: number; processing: number; ready: number; released: number; rejected: number }
      collected: number
    }>('/barangay-kagawad/summary'),

  kagawadFigures: () =>
    request<{
      barangay: string; households: number; population: number
      female: number; male: number; children: number; adults: number; seniors: number
      withoutBirthDate: number; pwd: number; fourPs: number; voters: number
      byPurok: Array<{ purok: string | null; households: number; population: number }>
    }>('/barangay-kagawad/figures'),

  kagawadAnnouncements: () => request<Announcement[]>('/barangay-kagawad/announcements'),

  barangaySummary: () =>
    request<{
      barangay: string
      counts: { pending: number; processing: number; ready: number; released: number; rejected: number }
      collected: number
    }>('/barangay-staff/summary'),

  // ---- the barangay blotter ----
  //
  // Barangay staff only, and scoped server-side to their own barangay. Nothing
  // in the resident app calls any of these.

  blotterEntries: (params: { status?: string; q?: string } = {}) => {
    const search = new URLSearchParams()
    if (params.status) search.set('status', params.status)
    if (params.q) search.set('q', params.q)
    const qs = search.toString()
    return request<BlotterEntry[]>(`/barangay-staff/blotter${qs ? `?${qs}` : ''}`)
  },

  blotterEntry: (id: string) =>
    request<BlotterEntry & { summons: BlotterSummons[] }>(`/barangay-staff/blotter/${id}`),

  recordBlotterEntry: (body: {
    complainant: string; complainantContact?: string
    respondent: string; respondentAddress?: string; respondentContact?: string
    nature: string; narrative: string; occurredAt?: string
  }) => request<BlotterEntry>('/barangay-staff/blotter', { method: 'POST', body: JSON.stringify(body) }),

  closeBlotterEntry: (id: string, status: string, outcomeNote?: string) =>
    request<{ ok: true }>(`/barangay-staff/blotter/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, outcomeNote }),
    }),

  issueSummons: (id: string, body: { hearingAt: string; venue: string; note?: string }) =>
    request<{ id: string; sequence: number; hearingAt: string }>(
      `/barangay-staff/blotter/${id}/summons`, { method: 'POST', body: JSON.stringify(body) }
    ),

  recordSummons: (id: string, summonsId: string, body: {
    outcome?: string; servedAt?: string; servedNote?: string
  }) =>
    request<{ ok: true }>(`/barangay-staff/blotter/${id}/summons/${summonsId}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  blotterCalendar: () =>
    request<Array<{
      id: string; blotterId: string; sequence: number; hearingAt: string; venue: string
      servedAt: string | null; referenceNo: string; complainant: string; respondent: string
    }>>('/barangay-staff/blotter/calendar/upcoming'),

  // ---- barangay announcements ----
  //
  // The one barangay feature with a resident face: a board is worthless until
  // the people it concerns have seen it.

  /** The live notices on the resident's own barangay board. */
  barangayAnnouncements: () => request<Announcement[]>('/barangay/announcements'),

  staffAnnouncements: (archived?: boolean) =>
    request<Announcement[]>(
      `/barangay-staff/announcements${archived === undefined ? '' : `?archived=${archived}`}`
    ),

  postAnnouncement: (body: {
    kind: string; title: string; body: string; urgent?: boolean; expiresAt?: string
  }) => request<Announcement & { notified: number }>('/barangay-staff/announcements', {
    method: 'POST', body: JSON.stringify(body),
  }),

  editAnnouncement: (id: string, body: Record<string, string | null | undefined>) =>
    request<Announcement>(`/barangay-staff/announcements/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  takeDownAnnouncement: (id: string) =>
    request<{ ok: true }>(`/barangay-staff/announcements/${id}`, { method: 'DELETE' }),

  // ---- the record of barangay inhabitants ----
  //
  // The one directory in the app. Barangay staff only, scoped server-side to
  // their own barangay, and never reachable from the resident shell.

  households: (params: { status?: string; purok?: string; q?: string } = {}) => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
    const qs = search.toString()
    return request<Household[]>(`/barangay-staff/households${qs ? `?${qs}` : ''}`)
  },

  household: (id: string) =>
    request<Household & { notes: string | null; members: HouseholdMember[] }>(
      `/barangay-staff/households/${id}`
    ),

  addHousehold: (body: {
    address: string; purok?: string; headName: string; contact?: string; notes?: string
  }) => request<{ id: string; householdNo: number }>('/barangay-staff/households', {
    method: 'POST', body: JSON.stringify(body),
  }),

  editHousehold: (id: string, body: Record<string, string | undefined>) =>
    request<{ ok: true }>(`/barangay-staff/households/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  setHouseholdStatus: (id: string, status: string, statusNote?: string) =>
    request<{ ok: true }>(`/barangay-staff/households/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status, statusNote }),
    }),

  addHouseholdMember: (id: string, body: Partial<HouseholdMember> & { fullName: string; relationship: string }) =>
    request<HouseholdMember>(`/barangay-staff/households/${id}/members`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  editHouseholdMember: (id: string, memberId: string, body: Partial<HouseholdMember>) =>
    request<HouseholdMember>(`/barangay-staff/households/${id}/members/${memberId}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  removeHouseholdMember: (id: string, memberId: string) =>
    request<{ ok: true }>(`/barangay-staff/households/${id}/members/${memberId}`, { method: 'DELETE' }),

  householdFigures: () =>
    request<{
      barangay: string; households: number; population: number
      female: number; male: number; children: number; adults: number; seniors: number
      withoutBirthDate: number; pwd: number; fourPs: number; voters: number
      byPurok: Array<{ purok: string | null; households: number; population: number }>
    }>('/barangay-staff/households/figures/summary'),

  // ---- incident reports ----

  reportIncident: (body: {
    kind: string
    description: string
    location?: string
  }) =>
    request<{ id: string; referenceNo: string; reportedAt: string; status: string }>(
      '/incidents',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  myIncidents: () =>
    request<Array<{
      id: string; referenceNo: string; kind: string; description: string
      location: string | null; status: string; reportedAt: string
      officeNote: string | null; handledAt: string | null; evidenceCount: number
    }>>('/incidents'),

  /**
   * Evidence goes up one file at a time, after the report exists, so a failed
   * upload leaves a filed report rather than losing the whole thing. The
   * duration the browser read off the video rides along — the server bounds it
   * rather than trusting it.
   */
  addIncidentEvidence: async (
    incidentId: string,
    file: File,
    durationSeconds: number | null
  ) => {
    if (DEMO) {
      const { handleDemoRequest } = await import('./demoServer')
      const out = await handleDemoRequest(
        'POST', `/incidents/${incidentId}/evidence`, getToken(),
        { durationSeconds }, file
      )
      if (out.status >= 400) {
        throw new ApiError((out.body as { error?: string })?.error ?? 'Could not attach that file.', out.status)
      }
      return out.body as { id: string }
    }
    const form = new FormData()
    form.append('file', file)
    if (durationSeconds !== null) form.append('durationSeconds', String(Math.round(durationSeconds)))
    const token = getToken()
    const res = await fetch(`${BASE}/incidents/${incidentId}/evidence`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(body?.error ?? 'Could not attach that file.', res.status)
    return body as { id: string }
  },

  /** The administrator's queue of what residents have reported. */
  staffIncidents: (status?: string) =>
    request<Array<{
      id: string; referenceNo: string; kind: string; description: string
      location: string | null; latitude: number | null; longitude: number | null
      status: string; reportedAt: string; reportedBy: string
      officeNote: string | null; handledAt: string | null; handledBy: string | null
      evidence: Array<{
        id: string; contentType: string; byteSize: number
        durationSeconds: number | null; uploadedAt: string
      }>
    }>>(`/staff/incidents${status ? `?status=${status}` : ''}`),

  updateIncident: (id: string, body: { status: string; note?: string }) =>
    request<{ ok: true }>(`/staff/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  /** Evidence as a blob, because <video src> cannot carry the bearer token. */
  incidentEvidence: (incidentId: string, evidenceId: string) =>
    fetchBlob(`/staff/incidents/${incidentId}/evidence/${evidenceId}`),

  /** The treasurer's book, for reconciliation. */
  paymentsBook: (from: string, to: string) =>
    request<{
      from: string
      to: string
      total: number
      count: number
      settled: Array<{
        reference: string; provider: string; providerRef: string | null; method: string | null
        amount: number; settledAt: string; requestRef: string; serviceName: string
        /** Null only for payments settled before receipts existed. */
        receiptNo: string | null
      }>
      unsettled: Array<{
        reference: string; provider: string; providerRef: string | null; status: string
        amount: number; createdAt: string; note: string | null; requestRef: string
      }>
    }>(`/staff/payments?from=${from}&to=${to}`),

  listStaff: () => request<StaffAccount[]>('/admin/staff'),

  createStaff: (body: {
    email: string; fullName: string; role?: string
    departments: string[]; position?: string
  }) => request<StaffAccount>('/admin/staff', { method: 'POST', body: JSON.stringify(body) }),

  updateStaff: (id: string, body: { departments?: string[]; position?: string; fullName?: string }) =>
    request<StaffAccount>(`/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deactivateStaff: (id: string) =>
    request<void>(`/admin/staff/${id}/deactivate`, { method: 'POST' }),

  reactivateStaff: (id: string) =>
    request<void>(`/admin/staff/${id}/reactivate`, { method: 'POST' }),

  sendStaffReset: (id: string) =>
    request<{ message: string }>(`/admin/staff/${id}/send-reset`, { method: 'POST' }),

  // The municipal facts that rot: hotlines, the calendar, and how to reach an
  // office. Admin-only and audited server-side.
  listHotlines: () => request<Hotline[]>('/admin/hotlines'),

  createHotline: (body: HotlineInput) =>
    request<Hotline>('/admin/hotlines', { method: 'POST', body: JSON.stringify(body) }),

  updateHotline: (id: string, body: HotlineInput) =>
    request<Hotline>(`/admin/hotlines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteHotline: (id: string) => request<void>(`/admin/hotlines/${id}`, { method: 'DELETE' }),

  listHolidays: (year: number) => request<Holiday[]>(`/admin/holidays?year=${year}`),

  saveHoliday: (body: Holiday) =>
    request<Holiday>('/admin/holidays', { method: 'POST', body: JSON.stringify(body) }),

  deleteHoliday: (date: string) => request<void>(`/admin/holidays/${date}`, { method: 'DELETE' }),

  listOffices: () => request<OfficeContact[]>('/admin/offices'),

  updateOffice: (id: string, body: Partial<Pick<
    OfficeContact, 'address' | 'hours' | 'phone' | 'email' | 'headName' | 'headTitle'
  >>) =>
    request<OfficeContact>(`/admin/offices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  /** The head's signature, printed on every document this office releases. */
  officeSignature: (id: string) => fetchBlob(`/admin/offices/${id}/signature`),

  uploadOfficeSignature: (id: string, file: File) =>
    uploadFile<OfficeContact>(`/admin/offices/${id}/signature`, file, undefined, 'PUT'),

  removeOfficeSignature: (id: string) =>
    request<OfficeContact>(`/admin/offices/${id}/signature`, { method: 'DELETE' }),

  /** What the municipality prints on a receipt, and its seal. */
  municipalityDetails: () => request<MunicipalityDetails>('/admin/municipality'),

  updateMunicipality: (body: Partial<Pick<
    MunicipalityDetails,
    'address' | 'phone' | 'email' | 'website' | 'tin' | 'treasurerName' |
    'treasurerTitle' | 'receiptPrefix' | 'receiptFormLabel' | 'receiptFooter'
  >>) =>
    request<MunicipalityDetails>('/admin/municipality', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  /** The seal as a blob, because <img src> cannot carry the bearer token. */
  municipalSeal: () => fetchBlob('/admin/municipality/seal'),

  uploadMunicipalSeal: (file: File) =>
    uploadFile<MunicipalityDetails>('/admin/municipality/seal', file, undefined, 'PUT'),

  removeMunicipalSeal: () =>
    request<MunicipalityDetails>('/admin/municipality/seal', { method: 'DELETE' }),

  /** The treasurer's signature, printed above their name on a receipt. */
  treasurerSignature: () => fetchBlob('/admin/municipality/treasurer-signature'),

  uploadTreasurerSignature: (file: File) =>
    uploadFile<MunicipalityDetails>('/admin/municipality/treasurer-signature', file, undefined, 'PUT'),

  removeTreasurerSignature: () =>
    request<MunicipalityDetails>('/admin/municipality/treasurer-signature', { method: 'DELETE' }),

  auditTrail: (limit = 50) => request<AuditRow[]>(`/admin/audit?limit=${limit}`),

  /** What has been checked most often lately — the one signal a copy leaves. */
  documentChecks: (days = 90) =>
    request<{ days: number; rows: DocumentCheckRow[] }>(`/admin/document-checks?days=${days}`),

  // Appointments: booking a slot at the counter, and what the office sees.
  myAppointments: () => request<Appointment[]>('/appointments'),

  bookingDays: (departmentId: string) =>
    request<{ office: OfficeBooking; days: BookingDay[] }>(
      `/appointments/days?departmentId=${encodeURIComponent(departmentId)}`
    ),

  bookingSlots: (departmentId: string, date: string) =>
    request<{ date: string; slots: BookingSlot[]; closedReason: string | null }>(
      `/appointments/availability?departmentId=${encodeURIComponent(departmentId)}&date=${date}`
    ),

  bookAppointment: (body: {
    serviceId: string; scheduledOn: string; startTime: string
    requestId?: string; note?: string
  }) => request<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(body) }),

  cancelAppointment: (id: string) => request<void>(`/appointments/${id}`, { method: 'DELETE' }),

  staffDay: (date: string, departmentId?: string) =>
    request<{ date: string; appointments: StaffAppointment[] }>(
      `/staff/appointments?date=${date}${departmentId ? `&departmentId=${encodeURIComponent(departmentId)}` : ''}`
    ),

  markAppointment: (id: string, action: 'arrived' | 'served' | 'no-show') =>
    request<StaffAppointment>(`/staff/appointments/${id}/${action}`, { method: 'POST' }),

  // Feedback and complaints — the RA 11032 mechanism.
  // Web Push. The public key is fetched rather than baked into the bundle, so
  // a deployment that has not configured push says so instead of offering a
  // switch that cannot work.
  pushKey: () => request<{ enabled: boolean; publicKey: string | null }>('/notifications/push-key'),

  savePushSubscription: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ id: string }>('/notifications/push', { method: 'POST', body: JSON.stringify(body) }),

  removePushSubscription: (endpoint: string) =>
    request<void>('/notifications/push', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),

  // Data Privacy Act rights: see it all, correct what is yours, close the account.
  exportMyData: () => downloadPdf('/privacy/export'),

  correctProfile: (patch: {
    barangay?: string | null; address?: string | null
    phone?: string | null; birthDate?: string | null
  }) => request<ResidentCorrection>('/privacy/profile', { method: 'PATCH', body: JSON.stringify(patch) }),

  closurePreview: () => request<ClosureEffect>('/privacy/closure-preview'),

  closeMyAccount: (reason?: string) =>
    request<ClosureEffect & { closedAt: string }>('/privacy/close', {
      method: 'POST', body: JSON.stringify({ reason }),
    }),

  myFeedback: () => request<Feedback[]>('/feedback'),

  rateRequest: (requestId: string, rating: number, comment?: string) =>
    request<Feedback>(`/feedback/${requestId}`, { method: 'PUT', body: JSON.stringify({ rating, comment }) }),

  myComplaints: () => request<Complaint[]>('/feedback/complaints'),

  fileComplaint: (body: {
    departmentId: string; category: ComplaintCategory; body: string; requestId?: string
  }) => request<Complaint>('/feedback/complaints', { method: 'POST', body: JSON.stringify(body) }),

  staffComplaints: (opts: { departmentId?: string; status?: 'open' | 'answered' } = {}) => {
    const params = new URLSearchParams()
    if (opts.departmentId) params.set('departmentId', opts.departmentId)
    if (opts.status) params.set('status', opts.status)
    const qs = params.toString()
    return request<StaffComplaint[]>(`/staff/complaints${qs ? `?${qs}` : ''}`)
  },

  respondToComplaint: (id: string, response: string) =>
    request<StaffComplaint>(`/staff/complaints/${id}/respond`, {
      method: 'POST', body: JSON.stringify({ response }),
    }),

  staffQueue: (opts: {
    departmentId?: string
    status?: string
    q?: string
    cursor?: string
    limit?: number
  } = {}) => {
    const params = new URLSearchParams()
    if (opts.departmentId) params.set('departmentId', opts.departmentId)
    if (opts.status) params.set('status', opts.status)
    if (opts.q) params.set('q', opts.q)
    if (opts.cursor) params.set('cursor', opts.cursor)
    if (opts.limit) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return request<{ items: Application[]; nextCursor: string | null; total: number }>(
      `/staff/queue${qs ? `?${qs}` : ''}`
    )
  },

  staffRequest: (id: string) =>
    request<Application & {
      events: RequestEvent[]
      /** Null until the office releases the document. */
      documentCode: string | null
      documentRevoked: boolean
      documentRevokedReason: string | null
    }>(`/staff/requests/${id}`),

  assess: (id: string, fee: number, note?: string) =>
    request<Application>(`/staff/requests/${id}/assess`, {
      method: 'POST',
      body: JSON.stringify({ fee, note }),
    }),

  advance: (id: string, note?: string) =>
    request<Application>(`/staff/requests/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  reject: (id: string, reason: string) =>
    request<Application>(`/staff/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
}
