import type {
  Application, EmergencyContact, Municipality, ResidentProgram, SectoralProgram,
  ServiceCategory, ServiceDefinition,
} from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

/**
 * The demo build answers every call in the browser instead of over the network.
 * Guarded by a build-time flag so the constant folds away and the demo server is
 * tree-shaken out of the production bundle entirely.
 */
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
  role: 'resident' | 'staff' | 'admin'
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

export interface OfficeContact {
  id: string
  name: string
  officeName: string
  address: string | null
  hours: string | null
  phone: string | null
  email: string | null
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

  myRequest: (id: string) => request<Application & { events: RequestEvent[] }>(`/requests/${id}`),

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

  verify: (code: string) =>
    request<{ valid: boolean; referenceNo?: string; documentType?: string; issuedBy?: string; issuedTo?: string; issuedAt?: string }>(
      `/verify/${encodeURIComponent(code)}`
    ),

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

  updateOffice: (id: string, body: Partial<Omit<OfficeContact, 'id' | 'name' | 'officeName'>>) =>
    request<OfficeContact>(`/admin/offices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  auditTrail: (limit = 50) => request<AuditRow[]>(`/admin/audit?limit=${limit}`),

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
    request<Application & { events: RequestEvent[] }>(`/staff/requests/${id}`),

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
