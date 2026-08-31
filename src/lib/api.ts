import type { Application, ServiceCategory, ServiceDefinition } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

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
async function uploadFile(path: string, file: File, requirement?: string) {
  const form = new FormData()
  form.append('file', file)
  if (requirement) form.append('requirement', requirement)
  const token = getToken()
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(body?.error ?? 'Could not attach that file.', res.status)
  return body as Attachment
}

export const api = {
  catalogue: () =>
    request<{
      departments: ServiceCategory[]
      services: ServiceDefinition[]
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

  submitRequest: (serviceId: string, formValues: Record<string, string>, submittedOfflineAt?: string) =>
    request<Application>('/requests', {
      method: 'POST',
      body: JSON.stringify({ serviceId, formValues, submittedOfflineAt }),
    }),

  document: (id: string) => downloadPdf(`/requests/${id}/document`),

  attachments: (id: string) => request<Attachment[]>(`/requests/${id}/attachments`),

  attach: (id: string, file: File, requirement?: string) =>
    uploadFile(`/requests/${id}/attachments`, file, requirement),

  removeAttachment: (id: string, attachmentId: string) =>
    request<void>(`/requests/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),

  attachmentFile: (id: string, attachmentId: string) =>
    downloadPdf(`/requests/${id}/attachments/${attachmentId}`),

  staffAttachments: (id: string) => request<Attachment[]>(`/staff/requests/${id}/attachments`),

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

  staffQueue: (departmentId?: string, status?: string) => {
    const params = new URLSearchParams()
    if (departmentId) params.set('departmentId', departmentId)
    if (status) params.set('status', status)
    const qs = params.toString()
    return request<Application[]>(`/staff/queue${qs ? `?${qs}` : ''}`)
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
