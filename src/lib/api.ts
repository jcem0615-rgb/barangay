import type {
  Application, ResidentProgram, SectoralProgram, ServiceCategory, ServiceDefinition,
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
      departments: ServiceCategory[]
      services: ServiceDefinition[]
      programs: SectoralProgram[]
      holidays: Array<{ date: string; name: string; isLocal: boolean }>
      workflowSteps: string[]
    }>('/catalogue'),

  register: (body: Record<string, string>) =>
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

  pay: (id: string, method: string) =>
    request<Application>(`/requests/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    }),

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
