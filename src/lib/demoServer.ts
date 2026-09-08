/**
 * In-browser stand-in for the API, used only by the demo build
 * (`VITE_DEMO=1`). It exists so the app can be clicked through without running
 * Postgres and the Node server.
 *
 * Its rules deliberately mirror the real server — department scoping, the
 * workflow order, who may read what — so the demo does not teach anything the
 * real system would refuse. What it is NOT: durable, multi-user, or secure.
 * Everything lives in this browser's localStorage, tokens are not verified, and
 * nothing here is used by the production build.
 */
import { HOLIDAYS, SECTORAL_PROGRAMS, SERVICES, SERVICE_CATEGORIES } from '../data/mockData'
import { addWorkingDays } from './schedule'
import { WORKFLOW_STEPS, type ServiceDefinition } from '../types'

// Bumped whenever the seeded shape changes: a store written by an older build
// would be missing fields this one reads, so it is discarded rather than
// patched. Losing a demo's clicked-through state is the cheaper failure.
const STORE_KEY = 'elgu-demo-state-v4'

interface DemoUser {
  id: string
  email: string
  password: string
  fullName: string
  role: 'resident' | 'staff' | 'admin'
  departments: string[]
  position: string | null
  active: boolean
  notifyEmail: boolean
  notifySms: boolean
  profile: {
    philSysId: string | null; barangay: string | null; municipality: string | null
    province: string | null; birthDate: string | null; address: string | null; phone: string | null
  }
  /** Sectoral and poverty-reduction memberships, as the office recorded them. */
  programs: Array<{
    code: string; referenceNo: string | null; enrolledOn: string; validUntil: string | null
  }>
}

interface DemoDraft {
  id: string
  residentId: string
  serviceId: string
  formValues: Record<string, string>
  createdAt: string
  updatedAt: string
}

interface DemoRequest {
  id: string
  referenceNo: string
  residentId: string
  serviceId: string
  serviceName: string
  categoryId: string
  status: string
  currentStepIndex: number
  fee: number
  paid: boolean
  paymentMethod?: string
  paidAt?: string
  formValues: Record<string, string>
  rejectionReason?: string
  dateSubmitted: string
  events: Array<{ eventType: string; note: string | null; createdAt: string; actorName?: string | null }>
  attachments: Array<{ id: string; requirement: string | null; fileName: string; contentType: string; byteSize: number; createdAt: string; data: string }>
  document?: { fileName: string; verificationCode: string }
}

interface DemoNotification {
  id: string; userId: string; requestId: string | null; kind: string
  title: string; body: string; createdAt: string; readAt: string | null
}

interface DemoState {
  users: DemoUser[]
  requests: DemoRequest[]
  drafts: DemoDraft[]
  notifications: DemoNotification[]
  counters: Record<string, number>
}

const uid = () => crypto.randomUUID()

const STAFF_SEED: Array<{ email: string; name: string; dept: string; position: string }> = [
  { email: 'treasury@sanfernando.gov.ph', name: 'Ana R. Lim', dept: 'treasury', position: 'Revenue Officer II' },
  { email: 'bpls@sanfernando.gov.ph', name: 'Rico M. Dela Cruz', dept: 'bpls', position: 'Licensing Officer' },
  { email: 'obo@sanfernando.gov.ph', name: 'Eng. Jose P. Vega', dept: 'obo', position: 'Building Inspector' },
  { email: 'lcr@sanfernando.gov.ph', name: 'Carmen S. Reyes', dept: 'lcr', position: 'Registration Officer' },
  { email: 'cswdo@sanfernando.gov.ph', name: 'Grace T. Bautista', dept: 'cswdo', position: 'Social Welfare Officer' },
  { email: 'health@sanfernando.gov.ph', name: 'Dr. Elena V. Cruz', dept: 'health', position: 'Sanitation Inspector' },
]

const DEMO_PASSWORD = 'elgu-demo-2026'

function seed(): DemoState {
  const users: DemoUser[] = [
    {
      id: uid(), email: 'admin@sanfernando.gov.ph', password: DEMO_PASSWORD,
      fullName: 'Office of the Mayor — Administrator', role: 'admin', departments: [],
      position: null, active: true, notifyEmail: true, notifySms: false,
      profile: { philSysId: null, barangay: null, municipality: null, province: null, birthDate: null, address: null, phone: null },
      programs: [],
    },
    ...STAFF_SEED.map((s) => ({
      id: uid(), email: s.email, password: DEMO_PASSWORD, fullName: s.name,
      role: 'staff' as const, departments: [s.dept], position: s.position, active: true,
      notifyEmail: true, notifySms: false,
      profile: { philSysId: null, barangay: null, municipality: null, province: null, birthDate: null, address: null, phone: null },
      programs: [],
    })),
  ]

  // A resident with history, so the demo isn't an empty shell on first open.
  const resident: DemoUser = {
    id: uid(), email: 'maria@example.ph', password: DEMO_PASSWORD,
    fullName: 'Maria Clara D. Santos', role: 'resident', departments: [], position: null,
    active: true, notifyEmail: true, notifySms: false,
    profile: {
      philSysId: '6392-8841-0027-3311', barangay: 'Barangay San Isidro',
      municipality: 'Municipality of San Fernando', province: 'Cebu',
      birthDate: '1994-03-18', address: 'Blk 4 Lot 12, Purok 3', phone: null,
    },
    // Seeded so the demo ID card shows a real record rather than an empty one.
    programs: [
      { code: '4ps', referenceNo: 'HH-2019-88214', enrolledOn: '2024-06-11', validUntil: null },
      { code: 'solo_parent', referenceNo: 'SP-2026-0417', enrolledOn: '2026-01-20', validUntil: '2027-01-20' },
      { code: 'farmer', referenceNo: 'RSBSA-07-114522', enrolledOn: '2023-08-02', validUntil: null },
    ],
  }
  users.push(resident)

  const state: DemoState = { users, requests: [], drafts: [], notifications: [], counters: {} }

  const boss = SERVICES.find((s) => s.id === 'boss-application')!
  const birth = SERVICES.find((s) => s.id === 'birth-certificate')!
  const now = Date.now()

  state.requests.push(makeRequest(state, resident, boss, { businessName: 'Santos Sari-Sari Store', businessType: 'Renewal' }, now - 86400000 * 12))
  state.requests[0]!.status = 'for_payment'
  state.requests[0]!.currentStepIndex = 2
  state.requests[0]!.fee = 2850
  state.requests[0]!.events.push({ eventType: 'assessed', note: 'Renewal assessment', createdAt: new Date(now - 86400000 * 10).toISOString(), actorName: 'Rico M. Dela Cruz' })

  state.requests.push(makeRequest(state, resident, birth, { registrantName: 'Maria Clara D. Santos', copies: '2' }, now - 86400000 * 30))
  const done = state.requests[1]!
  done.status = 'completed'
  done.currentStepIndex = WORKFLOW_STEPS.length - 1
  done.fee = 155
  done.paid = true
  done.paymentMethod = 'GCash'
  done.paidAt = new Date(now - 86400000 * 27).toISOString()
  done.document = { fileName: `birth-certificate-psa-${done.referenceNo}.pdf`, verificationCode: 'K4TR-9WQ2-JH5N-P0CX' }
  done.events.push(
    { eventType: 'assessed', note: null, createdAt: new Date(now - 86400000 * 28).toISOString(), actorName: 'Carmen S. Reyes' },
    { eventType: 'paid', note: 'Paid via GCash', createdAt: new Date(now - 86400000 * 27).toISOString(), actorName: 'Maria Clara D. Santos' },
    { eventType: 'released', note: 'Document released (code K4TR-9WQ2-JH5N-P0CX)', createdAt: new Date(now - 86400000 * 26).toISOString(), actorName: 'Carmen S. Reyes' },
  )

  // A live social-welfare request, so a CSWDO clerk opening the demo has a
  // queue to work and the programme record is reachable from it.
  const soloParent = SERVICES.find((s) => s.id === 'solo-parent-id')!
  state.requests.push(
    makeRequest(
      state, resident, soloParent,
      { groundForSoloParent: 'Death of Spouse', childrenCount: '2', monthlyIncome: '12000' },
      now - 86400000 * 3
    )
  )

  return state
}

const PREFIX: Record<string, string> = {
  bpls: 'BOSS', cswdo: 'CSWDO', lcr: 'LCR', treasury: 'MTO', obo: 'OBO', health: 'MHO',
}

function makeRequest(
  state: DemoState, resident: DemoUser,
  service: { id: string; name: string; categoryId: string; fee: number },
  formValues: Record<string, string>, at = Date.now()
): DemoRequest {
  const year = new Date(at).getFullYear()
  const key = `${service.categoryId}:${year}`
  state.counters[key] = (state.counters[key] ?? 0) + 1
  const seq = state.counters[key]!
  return {
    id: uid(),
    referenceNo: `${PREFIX[service.categoryId] ?? 'LGU'}-${year}-${String(seq).padStart(5, '0')}`,
    residentId: resident.id,
    serviceId: service.id,
    serviceName: service.name,
    categoryId: service.categoryId,
    status: 'submitted',
    currentStepIndex: 0,
    fee: service.fee,
    paid: false,
    formValues,
    dateSubmitted: new Date(at).toISOString(),
    events: [{ eventType: 'submitted', note: null, createdAt: new Date(at).toISOString(), actorName: resident.fullName }],
    attachments: [],
  }
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw) as DemoState
  } catch {
    // fall through to a fresh seed
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

function save(state: DemoState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked; the session continues in memory.
  }
}

/** Resets the demo to its seeded state. Exposed on window for the reset link. */
export function resetDemo() {
  try {
    localStorage.removeItem(STORE_KEY)
    localStorage.removeItem('elgu-token')
  } catch { /* ignore */ }
  location.reload()
}

let state = load()
const persist = () => save(state)

// Tokens here are just the user's id: this is a demo, not an auth system.
const userFor = (token: string | null) => state.users.find((u) => u.id === token && u.active)

class DemoError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const notify = (userId: string, requestId: string | null, kind: string, title: string, body: string) => {
  state.notifications.unshift({
    id: uid(), userId, requestId, kind, title, body,
    createdAt: new Date().toISOString(), readAt: null,
  })
}

/**
 * Memberships in catalogue order, with `expired` derived on read — the same
 * rule as the server, so a lapsed record reads as needing renewal rather than
 * silently vanishing.
 */
const serializePrograms = (user: DemoUser) =>
  SECTORAL_PROGRAMS.flatMap((def) => {
    const held = user.programs.find((p) => p.code === def.code)
    if (!held) return []
    return [{
      code: held.code,
      referenceNo: held.referenceNo,
      enrolledOn: held.enrolledOn,
      validUntil: held.validUntil,
      expired: Boolean(held.validUntil && held.validUntil < today()),
    }]
  })

const today = () => new Date().toISOString().slice(0, 10)

/** Only the social welfare office and admins may write a programme record. */
const mayAdministerPrograms = (user: DemoUser) =>
  user.role === 'admin' || user.departments.includes('cswdo')

const officeName = (categoryId: string) =>
  SERVICE_CATEGORIES.find((c) => c.id === categoryId)?.officeName ?? 'The municipal office'

const HOLIDAY_DAYS = new Set(HOLIDAYS.map((h) => h.date))

/**
 * The same field rules as the real API: a submission must be complete, a draft
 * need only stay inside the shape the service declares. Throws a DemoError so
 * the app sees exactly the message the server would have sent.
 */
function checkFormValues(
  service: ServiceDefinition,
  formValues: Record<string, string>,
  complete: boolean
) {
  const declared = new Map(service.fields.map((f) => [f.id, f]))
  const unknown = Object.keys(formValues).find((k) => !declared.has(k))
  if (unknown) throw new DemoError(400, `Unexpected field: ${unknown}`)

  if (!complete) return

  for (const field of service.fields) {
    const name = field.label ?? field.id
    const value = (formValues[field.id] ?? '').trim()
    if (field.required && value === '') throw new DemoError(400, `${name} is required.`)
    if (value === '') continue
    if (field.type === 'select' && field.options?.length && !field.options.includes(value)) {
      throw new DemoError(400, `${name} must be one of the listed choices.`)
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      throw new DemoError(400, `${name} must be a number.`)
    }
    if (field.type === 'date' && !isCalendarDate(value)) {
      throw new DemoError(400, `${name} must be a valid date.`)
    }
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const asDate = new Date(Date.UTC(y!, m! - 1, d!))
  return asDate.getUTCFullYear() === y && asDate.getUTCMonth() === m! - 1 && asDate.getUTCDate() === d
}

/**
 * The same rules as server/src/schedule.ts: working days only, no date while a
 * fee is unpaid, and none once the request is closed.
 */
function readyFor(r: DemoRequest) {
  const service = SERVICES.find((s) => s.id === r.serviceId)
  if (!service) return { expectedReady: null, awaitingResident: false }
  if (r.status === 'completed' || r.status === 'rejected') {
    return { expectedReady: null, awaitingResident: false }
  }
  if (service.requiresPayment && !r.paid) {
    return { expectedReady: null, awaitingResident: true }
  }
  const start = new Date(r.paidAt ?? r.dateSubmitted)
  return {
    expectedReady: {
      from: addWorkingDays(start, service.processingDaysMin, HOLIDAY_DAYS),
      to: addWorkingDays(start, service.processingDaysMax, HOLIDAY_DAYS),
    },
    awaitingResident: false,
  }
}

const serialize = (r: DemoRequest) => ({
  id: r.id, referenceNo: r.referenceNo, serviceId: r.serviceId, serviceName: r.serviceName,
  categoryId: r.categoryId, status: r.status, currentStepIndex: r.currentStepIndex,
  fee: r.fee, paid: r.paid, paymentMethod: r.paymentMethod, formValues: r.formValues,
  rejectionReason: r.rejectionReason, dateSubmitted: r.dateSubmitted,
  updatedAt: r.dateSubmitted,
  residentName: state.users.find((u) => u.id === r.residentId)?.fullName,
  ...readyFor(r),
})

/** A minimal but valid PDF, so the download in the demo is a real file. */
function makePdf(lines: string[]): Blob {
  const escaped = lines.map((l) => l.replace(/([()\\])/g, '\\$1'))
  const text = escaped
    .map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${760 - i * 22} Td (${l}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

function documentFor(r: DemoRequest): Blob {
  const resident = state.users.find((u) => u.id === r.residentId)
  return makePdf([
    'MUNICIPALITY OF SAN FERNANDO',
    officeName(r.categoryId),
    '',
    r.serviceName.toUpperCase(),
    `Reference No. ${r.referenceNo}`,
    '',
    `Issued to: ${resident?.fullName ?? ''}`,
    `Released: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Fee: PHP ${r.fee.toFixed(2)}${r.paid ? ' (paid)' : ''}`,
    '',
    `VERIFICATION CODE: ${r.document?.verificationCode ?? ''}`,
    '',
    'Demo document — generated in your browser, not issued by an LGU.',
  ])
}

export interface DemoResponse {
  status: number
  body?: unknown
  blob?: Blob
  fileName?: string
}

/** Routes one API call. Mirrors the real server's status codes and messages. */
export function handleDemoRequest(
  method: string, path: string, token: string | null, body: any, file?: File, requirement?: string
): Promise<DemoResponse> {
  return new Promise((resolve) => {
    // A touch of latency so loading states are visible, as they would be for real.
    setTimeout(async () => {
      try {
        resolve(await route(method, path, token, body, file, requirement))
      } catch (err) {
        if (err instanceof DemoError) resolve({ status: err.status, body: { error: err.message } })
        else resolve({ status: 500, body: { error: 'Something went wrong in the demo.' } })
      }
    }, 180)
  })
}

async function route(
  method: string, path: string, token: string | null, body: any, file?: File, requirement?: string
): Promise<DemoResponse> {
  const [, ...parts] = path.split('?')[0]!.split('/')
  const me = userFor(token)
  const need = (...roles: string[]) => {
    if (!me) throw new DemoError(401, 'Sign in to continue.')
    if (!roles.includes(me.role)) throw new DemoError(403, 'You do not have access to this area.')
    return me
  }
  const query = new URLSearchParams(path.split('?')[1] ?? '')

  // ---- catalogue ----
  if (parts[0] === 'catalogue') {
    return {
      status: 200,
      body: {
        departments: SERVICE_CATEGORIES, services: SERVICES,
        programs: SECTORAL_PROGRAMS, workflowSteps: WORKFLOW_STEPS,
        holidays: HOLIDAYS.map((h) => ({ date: h.date, name: h.name, isLocal: h.local ?? false })),
      },
    }
  }

  // ---- auth ----
  if (parts[0] === 'auth') {
    if (parts[1] === 'register' && method === 'POST') {
      if (state.users.some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) {
        throw new DemoError(409, 'That email is already registered. Try signing in.')
      }
      if (String(body.password ?? '').length < 10) throw new DemoError(400, 'Use at least 10 characters.')
      const user: DemoUser = {
        id: uid(), email: body.email, password: body.password, fullName: body.fullName,
        role: 'resident', departments: [], position: null, active: true,
        notifyEmail: true, notifySms: false,
        profile: {
          philSysId: null, barangay: body.barangay ?? null,
          municipality: body.municipality ?? 'Municipality of San Fernando',
          province: body.province ?? 'Cebu', birthDate: null, address: body.address ?? null, phone: null,
        },
        programs: [],
      }
      state.users.push(user); persist()
      return { status: 201, body: { token: user.id, user: publicUser(user) } }
    }
    if (parts[1] === 'login' && method === 'POST') {
      const user = state.users.find(
        (u) => u.email.toLowerCase() === String(body.email).toLowerCase() && u.password === body.password && u.active
      )
      if (!user) throw new DemoError(401, 'Email or password is incorrect.')
      return { status: 200, body: { token: user.id, user: publicUser(user) } }
    }
    if (parts[1] === 'me') {
      const user = need('resident', 'staff', 'admin')
      return {
        status: 200,
        body: { user: publicUser(user), profile: { ...user.profile, programs: serializePrograms(user) } },
      }
    }
    if (parts[1] === 'forgot' && method === 'POST') {
      return { status: 202, body: { message: 'Password reset needs a mail server, so it is not part of this demo.' } }
    }
    if (parts[1] === 'reset' && method === 'POST') {
      throw new DemoError(400, 'Password reset is not part of this demo.')
    }
  }

  // ---- resident requests ----
  if (parts[0] === 'requests') {
    const user = need('resident')
    const mine = () => state.requests.filter((r) => r.residentId === user.id)

    if (!parts[1] && method === 'GET') {
      return { status: 200, body: mine().sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted)).map(serialize) }
    }
    if (!parts[1] && method === 'POST') {
      const service = SERVICES.find((s) => s.id === body.serviceId)
      if (!service) throw new DemoError(404, 'That service is no longer offered.')
      checkFormValues(service, body.formValues ?? {}, true)
      const created = makeRequest(state, user, service, body.formValues ?? {})
      state.requests.push(created)
      state.drafts = state.drafts.filter(
        (d) => !(d.residentId === user.id && (d.id === body.draftId || d.serviceId === service.id))
      )
      persist()
      return { status: 201, body: serialize(created) }
    }

    // ---- drafts ----
    // Matched before the id fallthrough, and held to the same field rules as a
    // submission, exactly as the real API does.
    if (parts[1] === 'drafts') {
      const mineDrafts = () =>
        state.drafts
          .filter((d) => d.residentId === user.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((d) => {
            const service = SERVICES.find((s) => s.id === d.serviceId)
            return {
              id: d.id, serviceId: d.serviceId, serviceName: service?.name ?? d.serviceId,
              categoryId: service?.categoryId, formValues: d.formValues,
              createdAt: d.createdAt, updatedAt: d.updatedAt,
            }
          })

      if (!parts[2] && method === 'GET') return { status: 200, body: mineDrafts() }

      if (parts[2] && method === 'PUT') {
        const service = SERVICES.find((s) => s.id === parts[2])
        if (!service) throw new DemoError(404, 'That service is no longer offered.')
        checkFormValues(service, body.formValues ?? {}, false)

        const now = new Date().toISOString()
        const existing = state.drafts.find((d) => d.residentId === user.id && d.serviceId === service.id)
        if (existing) {
          existing.formValues = body.formValues ?? {}
          existing.updatedAt = now
        } else {
          state.drafts.push({
            id: uid(), residentId: user.id, serviceId: service.id,
            formValues: body.formValues ?? {}, createdAt: now, updatedAt: now,
          })
        }
        persist()
        const saved = state.drafts.find((d) => d.residentId === user.id && d.serviceId === service.id)!
        return { status: 200, body: { ...saved } }
      }

      if (parts[2] && method === 'DELETE') {
        const at = state.drafts.findIndex((d) => d.id === parts[2] && d.residentId === user.id)
        if (at < 0) throw new DemoError(404, 'Draft not found.')
        state.drafts.splice(at, 1); persist()
        return { status: 204, body: null }
      }
    }

    const target = state.requests.find((r) => r.id === parts[1] && r.residentId === user.id)
    if (!target) throw new DemoError(404, 'Request not found.')

    if (!parts[2] && method === 'GET') return { status: 200, body: { ...serialize(target), events: target.events } }

    if (parts[2] === 'pay' && method === 'POST') {
      if (target.paid) throw new DemoError(409, 'This request is already paid.')
      if (target.currentStepIndex < 1) throw new DemoError(409, 'Wait for the treasury assessment before paying.')
      target.paid = true
      target.paymentMethod = body.method
      // The office's clock starts here, as on the real server.
      target.paidAt = new Date().toISOString()
      target.status = 'in_progress'
      target.currentStepIndex = WORKFLOW_STEPS.length - 1
      target.events.push({ eventType: 'paid', note: `Paid via ${body.method}`, createdAt: new Date().toISOString(), actorName: user.fullName })
      persist()
      return { status: 200, body: serialize(target) }
    }

    if (parts[2] === 'document') {
      if (!target.document) throw new DemoError(404, 'No document is available for this request.')
      return { status: 200, blob: documentFor(target), fileName: target.document.fileName }
    }

    if (parts[2] === 'attachments') {
      if (method === 'GET' && !parts[3]) return { status: 200, body: target.attachments.map(stripData) }
      if (method === 'POST') {
        if (target.status === 'completed' || target.status === 'rejected') {
          throw new DemoError(409, 'This request is closed and no longer accepts files.')
        }
        if (!file) throw new DemoError(400, 'Choose a file to attach.')
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
        const type = sniff(head)
        if (!type) throw new DemoError(415, "That file type isn't accepted. Attach a PDF, JPEG, PNG, or HEIC file.")
        const record = {
          id: uid(), requirement: requirement ?? null,
          fileName: `${(file.name.split(/[\\/]/).pop() ?? 'file').replace(/\.[^.]*$/, '')}.${type.ext}`,
          contentType: type.mime, byteSize: file.size, createdAt: new Date().toISOString(),
          data: await asDataUrl(file),
        }
        target.attachments.push(record)
        target.events.push({ eventType: 'attached', note: record.fileName, createdAt: record.createdAt, actorName: user.fullName })
        persist()
        return { status: 201, body: stripData(record) }
      }
      if (method === 'DELETE') {
        target.attachments = target.attachments.filter((a) => a.id !== parts[3])
        persist()
        return { status: 204 }
      }
      if (method === 'GET') {
        const found = target.attachments.find((a) => a.id === parts[3])
        if (!found) throw new DemoError(404, 'Attachment not found.')
        return { status: 200, blob: dataUrlToBlob(found.data, found.contentType), fileName: found.fileName }
      }
    }
  }

  // ---- staff ----
  if (parts[0] === 'staff') {
    const user = need('staff', 'admin')
    const inScope = (r: DemoRequest) => user.role === 'admin' || user.departments.includes(r.categoryId)

    if (parts[1] === 'queue') {
      const departmentId = query.get('departmentId') ?? undefined
      if (departmentId && user.role !== 'admin' && !user.departments.includes(departmentId)) {
        throw new DemoError(403, 'You are not assigned to that office.')
      }
      const status = query.get('status')
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const limit = Math.min(Number(query.get('limit') ?? 25) || 25, 100)
      const cursor = query.get('cursor')

      let rows = state.requests
        .filter(inScope)
        .filter((r) => !departmentId || r.categoryId === departmentId)
        .filter((r) => !status || r.status === status)
        .filter((r) => {
          if (!q) return true
          const who = state.users.find((u) => u.id === r.residentId)?.fullName ?? ''
          return r.referenceNo.toLowerCase().includes(q) || who.toLowerCase().includes(q) || r.serviceName.toLowerCase().includes(q)
        })
        .sort((a, b) => a.dateSubmitted.localeCompare(b.dateSubmitted) || a.id.localeCompare(b.id))

      const total = rows.length
      if (cursor) {
        const at = rows.findIndex((r) => r.id === atob(cursor))
        rows = at >= 0 ? rows.slice(at + 1) : rows
      }
      const page = rows.slice(0, limit)
      const hasMore = rows.length > limit
      return {
        status: 200,
        body: {
          items: page.map(serialize),
          nextCursor: hasMore && page.length ? btoa(page[page.length - 1]!.id) : null,
          total,
        },
      }
    }

    if (parts[1] === 'summary') return { status: 200, body: [] }

    if (parts[1] === 'requests') {
      const target = state.requests.find((r) => r.id === parts[2])
      if (!target || !inScope(target)) throw new DemoError(404, 'Request not found.')

      if (!parts[3] && method === 'GET') return { status: 200, body: { ...serialize(target), events: target.events } }

      if (parts[3] === 'attachments') {
        if (!parts[4]) return { status: 200, body: target.attachments.map(stripData) }
        const found = target.attachments.find((a) => a.id === parts[4])
        if (!found) throw new DemoError(404, 'Attachment not found.')
        return { status: 200, blob: dataUrlToBlob(found.data, found.contentType), fileName: found.fileName }
      }
      // ---- programme record ----
      // Readable by any office that can open the request; writable only by the
      // social welfare office, exactly as the real API rules it.
      if (parts[3] === 'programs') {
        const resident = state.users.find((u) => u.id === target.residentId)
        if (!resident) throw new DemoError(404, 'Resident not found.')

        if (method === 'GET' && !parts[4]) {
          return {
            status: 200,
            body: {
              residentName: resident.fullName,
              programs: serializePrograms(resident),
              mayEdit: mayAdministerPrograms(user),
            },
          }
        }

        if (!mayAdministerPrograms(user)) {
          throw new DemoError(403, 'Only the social welfare office can record programme membership.')
        }

        if (method === 'POST') {
          const def = SECTORAL_PROGRAMS.find((pr) => pr.code === body.code)
          if (!def) throw new DemoError(404, 'Unknown programme.')
          if (!def.expires && body.validUntil) {
            throw new DemoError(400, `${def.name} records do not expire.`)
          }
          const existing = resident.programs.find((pr) => pr.code === def.code)
          const record = {
            code: def.code,
            referenceNo: body.referenceNo || null,
            enrolledOn: existing?.enrolledOn ?? today(),
            validUntil: body.validUntil || null,
          }
          if (existing) Object.assign(existing, record)
          else resident.programs.push(record)
          notify(
            resident.id, null, 'program_granted', `${def.name} — you are now enrolled`,
            `${def.issuingOffice} has recorded you under ${def.name}. ` +
              'It now appears on your digital ID; show it when you transact with the LGU.'
          )
          persist()
          return { status: 200, body: { programs: serializePrograms(resident) } }
        }

        if (method === 'DELETE' && parts[4]) {
          const def = SECTORAL_PROGRAMS.find((pr) => pr.code === parts[4])
          if (!def) throw new DemoError(404, 'Unknown programme.')
          const at = resident.programs.findIndex((pr) => pr.code === parts[4])
          if (at < 0) throw new DemoError(404, 'That resident is not on this programme.')
          resident.programs.splice(at, 1)
          notify(
            resident.id, null, 'program_revoked', `${def.name} — record removed`,
            `${def.issuingOffice} has removed your ${def.name} record. ` +
              'It no longer appears on your digital ID. Contact the office if this is a mistake.'
          )
          persist()
          return { status: 200, body: { programs: serializePrograms(resident) } }
        }
      }

      if (parts[3] === 'document') {
        if (!target.document) throw new DemoError(404, 'No document has been released yet.')
        return { status: 200, blob: documentFor(target), fileName: target.document.fileName }
      }

      const closed = target.status === 'completed' || target.status === 'rejected'
      if (parts[3] === 'assess' && method === 'POST') {
        if (closed) throw new DemoError(409, 'This request is already closed.')
        target.fee = Number(body.fee)
        target.status = 'for_payment'
        target.currentStepIndex = 2
        target.events.push({ eventType: 'assessed', note: body.note ?? null, createdAt: new Date().toISOString(), actorName: user.fullName })
        notify(target.residentId, target.id, 'assessed', `${target.serviceName} — fee assessed`,
          `${officeName(target.categoryId)} has assessed your ${target.serviceName} (${target.referenceNo}). Amount due: PHP ${target.fee.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Pay in the app to continue.`)
        persist()
        return { status: 200, body: serialize(target) }
      }
      if (parts[3] === 'advance' && method === 'POST') {
        if (closed) throw new DemoError(409, 'This request is already closed.')
        if (target.currentStepIndex === 2 && !target.paid) {
          throw new DemoError(409, 'Waiting for the resident to pay the assessed fee.')
        }
        const last = WORKFLOW_STEPS.length - 1
        const next = Math.min(target.currentStepIndex + 1, last)
        const isFinal = next >= last
        target.currentStepIndex = next
        target.status = isFinal ? 'completed' : 'in_progress'
        target.events.push({ eventType: isFinal ? 'completed' : 'advanced', note: body?.note ?? null, createdAt: new Date().toISOString(), actorName: user.fullName })
        if (isFinal && !target.document) {
          const code = Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('')
          ).join('-')
          const slug = target.serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          target.document = { fileName: `${slug}-${target.referenceNo}.pdf`, verificationCode: code }
          target.events.push({ eventType: 'released', note: `Document released (code ${code})`, createdAt: new Date().toISOString(), actorName: user.fullName })
        }
        notify(target.residentId, target.id, isFinal ? 'released' : 'advanced',
          `${target.serviceName} — ${isFinal ? 'ready' : 'update'}`,
          isFinal
            ? `Your ${target.serviceName} (${target.referenceNo}) has been released by ${officeName(target.categoryId)}. You can download it from the app.`
            : `${officeName(target.categoryId)} has moved your ${target.serviceName} (${target.referenceNo}) to the next step.`)
        persist()
        return { status: 200, body: serialize(target) }
      }
      if (parts[3] === 'reject' && method === 'POST') {
        if (target.status === 'completed') throw new DemoError(409, 'This request is already completed.')
        if (!body.reason || String(body.reason).trim().length < 3) throw new DemoError(400, 'Tell the resident why.')
        target.status = 'rejected'
        target.rejectionReason = body.reason
        target.events.push({ eventType: 'rejected', note: body.reason, createdAt: new Date().toISOString(), actorName: user.fullName })
        notify(target.residentId, target.id, 'rejected', `${target.serviceName} — needs your attention`,
          `${officeName(target.categoryId)} could not process your ${target.serviceName} (${target.referenceNo}). Reason: ${body.reason}`)
        persist()
        return { status: 200, body: serialize(target) }
      }
    }
  }

  // ---- notifications ----
  if (parts[0] === 'notifications') {
    const user = need('resident')
    if (parts[1] === 'preferences') {
      if (method === 'PATCH') {
        if (body.phone !== undefined) {
          if (body.phone && !/^(\+63|0)9\d{9}$/.test(body.phone)) {
            throw new DemoError(400, 'Enter a mobile number like 09171234567.')
          }
          user.profile.phone = body.phone || null
        }
        if (body.notifyEmail !== undefined) user.notifyEmail = body.notifyEmail
        if (body.notifySms !== undefined) user.notifySms = body.notifySms
        persist()
      }
      return { status: 200, body: { notifyEmail: user.notifyEmail, notifySms: user.notifySms, phone: user.profile.phone } }
    }
    if (parts[1] === 'read-all' && method === 'POST') {
      state.notifications.forEach((n) => { if (n.userId === user.id) n.readAt ??= new Date().toISOString() })
      persist()
      return { status: 204 }
    }
    if (parts[1] && parts[2] === 'read' && method === 'POST') {
      const found = state.notifications.find((n) => n.id === parts[1] && n.userId === user.id)
      if (!found) throw new DemoError(404, 'Notification not found.')
      found.readAt ??= new Date().toISOString()
      persist()
      return { status: 204 }
    }
    const mine = state.notifications.filter((n) => n.userId === user.id)
    return { status: 200, body: { notifications: mine, unread: mine.filter((n) => !n.readAt).length } }
  }

  // ---- admin ----
  if (parts[0] === 'admin' && parts[1] === 'staff') {
    const user = need('admin')
    const listed = () => state.users.filter((u) => u.role !== 'resident').map(publicStaff)

    if (!parts[2] && method === 'GET') return { status: 200, body: listed() }
    if (!parts[2] && method === 'POST') {
      if (state.users.some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) {
        throw new DemoError(409, 'That email already has an account.')
      }
      if (!body.departments?.length) throw new DemoError(400, 'Assign at least one office, or the account sees nothing.')
      const created: DemoUser = {
        id: uid(), email: body.email, password: DEMO_PASSWORD, fullName: body.fullName,
        role: 'staff', departments: body.departments, position: body.position ?? null,
        active: true, notifyEmail: true, notifySms: false,
        profile: { philSysId: null, barangay: null, municipality: null, province: null, birthDate: null, address: null, phone: null },
        programs: [],
      }
      state.users.push(created); persist()
      return { status: 201, body: { ...publicStaff(created), invited: true } }
    }

    const target = state.users.find((u) => u.id === parts[2] && u.role !== 'resident')
    if (!target) throw new DemoError(404, 'Account not found.')
    if (method === 'PATCH') {
      if (body.departments) {
        if (target.role === 'staff' && body.departments.length === 0) {
          throw new DemoError(400, 'Assign at least one office, or the account sees nothing.')
        }
        target.departments = body.departments
      }
      if (body.fullName) target.fullName = body.fullName
      if (body.position !== undefined) target.position = body.position
      persist()
      return { status: 200, body: publicStaff(target) }
    }
    if (parts[3] === 'deactivate') {
      if (target.id === user.id) throw new DemoError(409, 'You cannot deactivate your own account.')
      target.active = false; persist(); return { status: 204 }
    }
    if (parts[3] === 'reactivate') { target.active = true; persist(); return { status: 204 } }
    if (parts[3] === 'send-reset') {
      return { status: 202, body: { message: `In the real system this emails ${target.email}. The demo has no mail server.` } }
    }
  }

  throw new DemoError(404, 'Not found.')
}

const publicUser = (u: DemoUser) => ({
  id: u.id, email: u.email, role: u.role, fullName: u.fullName, departments: u.departments,
})

const publicStaff = (u: DemoUser) => ({
  id: u.id, email: u.email, fullName: u.fullName, role: u.role, active: u.active,
  createdAt: new Date().toISOString(), departments: u.departments, position: u.position,
})

const stripData = (a: { data: string } & Record<string, unknown>) => {
  const { data: _data, ...rest } = a
  return rest
}

/** Same magic-number check the server does — the bytes decide, not the name. */
function sniff(head: Uint8Array): { mime: string; ext: string } | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  const at4 = (...bytes: number[]) => bytes.every((b, i) => head[4 + i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: 'pdf' }
  if (starts(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' }
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { mime: 'image/png', ext: 'png' }
  if (at4(0x66, 0x74, 0x79, 0x70)) return { mime: 'image/heic', ext: 'heic' }
  return null
}

function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl: string, type: string): Blob {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}
