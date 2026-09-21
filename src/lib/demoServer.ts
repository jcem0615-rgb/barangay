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
import {
  EMERGENCY_CONTACTS, HOLIDAYS, MUNICIPALITY, SECTORAL_PROGRAMS, SERVICES, SERVICE_CATEGORIES,
} from '../data/mockData'
import { addWorkingDays } from './schedule'
import { WORKFLOW_STEPS, type ServiceDefinition, type ServiceField } from '../types'

// Bumped whenever the seeded shape changes: a store written by an older build
// would be missing fields this one reads, so it is discarded rather than
// patched. Losing a demo's clicked-through state is the cheaper failure.
const STORE_KEY = 'elgu-demo-state-v12'

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
  /** The register this account belongs to; null on the seeded demo accounts. */
  municipalityCode?: string | null
  /**
   * Name, date of birth and mother's maiden name, folded together. The real
   * server stores a SHA-256 of those; the demo keeps the folded form, which is
   * one more reason the demo is not a place to type anything true about
   * yourself.
   */
  identityKey?: string | null
  profile: {
    philSysId: string | null; barangay: string | null; municipality: string | null
    province: string | null; birthDate: string | null; address: string | null; phone: string | null
  }
  /** The ID portrait, as a data URL. Null until the resident sets one. */
  photo: string | null
  photoUpdatedAt: string | null
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

interface DemoVerification {
  code: string
  userId: string
  expiresAt: number
  consumedAt: number | null
  verifiedBy: string | null
}

interface DemoState {
  users: DemoUser[]
  requests: DemoRequest[]
  drafts: DemoDraft[]
  verifications: DemoVerification[]
  notifications: DemoNotification[]
  counters: Record<string, number>
  /**
   * The municipal facts an administrator can edit. Held in state rather than
   * read from the imported constants, because the whole point of the admin
   * screen is that they change — a demo whose catalogue is hard-wired to the
   * seed would show the edit saving and then not showing up anywhere.
   */
  hotlines: DemoHotline[]
  holidays: DemoHoliday[]
  offices: Record<string, DemoOfficeContact>
  audit: DemoAudit[]
  appointments: DemoAppointment[]
  /** Queue numbers issued per office per day, so a cancellation frees no number. */
  queueCounters: Record<string, number>
  feedback: DemoFeedback[]
  complaints: DemoComplaint[]
  complaintCounter: number
}

interface DemoFeedback {
  requestId: string; residentId: string; rating: number
  comment: string | null; createdAt: string
}

interface DemoComplaint {
  id: string; referenceNo: string; residentId: string; departmentId: string
  requestId: string | null; category: string; body: string
  status: 'open' | 'answered'; dueOn: string
  response: string | null; respondedAt: string | null; createdAt: string
}

interface DemoAppointment {
  id: string; residentId: string; departmentId: string; serviceId: string
  requestId: string | null; scheduledOn: string; startTime: string
  queueNo: string; status: 'booked' | 'arrived' | 'served' | 'no_show' | 'cancelled'
  note: string | null; createdAt: string
}

interface DemoHotline {
  id: string; label: string; agency: string; phone: string
  isNational: boolean; sortOrder: number
}

interface DemoHoliday { date: string; name: string; isLocal: boolean }

interface DemoOfficeContact {
  address: string | null; hours: string | null; phone: string | null; email: string | null
}

interface DemoAudit {
  id: number; actorName: string; action: string; target: string
  before: unknown; after: unknown; createdAt: string
}

const uid = () => crypto.randomUUID()

/**
 * The same three facts the server hashes — name, date of birth, mother's maiden
 * name — folded the same way, so a duplicate the real server would refuse is
 * refused here too. Single-letter tokens go, because a middle initial is on half
 * the forms in any office and missing from the other half.
 */
function demoIdentityKey(fullName: string, birthDate: string, motherMaidenName: string): string {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1)
      .join(' ')
  return [fold(fullName), birthDate.trim(), fold(motherMaidenName)].join('\u0000')
}

const STAFF_SEED: Array<{ email: string; name: string; dept: string; position: string }> = [
  { email: 'treasury@malasiqui.gov.ph', name: 'Ana R. Lim', dept: 'treasury', position: 'Revenue Officer II' },
  { email: 'bpls@malasiqui.gov.ph', name: 'Rico M. Dela Cruz', dept: 'bpls', position: 'Licensing Officer' },
  { email: 'obo@malasiqui.gov.ph', name: 'Eng. Jose P. Vega', dept: 'obo', position: 'Building Inspector' },
  { email: 'lcr@malasiqui.gov.ph', name: 'Carmen S. Reyes', dept: 'lcr', position: 'Registration Officer' },
  { email: 'cswdo@malasiqui.gov.ph', name: 'Grace T. Bautista', dept: 'cswdo', position: 'Social Welfare Officer' },
  { email: 'health@malasiqui.gov.ph', name: 'Dr. Elena V. Cruz', dept: 'health', position: 'Sanitation Inspector' },
]

const DEMO_PASSWORD = 'elgu-demo-2026'

function seed(): DemoState {
  const users: DemoUser[] = [
    {
      id: uid(), email: 'admin@malasiqui.gov.ph', password: DEMO_PASSWORD,
      fullName: 'Office of the Mayor — Administrator', role: 'admin', departments: [],
      position: null, active: true, notifyEmail: true, notifySms: false,
      profile: { philSysId: null, barangay: null, municipality: null, province: null, birthDate: null, address: null, phone: null },
      photo: null, photoUpdatedAt: null,
      programs: [],
    },
    ...STAFF_SEED.map((s) => ({
      id: uid(), email: s.email, password: DEMO_PASSWORD, fullName: s.name,
      role: 'staff' as const, departments: [s.dept], position: s.position, active: true,
      notifyEmail: true, notifySms: false,
      profile: { philSysId: null, barangay: null, municipality: null, province: null, birthDate: null, address: null, phone: null },
      photo: null, photoUpdatedAt: null,
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
      municipality: 'Municipality of Malasiqui', province: 'Pangasinan',
      birthDate: '1994-03-18', address: 'Blk 4 Lot 12, Purok 3', phone: null,
    },
    photo: null,
    photoUpdatedAt: null,
    // Seeded so the demo ID card shows a real record rather than an empty one.
    programs: [
      { code: '4ps', referenceNo: 'HH-2019-88214', enrolledOn: '2024-06-11', validUntil: null },
      { code: 'solo_parent', referenceNo: 'SP-2026-0417', enrolledOn: '2026-01-20', validUntil: '2027-01-20' },
      { code: 'farmer', referenceNo: 'RSBSA-07-114522', enrolledOn: '2023-08-02', validUntil: null },
    ],
  }
  users.push(resident)

  const state: DemoState = {
    users, requests: [], drafts: [], verifications: [], notifications: [], counters: {},
    // Copied out of the catalogue rather than referenced, so editing them in
    // the console changes this browser's copy and not the authoring source.
    hotlines: EMERGENCY_CONTACTS.map((c, i) => ({
      id: c.id, label: c.label, agency: c.agency, phone: c.phone,
      isNational: c.isNational ?? false, sortOrder: i,
    })),
    holidays: HOLIDAYS.map((h) => ({ date: h.date, name: h.name, isLocal: h.local ?? false })),
    offices: Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c.id, {
      address: c.address ?? null, hours: c.hours ?? null, phone: c.phone ?? null, email: c.email ?? null,
    }])),
    audit: [],
    appointments: [],
    queueCounters: {},
    feedback: [],
    complaints: [],
    complaintCounter: 0,
  }

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

  seedHistory(state, resident, now)

  return state
}

/**
 * Closed requests across every office, so the Reports tab has something to
 * report on.
 *
 * They belong to residents who are not sign-in accounts: the demo resident's
 * own list stays the three requests above, which is what makes her screens
 * readable, while the offices still have a year of work behind them.
 *
 * The turnarounds are deliberately uneven — a couple of them miss the
 * catalogue's promised processing time — because a report where every office
 * is perfect demonstrates nothing.
 */
function seedHistory(state: DemoState, resident: DemoUser, now: number) {
  const DAY = 86_400_000
  // serviceId, weeks ago, days the resident took to pay, days the office then took
  const history: [string, number, number, number][] = [
    ['cedula', 2, 0, 0], ['cedula', 3, 0, 1], ['cedula', 5, 1, 0], ['cedula', 8, 0, 0],
    ['cedula', 11, 0, 1], ['cedula', 14, 2, 0], ['cedula', 19, 0, 0], ['cedula', 26, 0, 1],
    ['boss-application', 4, 3, 6], ['boss-application', 9, 1, 4], ['boss-application', 17, 8, 12],
    ['birth-certificate', 6, 0, 2], ['birth-certificate', 13, 1, 3], ['birth-certificate', 22, 0, 2],
    ['building-permit', 7, 4, 11], ['building-permit', 20, 2, 21],
    ['health-certificate', 5, 0, 2], ['health-certificate', 12, 1, 1], ['health-certificate', 24, 0, 3],
    ['solo-parent-id', 10, 0, 5], ['solo-parent-id', 21, 0, 9],
    ['aics-application', 15, 0, 4], ['senior-pwd-id', 18, 0, 3],
  ]

  for (const [serviceId, weeks, payDays, officeDays] of history) {
    const service = SERVICES.find((s) => s.id === serviceId)
    if (!service) continue
    const submitted = now - DAY * 7 * weeks
    const paid = submitted + DAY * payDays
    const released = paid + DAY * officeDays
    const r = makeRequest(state, resident, service, sampleValues(service), submitted)
    r.residentId = `demo-history-${r.id}`
    r.status = 'completed'
    r.currentStepIndex = WORKFLOW_STEPS.length - 1
    r.paid = true
    r.paymentMethod = 'Over the counter'
    r.paidAt = new Date(paid).toISOString()
    r.events.push(
      { eventType: 'assessed', note: null, createdAt: new Date(submitted).toISOString(), actorName: 'Counter staff' },
      { eventType: 'paid', note: null, createdAt: new Date(paid).toISOString(), actorName: 'Resident' },
      { eventType: 'released', note: null, createdAt: new Date(released).toISOString(), actorName: 'Counter staff' },
    )
    state.requests.push(r)
  }

  // One refusal, so "rejected" is not permanently zero.
  const bossService = SERVICES.find((s) => s.id === 'boss-application')!
  const refused = makeRequest(state, resident, bossService, sampleValues(bossService), now - DAY * 40)
  refused.residentId = `demo-history-${refused.id}`
  refused.status = 'rejected'
  refused.rejectionReason = 'Barangay clearance had expired.'
  refused.events.push({
    eventType: 'rejected', note: 'Barangay clearance had expired.',
    createdAt: new Date(now - DAY * 38).toISOString(), actorName: 'Rico M. Dela Cruz',
  })
  state.requests.push(refused)
}

/**
 * A filled-in form for a seeded request, taken from the service's own field
 * list so a clerk opening one in the demo queue sees the shape of the real
 * thing rather than an empty panel.
 */
/** Mirrors `toCsv` in server/src/reports.ts — same columns, same quoting. */
function reportCsv(report: { rows: any[] }): string {
  const header = [
    'Office', 'Service', 'Submitted', 'Completed', 'Rejected', 'In progress',
    'Awaiting payment', 'Median office days', 'Median resident days',
    'Slowest 10% (office days)', 'Met target', 'Missed target',
  ]
  // Quote everything: an office name with a comma in it must not shift columns.
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [
    header.map(escape).join(','),
    ...report.rows.map((r) =>
      [
        r.departmentName, r.serviceName, r.submitted, r.completed, r.rejected,
        r.inProgress, r.awaitingPayment,
        r.medianOfficeDays ?? '', r.medianResidentDays ?? '', r.p90OfficeDays ?? '',
        r.metTarget, r.missedTarget,
      ].map(escape).join(',')
    ),
  ].join('\r\n')
}

function sampleValues(service: { fields: ServiceField[] }): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of service.fields) {
    values[field.id] =
      field.type === 'select' ? (field.options?.[0] ?? '')
      : field.type === 'number' ? '1'
      : field.type === 'date' ? '2026-01-15'
      : `Sample ${field.label.toLowerCase()}`
  }
  return values
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

/**
 * Mirrors `looksDialable` and `isRealDate` in server/src/municipality.ts.
 * Deliberately loose about phone shape: Philippine numbers are written every
 * which way, and a validator strict enough to have an opinion would reject one
 * that rings perfectly well.
 */
const dialable = (phone: string) => {
  const t = phone.trim()
  return t.length > 0 && t.length <= 40 && /^[0-9+().\-\s#*]+$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 3
}

function isRealDay(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
}

/** Validates a hotline the same way the server's zod schema does. */
function readHotline(body: Record<string, unknown>, fallbackSort = 0) {
  const label = String(body.label ?? '').trim()
  const agency = String(body.agency ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!label || label.length > 60) throw new DemoError(400, 'Say what a resident is looking for.')
  if (!agency || agency.length > 120) throw new DemoError(400, 'Say who answers it.')
  if (!dialable(phone)) throw new DemoError(400, 'That does not look like a number a resident could dial.')
  const sortOrder = Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : fallbackSort
  return { label, agency, phone, isNational: Boolean(body.isNational), sortOrder }
}

/**
 * Booking a slot at the counter — the same rules as server/src/appointments.ts.
 *
 * The office's own calendar decides everything: weekends and the holidays table
 * close a day, the office's hours and slot length decide the times, and its
 * capacity decides how many people a slot holds.
 */
/**
 * The working-day deadline an office is given to answer a complaint, mirroring
 * COMPLAINT_RESPONSE_DAYS in server/src/feedback.ts. A placeholder: set it to
 * the response time in the deploying LGU's own Citizen's Charter.
 */
const COMPLAINT_RESPONSE_DAYS = 3

const BOOKING_DEFAULTS = { enabled: true, opens: '08:00', closes: '16:00', slotMinutes: 30, capacity: 4, horizonDays: 21 }

const officeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())

const officeMinutesNow = () => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).split(':').map(Number)
  return h! * 60 + m!
}

const hhmmToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m! }
const minutesToHhmm = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

const plusDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Why a day cannot be booked, in the words the resident is shown. */
function closedReasonFor(date: string, holidays: Set<string>): string | null {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (day === 0 || day === 6) return 'The hall is closed at weekends.'
  if (holidays.has(date)) return 'The hall is closed that day.'
  return null
}

function demoSlots(date: string, departmentId: string, holidays: Set<string>) {
  const rules = BOOKING_DEFAULTS
  const closed = closedReasonFor(date, holidays)
  const today = officeToday()
  const now = officeMinutesNow()
  const slots: Array<{ startTime: string; booked: number; capacity: number; available: boolean }> = []
  for (let m = hhmmToMinutes(rules.opens); m + rules.slotMinutes <= hhmmToMinutes(rules.closes); m += rules.slotMinutes) {
    const startTime = minutesToHhmm(m)
    const booked = state.appointments.filter(
      (a) => a.departmentId === departmentId && a.scheduledOn === date &&
             a.startTime === startTime && a.status !== 'cancelled'
    ).length
    const past = date < today || (date === today && m <= now)
    slots.push({ startTime, booked, capacity: rules.capacity, available: !closed && !past && booked < rules.capacity })
  }
  return { slots, closedReason: closed }
}

/** Mirrors `checkBookableDate`: whether the day can be booked at all. */
function bookableDateProblem(date: string): string | null {
  const rules = BOOKING_DEFAULTS
  const today = officeToday()
  if (date < today) return 'That day has already passed.'
  if (date > plusDays(today, rules.horizonDays)) {
    return `This office takes bookings up to ${rules.horizonDays} days ahead.`
  }
  return null
}

/** Mirrors `checkBookableTime`, asked only once the day is known to be open. */
function bookableTimeProblem(date: string, startTime: string): string | null {
  const rules = BOOKING_DEFAULTS
  const m = hhmmToMinutes(startTime)
  if (m < hhmmToMinutes(rules.opens) || m + rules.slotMinutes > hhmmToMinutes(rules.closes)) {
    return 'The office is not open at that time.'
  }
  if ((m - hhmmToMinutes(rules.opens)) % rules.slotMinutes !== 0) {
    return 'That is not one of the office\u2019s appointment times.'
  }
  if (date === officeToday() && m <= officeMinutesNow()) return 'That time has already passed today.'
  return null
}

/** Read from state, so declaring a day in the console really does move a date. */
const holidayDays = (state: DemoState) => new Set(state.holidays.map((h) => h.date))

/** The same shape and rules as server/src/idVerification.ts. */
const VERIFY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const VERIFY_TTL_SECONDS = 90

function makeVerifyCode(): string {
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += VERIFY_ALPHABET[Math.floor(Math.random() * VERIFY_ALPHABET.length)]
    if (i % 4 === 3 && i !== 11) code += '-'
  }
  return code
}

/** Working days between two dates, mirroring server/src/schedule.ts. */
function countWorkingDays(start: Date, end: Date, holidays: Set<string>): number | null {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  if (to < from) return null
  let days = 0
  const cursor = new Date(from)
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1)
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6 && !holidays.has(iso)) days += 1
  }
  return days
}

const medianOf = (v: number[]) => {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!
}

const p90Of = (v: number[]) => {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]!
}

const normaliseCode = (raw: string) => String(raw ?? '').toUpperCase().replace(/-/g, '')

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
function readyFor(r: DemoRequest, holidays: Set<string>) {
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
      from: addWorkingDays(start, service.processingDaysMin, holidays),
      to: addWorkingDays(start, service.processingDaysMax, holidays),
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
  ...readyFor(r, holidayDays(state)),
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
    'MUNICIPALITY OF MALASIQUI',
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
        municipality: MUNICIPALITY,
        // Offices merge their editable contact details over the seeded
        // catalogue, so an address corrected in the console shows up here.
        departments: SERVICE_CATEGORIES.map((c) => ({ ...c, ...(state.offices[c.id] ?? {}) })),
        services: SERVICES,
        programs: SECTORAL_PROGRAMS, workflowSteps: WORKFLOW_STEPS,
        emergencyContacts: [...state.hotlines].sort(
          (a, b) => Number(a.isNational) - Number(b.isNational) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
        ),
        holidays: [...state.holidays].sort((a, b) => a.date.localeCompare(b.date)),
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
      if (!body.birthDate) throw new DemoError(400, 'Enter your date of birth.')
      if (!String(body.motherMaidenName ?? '').trim()) {
        throw new DemoError(400, "Enter your mother's maiden name.")
      }
      if (body.residesHere !== true) {
        throw new DemoError(400, 'This portal is only for residents of this municipality.')
      }
      // One person, one account — the same rule the server enforces, on the same
      // three facts, so the demo does not teach a registration the real system
      // would refuse.
      const identity = demoIdentityKey(
        String(body.fullName), String(body.birthDate), String(body.motherMaidenName)
      )
      if (state.users.some((u) => u.identityKey === identity)) {
        throw new DemoError(
          409,
          'An account already exists for these details. If it is yours, sign in or reset your ' +
            'password. If it is not, the Local Civil Registrar can sort it out.'
        )
      }
      const user: DemoUser = {
        id: uid(), email: body.email, password: body.password, fullName: body.fullName,
        role: 'resident', departments: [], position: null, active: true,
        notifyEmail: true, notifySms: false,
        // Stamped from the deployment's own record, never from the request.
        municipalityCode: MUNICIPALITY.code,
        identityKey: identity,
        profile: {
          philSysId: null, barangay: body.barangay ?? null,
          municipality: MUNICIPALITY.name,
          province: MUNICIPALITY.province, birthDate: body.birthDate, address: body.address ?? null, phone: null,
        },
        photo: null, photoUpdatedAt: null,
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
      // An account belongs to the register that issued it. Null predates the
      // rule, exactly as on the server.
      if (user.municipalityCode != null && user.municipalityCode !== MUNICIPALITY.code) {
        throw new DemoError(
          403,
          `This account is registered with another municipality. Sign in at that municipality's ` +
            `portal, or register here if you have moved to ${MUNICIPALITY.name}.`
        )
      }
      return { status: 200, body: { token: user.id, user: publicUser(user) } }
    }
    if (parts[1] === 'me' && !parts[2]) {
      const user = need('resident', 'staff', 'admin')
      return {
        status: 200,
        body: {
          user: publicUser(user),
          profile: {
            ...user.profile,
            programs: serializePrograms(user),
            hasPhoto: Boolean(user.photo),
            photoUpdatedAt: user.photoUpdatedAt,
          },
        },
      }
    }
    // ---- ID verification code ----
    if (parts[1] === 'me' && parts[2] === 'verification' && method === 'POST') {
      const user = need('resident')
      // Issuing retires anything still outstanding, as the server does.
      for (const v of state.verifications) {
        if (v.userId === user.id && !v.consumedAt && v.expiresAt > Date.now()) v.consumedAt = Date.now()
      }
      const code = makeVerifyCode()
      const expiresAt = Date.now() + VERIFY_TTL_SECONDS * 1000
      state.verifications.push({ code: normaliseCode(code), userId: user.id, expiresAt, consumedAt: null, verifiedBy: null })
      persist()
      return {
        status: 200,
        body: { code, expiresAt: new Date(expiresAt).toISOString(), ttlSeconds: VERIFY_TTL_SECONDS },
      }
    }

    // ---- ID portrait ----
    // Residents only, images only, and always the caller's own.
    if (parts[1] === 'me' && parts[2] === 'photo') {
      const user = need('resident')

      if (method === 'GET') {
        if (!user.photo) throw new DemoError(404, 'No photo on file.')
        const [, mime] = /^data:([^;]+);/.exec(user.photo) ?? []
        return { status: 200, blob: dataUrlToBlob(user.photo, mime ?? 'image/jpeg') }
      }

      if (method === 'PUT') {
        if (!file) throw new DemoError(400, 'Choose a photo to upload.')
        if (file.size > 4 * 1024 * 1024) {
          throw new DemoError(413, 'That file is too large. The limit is 4 MB.')
        }
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
        const type = sniff(head)
        // PDF sniffs fine but is not a picture, and the ID renders this inline.
        if (!type || !type.mime.startsWith('image/')) {
          throw new DemoError(415, "That file isn't a photo. Use a JPEG, PNG, or HEIC image.")
        }
        user.photo = await asDataUrl(file)
        user.photoUpdatedAt = new Date().toISOString()
        persist()
        return { status: 200, body: { hasPhoto: true, photoUpdatedAt: user.photoUpdatedAt } }
      }

      if (method === 'DELETE') {
        if (!user.photo) throw new DemoError(404, 'No photo on file.')
        user.photo = null
        user.photoUpdatedAt = null
        persist()
        return { status: 204, body: null }
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
        // The same caps as server/src/uploads.ts, so the demo cannot accept
        // what the real API would turn away.
        if (file.size > 10 * 1024 * 1024) {
          throw new DemoError(413, 'That file is too large. The limit is 10 MB.')
        }
        if (target.attachments.length >= 10) {
          throw new DemoError(409, 'You can attach up to 10 files to a request.')
        }
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

    if (parts[1] === 'verify-id') {
      if (method === 'POST') {
        const entered = normaliseCode(body?.code)
        if (entered.length < 4 || entered.length > 40) {
          throw new DemoError(400, "Enter the code shown on the resident's ID.")
        }
        const found = state.verifications.find((v) => v.code === entered)
        if (!found) {
          throw new DemoError(404, 'That code is not valid. Ask the resident to read it again from their ID.')
        }
        if (found.consumedAt) {
          throw new DemoError(409, 'That code has already been checked. Ask the resident for a fresh one.')
        }
        if (found.expiresAt <= Date.now()) {
          throw new DemoError(409, 'That code has expired. Ask the resident to show the current one.')
        }
        found.consumedAt = Date.now()
        found.verifiedBy = user.id
        persist()

        const resident = state.users.find((u) => u.id === found.userId)
        if (!resident) throw new DemoError(404, 'That account is no longer active.')
        return {
          status: 200,
          body: {
            outcome: 'valid',
            residentId: resident.id,
            fullName: resident.fullName,
            barangay: resident.profile.barangay,
            municipality: resident.profile.municipality,
            province: resident.profile.province,
            philSysLast4: resident.profile.philSysId
              ? resident.profile.philSysId.replace(/\D/g, '').slice(-4)
              : null,
            hasPhoto: Boolean(resident.photo),
            programs: serializePrograms(resident),
            checkedAt: new Date().toISOString(),
          },
        }
      }

      // The face, only for a check this staff member just performed.
      if (method === 'GET' && parts[2] && parts[3] === 'photo') {
        const recent = state.verifications.find(
          (v) => v.userId === parts[2] && v.verifiedBy === user.id
            && v.consumedAt !== null && Date.now() - v.consumedAt < 5 * 60 * 1000
        )
        if (!recent) throw new DemoError(404, 'No recent verification for that resident.')
        const resident = state.users.find((u) => u.id === parts[2])
        if (!resident?.photo) throw new DemoError(404, 'No photo on file.')
        const [, mime] = /^data:([^;]+);/.exec(resident.photo) ?? []
        return { status: 200, blob: dataUrlToBlob(resident.photo, mime ?? 'image/jpeg') }
      }
    }

    // ---- reports ----
    // Same two clocks and the same scoping as server/src/reports.ts, on a
    // working-day count rather than calendar days.
    if (parts[1] === 'reports') {
      const from = query.get('from') ?? ''
      const to = query.get('to') ?? ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        throw new DemoError(400, 'Give a from and to date, as YYYY-MM-DD.')
      }
      if (from > to) throw new DemoError(400, 'The start date is after the end date.')
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) {
        throw new DemoError(400, 'Reports cover at most one year at a time.')
      }

      const wanted = query.get('departmentId') ?? ''
      if (wanted && user.role !== 'admin' && !user.departments.includes(wanted)) {
        throw new DemoError(403, 'You are not assigned to that office.')
      }
      const scope = wanted ? [wanted] : user.departments
      const seeAll = user.role === 'admin' && !wanted

      const within = state.requests.filter((r) => {
        const day = r.dateSubmitted.slice(0, 10)
        return day >= from && day <= to && (seeAll || scope.includes(r.categoryId))
      })

      const holidays = holidayDays(state)
      const releasedAt = (r: DemoRequest) =>
        r.events.filter((e) => e.eventType === 'released').map((e) => e.createdAt).sort().pop() ?? null

      const byService = new Map<string, any>()
      for (const r of within) {
        const service = SERVICES.find((s) => s.id === r.serviceId)
        const key = `${r.categoryId}:${r.serviceId}`
        let row = byService.get(key)
        if (!row) {
          row = {
            departmentId: r.categoryId,
            departmentName: SERVICE_CATEGORIES.find((c) => c.id === r.categoryId)?.name ?? r.categoryId,
            serviceId: r.serviceId, serviceName: r.serviceName,
            submitted: 0, completed: 0, rejected: 0, inProgress: 0, awaitingPayment: 0,
            medianOfficeDays: null, medianResidentDays: null, p90OfficeDays: null,
            metTarget: 0, missedTarget: 0,
            _office: [] as number[], _resident: [] as number[],
          }
          byService.set(key, row)
        }
        row.submitted += 1
        if (r.status === 'completed') row.completed += 1
        else if (r.status === 'rejected') row.rejected += 1
        else if (r.status === 'for_payment') row.awaitingPayment += 1
        else row.inProgress += 1

        const done = releasedAt(r)
        if (r.status !== 'completed' || !done) continue
        const officeDays = countWorkingDays(new Date(r.paidAt ?? r.dateSubmitted), new Date(done), holidays)
        const residentDays = countWorkingDays(new Date(r.dateSubmitted), new Date(done), holidays)
        if (officeDays !== null) {
          row._office.push(officeDays)
          if (officeDays <= (service?.processingDaysMax ?? 0)) row.metTarget += 1
          else row.missedTarget += 1
        }
        if (residentDays !== null) row._resident.push(residentDays)
      }

      const allOffice: number[] = []
      const allResident: number[] = []
      const rows = [...byService.values()].map((row) => {
        row.medianOfficeDays = medianOf(row._office)
        row.medianResidentDays = medianOf(row._resident)
        row.p90OfficeDays = p90Of(row._office)
        allOffice.push(...row._office)
        allResident.push(...row._resident)
        const { _office, _resident, ...rest } = row
        return rest
      }).sort((a, b) => b.submitted - a.submitted)

      const sum = (k: string) => rows.reduce((n, r) => n + (r as any)[k], 0)
      const met = sum('metTarget')
      const missed = sum('missedTarget')
      const summary = {
        from, to,
        submitted: sum('submitted'), completed: sum('completed'), rejected: sum('rejected'),
        stillOpen: sum('submitted') - sum('completed') - sum('rejected'),
        medianOfficeDays: medianOf(allOffice), medianResidentDays: medianOf(allResident),
        metTarget: met, missedTarget: missed,
        onTimeRate: met + missed === 0 ? null : Math.round((met / (met + missed)) * 100),
        // The RA 11032 figures, over the same period and the same offices.
        ...(() => {
          const inScope = (departmentId: string) => seeAll || scope.includes(departmentId)
          const rated = state.feedback.filter((f) => {
            const r = state.requests.find((x) => x.id === f.requestId)
            const day = f.createdAt.slice(0, 10)
            return !!r && inScope(r.categoryId) && day >= from && day <= to
          })
          const filed = state.complaints.filter((c) => {
            const day = c.createdAt.slice(0, 10)
            return inScope(c.departmentId) && day >= from && day <= to
          })
          const today = officeToday()
          return {
            ratings: rated.length,
            // An average of no ratings is not a five, and rendering one would
            // be worse than a blank.
            averageRating: rated.length === 0
              ? null
              : Math.round((rated.reduce((n, f) => n + f.rating, 0) / rated.length) * 100) / 100,
            complaintsFiled: filed.length,
            complaintsAnswered: filed.filter((c) => c.status === 'answered').length,
            complaintsOverdue: filed.filter((c) => c.status === 'open' && c.dueOn < today).length,
          }
        })(),
        rows,
      }

      // The same columns and the same quoting as server/src/reports.ts, so a
      // spreadsheet opened from the demo has the shape of the real export.
      if (query.get('format') === 'csv') {
        return {
          status: 200,
          blob: new Blob([reportCsv(summary)], { type: 'text/csv;charset=utf-8' }),
          fileName: `elgu-report-${from}-to-${to}.csv`,
        }
      }

      return { status: 200, body: summary }
    }

    // ---- complaints, the office's side ----
    if (parts[1] === 'complaints') {
      const today = officeToday()
      if (!parts[2] && method === 'GET') {
        const wanted = query.get('departmentId') ?? ''
        if (wanted && user.role !== 'admin' && !user.departments.includes(wanted)) {
          throw new DemoError(403, 'You are not assigned to that office.')
        }
        const seeAll = user.role === 'admin' && !wanted
        const scope = wanted ? [wanted] : user.departments
        const status = query.get('status')
        return {
          status: 200,
          body: state.complaints
            .filter((c) => (seeAll || scope.includes(c.departmentId)) && (!status || c.status === status))
            // Oldest open first: the one waiting longest is the one to answer.
            .sort((a, b) =>
              Number(a.status === 'answered') - Number(b.status === 'answered') ||
              a.createdAt.localeCompare(b.createdAt))
            .map((c) => ({
              ...c,
              officeName: officeName(c.departmentId),
              residentName: state.users.find((u) => u.id === c.residentId)?.fullName ?? 'Resident',
              requestRef: state.requests.find((r) => r.id === c.requestId)?.referenceNo ?? null,
              overdue: c.status === 'open' && c.dueOn < today,
            })),
        }
      }
      if (parts[2] && parts[3] === 'respond' && method === 'POST') {
        const found = state.complaints.find((c) => c.id === parts[2])
        if (!found || (user.role !== 'admin' && !user.departments.includes(found.departmentId))) {
          throw new DemoError(404, 'Complaint not found.')
        }
        if (found.status === 'answered') throw new DemoError(409, 'That complaint has already been answered.')
        const response = String(body.response ?? '').trim()
        if (!response || response.length > 4000) throw new DemoError(400, 'Write a reply before sending it.')
        found.status = 'answered'
        found.response = response
        found.respondedAt = new Date().toISOString()
        notify(found.residentId, found.requestId, 'complaint_answered',
          `Complaint ${found.referenceNo} — answered`,
          `${officeName(found.departmentId)} has replied to your complaint (${found.referenceNo}). Read it in the app.`)
        persist()
        return { status: 200, body: found }
      }
      throw new DemoError(404, 'Not found.')
    }

    // ---- the counter's day ----
    if (parts[1] === 'appointments') {
      const date = query.get('date') ?? officeToday()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DemoError(400, 'Give a date as YYYY-MM-DD.')

      if (!parts[2] && method === 'GET') {
        const wanted = query.get('departmentId') ?? ''
        if (wanted && user.role !== 'admin' && !user.departments.includes(wanted)) {
          throw new DemoError(403, 'You are not assigned to that office.')
        }
        const seeAll = user.role === 'admin' && !wanted
        const scope = wanted ? [wanted] : user.departments
        const appointments = state.appointments
          .filter((a) => a.scheduledOn === date && (seeAll || scope.includes(a.departmentId)))
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.queueNo.localeCompare(b.queueNo))
          .map((a) => ({
            ...a,
            serviceName: SERVICES.find((s) => s.id === a.serviceId)?.name ?? a.serviceId,
            officeName: officeName(a.departmentId),
            residentName: state.users.find((u) => u.id === a.residentId)?.fullName ?? 'Resident',
            referenceNo: state.requests.find((r) => r.id === a.requestId)?.referenceNo ?? null,
          }))
        return { status: 200, body: { date, appointments } }
      }

      if (parts[2] && parts[3] && method === 'POST') {
        const next = ({ arrived: 'arrived', served: 'served', 'no-show': 'no_show' } as const)[parts[3] as 'arrived']
        if (!next) throw new DemoError(404, 'Not found.')
        const found = state.appointments.find((a) => a.id === parts[2])
        // Not found rather than forbidden: another office's day is not this
        // clerk's to learn the shape of.
        if (!found || (user.role !== 'admin' && !user.departments.includes(found.departmentId))) {
          throw new DemoError(404, 'Appointment not found.')
        }
        if (found.status === 'cancelled') throw new DemoError(409, 'That appointment was cancelled.')
        if (found.status === 'served' || found.status === 'no_show') {
          throw new DemoError(409, `That visit is already closed as ${found.status.replace('_', ' ')}.`)
        }
        found.status = next
        persist()
        return { status: 200, body: found }
      }

      throw new DemoError(404, 'Not found.')
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

  // ---- Data Privacy Act rights ----
  // Same shape as server/src/routes/privacy.ts: everything held, corrections to
  // what is the resident's to correct, and a closure that is honest about what
  // it cannot erase.
  if (parts[0] === 'privacy') {
    const user = need('resident')

    if (parts[1] === 'export' && method === 'GET') {
      const mine = state.requests.filter((r) => r.residentId === user.id)
      const dump = {
        exportedAt: new Date().toISOString(),
        about:
          'Everything the Municipality of Malasiqui holds about you in this portal, provided ' +
          'under your right to data portability (Republic Act 10173, the Data Privacy Act of 2012). ' +
          'Files you uploaded are listed under "attachments" and can be downloaded from each request.',
        account: {
          id: user.id, email: user.email, fullName: user.fullName, role: user.role,
          notifyEmail: user.notifyEmail, notifySms: user.notifySms,
        },
        profile: user.profile,
        requests: mine.map((r) => ({
          id: r.id, referenceNo: r.referenceNo, serviceId: r.serviceId,
          departmentId: r.categoryId, status: r.status, fee: r.fee, paid: r.paid,
          paymentMethod: r.paymentMethod, formValues: r.formValues,
          rejectionReason: r.rejectionReason, submittedAt: r.dateSubmitted, paidAt: r.paidAt,
        })),
        requestHistory: mine.flatMap((r) => r.events.map((e) => ({ requestId: r.id, ...e }))),
        attachments: mine.flatMap((r) => r.attachments.map((a) => ({
          id: a.id, requestId: r.id, fileName: a.fileName,
          contentType: a.contentType, requirement: a.requirement,
        }))),
        drafts: state.drafts.filter((d) => d.residentId === user.id),
        appointments: state.appointments.filter((a) => a.residentId === user.id),
        complaints: state.complaints.filter((c) => c.residentId === user.id),
        feedback: state.feedback.filter((f) => f.residentId === user.id),
        notifications: state.notifications.filter((n) => n.userId === user.id),
        programs: user.programs,
        idChecksAtCounters: state.verifications
          .filter((v) => v.userId === user.id && v.consumedAt)
          .map((v) => ({ checkedAt: v.consumedAt })),
        devicesReceivingNotifications: [],
      }
      return {
        status: 200,
        blob: new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }),
        fileName: `elgu-my-data-${new Date().toISOString().slice(0, 10)}.json`,
      }
    }

    if (parts[1] === 'profile' && method === 'PATCH') {
      // Contact details only. A name and a PhilSys number are identity claims an
      // office verified, so an unknown key leaves nothing to change and the
      // whole request is refused rather than partly applied.
      const patch: Record<string, string | null> = {}
      for (const key of ['barangay', 'address', 'phone', 'birthDate'] as const) {
        if (!(key in body)) continue
        const raw = body[key]
        const value = raw === null ? null : String(raw).trim() || null
        if (key === 'birthDate' && value !== null && !isRealDay(value)) {
          throw new DemoError(400, 'That is not a real date.')
        }
        patch[key] = value
      }
      if (Object.keys(patch).length === 0) throw new DemoError(400, 'Nothing to change.')
      Object.assign(user.profile, patch)
      persist()
      return { status: 200, body: user.profile }
    }

    const closureEffect = () => {
      const mine = state.requests.filter((r) => r.residentId === user.id)
      const drafts = state.drafts.filter((d) => d.residentId === user.id).length
      const upcoming = state.appointments.filter(
        (a) => a.residentId === user.id && a.status === 'booked' && a.scheduledOn >= officeToday()
      ).length
      const notes = state.notifications.filter((n) => n.userId === user.id).length
      return {
        erased: {
          signIn: 'Your sign-in is closed and your password is destroyed.',
          contactDetails: 'Your email address, phone number and home address are removed.',
          photo: user.photo ? 'The photograph on your digital ID is deleted.' : null,
          drafts: drafts > 0 ? `${drafts} unfinished form(s) you never submitted.` : null,
          appointments: upcoming > 0
            ? `${upcoming} upcoming appointment(s), cancelled so the slot goes to somebody else.` : null,
          notifications: notes > 0 ? `${notes} notification(s) held in the app.` : null,
          devices: null,
        },
        retained: {
          requests: mine.length > 0
            ? `${mine.length} request(s) you filed, and any document released from them. These are ` +
              'public records of the municipality: a permit or certificate with no applicant on it ' +
              'is not a record, so the law requires the office to keep them.'
            : null,
          programs: user.programs.length > 0
            ? `${user.programs.length} programme record(s). These belong to the register that issued ` +
              'them (social welfare, OSCA, the agriculture office), not to this app, and are removed ' +
              'by applying to that office.'
            : null,
          complaints:
            'Any complaint you filed and the reply to it, because a complaints record the office can ' +
            'delete on request is not a complaints record.',
        },
        howToGoFurther:
          'For anything listed as retained, write to the Data Protection Officer. The office will tell ' +
          'you the retention period for each record and erase what it is no longer required to keep.',
      }
    }

    if (parts[1] === 'closure-preview' && method === 'GET') {
      return { status: 200, body: closureEffect() }
    }

    if (parts[1] === 'close' && method === 'POST') {
      const effect = closureEffect()
      state.drafts = state.drafts.filter((d) => d.residentId !== user.id)
      state.notifications = state.notifications.filter((n) => n.userId !== user.id)
      state.verifications = state.verifications.filter((v) => v.userId !== user.id || v.consumedAt)
      for (const a of state.appointments) {
        if (a.residentId === user.id && a.status === 'booked' && a.scheduledOn >= officeToday()) {
          a.status = 'cancelled'
        }
      }
      user.photo = null
      user.photoUpdatedAt = null
      user.profile.phone = null
      user.profile.address = null
      user.active = false
      user.email = `closed+${user.id}@invalid`
      user.password = `closed-${uid()}`
      persist()
      return { status: 200, body: { ...effect, closedAt: new Date().toISOString() } }
    }

    throw new DemoError(404, 'Not found.')
  }

  // ---- feedback and complaints (RA 11032) ----
  // Same rules as server/src/routes/feedback.ts: a transaction can only be
  // rated once the office has finished with it, and only by whoever filed it.
  if (parts[0] === 'feedback') {
    const user = need('resident')

    if (parts[1] === 'complaints') {
      if (!parts[2] && method === 'GET') {
        return {
          status: 200,
          body: state.complaints
            .filter((c) => c.residentId === user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((c) => ({ ...c, officeName: officeName(c.departmentId) })),
        }
      }
      if (!parts[2] && method === 'POST') {
        const departmentId = String(body.departmentId ?? '')
        if (!SERVICE_CATEGORIES.some((c) => c.id === departmentId)) throw new DemoError(404, 'Office not found.')
        const category = String(body.category ?? '')
        if (!['delay', 'conduct', 'fees', 'requirements', 'other'].includes(category)) {
          throw new DemoError(400, 'Choose what the complaint is about.')
        }
        const text = String(body.body ?? '').trim()
        if (text.length < 10 || text.length > 4000) throw new DemoError(400, 'Say a little more about what happened.')
        const requestId = body.requestId ? String(body.requestId) : null
        if (requestId && !state.requests.some((r) => r.id === requestId && r.residentId === user.id)) {
          throw new DemoError(404, 'Request not found.')
        }
        const year = new Date().getFullYear()
        state.complaintCounter += 1
        const made: DemoComplaint = {
          id: uid(),
          referenceNo: `CMP-${year}-${String(state.complaintCounter).padStart(5, '0')}`,
          residentId: user.id, departmentId, requestId, category, body: text,
          status: 'open',
          // Working days, over the same calendar as everything else.
          dueOn: addWorkingDays(new Date(), COMPLAINT_RESPONSE_DAYS, holidayDays(state)),
          response: null, respondedAt: null, createdAt: new Date().toISOString(),
        }
        state.complaints.push(made)
        notify(user.id, requestId, 'complaint_filed', `Complaint filed — ${made.referenceNo}`,
          `${officeName(departmentId)} has your complaint (${made.referenceNo}). ` +
          `They are due to reply by ${made.dueOn}.`)
        persist()
        return { status: 201, body: { ...made, officeName: officeName(departmentId) } }
      }
      throw new DemoError(404, 'Not found.')
    }

    if (!parts[1] && method === 'GET') {
      return { status: 200, body: state.feedback.filter((f) => f.residentId === user.id) }
    }

    if (parts[1] && method === 'PUT') {
      const request = state.requests.find((r) => r.id === parts[1] && r.residentId === user.id)
      if (!request) throw new DemoError(404, 'Request not found.')
      if (request.status !== 'completed' && request.status !== 'rejected') {
        throw new DemoError(409, 'You can rate this once the office has finished with it.')
      }
      const rating = Number(body.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new DemoError(400, 'Give a rating between 1 and 5.')
      }
      const comment = body.comment ? String(body.comment).slice(0, 1000) : null
      const existing = state.feedback.find((f) => f.requestId === request.id)
      if (existing) Object.assign(existing, { rating, comment })
      else state.feedback.push({ requestId: request.id, residentId: user.id, rating, comment, createdAt: new Date().toISOString() })
      persist()
      return { status: 200, body: state.feedback.find((f) => f.requestId === request.id) }
    }

    throw new DemoError(404, 'Not found.')
  }

  // ---- appointments ----
  // Same rules as server/src/routes/appointments.ts: the office's calendar,
  // its capacity, one live booking per resident per office, and a queue number
  // that is never handed out twice.
  if (parts[0] === 'appointments') {
    const user = need('resident')
    const holidays = holidayDays(state)

    const serialize = (a: DemoAppointment) => {
      const svc = SERVICES.find((s) => s.id === a.serviceId)
      const cat = SERVICE_CATEGORIES.find((c) => c.id === a.departmentId)
      return {
        ...a,
        serviceName: svc?.name ?? a.serviceId,
        officeName: cat?.officeName ?? a.departmentId,
        officeAddress: state.offices[a.departmentId]?.address ?? null,
      }
    }

    if (parts[1] === 'days' && method === 'GET') {
      const departmentId = query.get('departmentId') ?? ''
      if (!SERVICE_CATEGORIES.some((c) => c.id === departmentId)) throw new DemoError(404, 'Office not found.')
      const today = officeToday()
      const days = Array.from({ length: BOOKING_DEFAULTS.horizonDays + 1 }, (_, i) => {
        const date = plusDays(today, i)
        const reason = closedReasonFor(date, holidays)
        return { date, open: reason === null, reason }
      })
      return { status: 200, body: { office: { departmentId, ...BOOKING_DEFAULTS }, days } }
    }

    if (parts[1] === 'availability' && method === 'GET') {
      const departmentId = query.get('departmentId') ?? ''
      const date = query.get('date') ?? ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DemoError(400, 'Give a date as YYYY-MM-DD.')
      if (!SERVICE_CATEGORIES.some((c) => c.id === departmentId)) throw new DemoError(404, 'Office not found.')
      return { status: 200, body: { date, ...demoSlots(date, departmentId, holidays) } }
    }

    if (!parts[1] && method === 'GET') {
      return {
        status: 200,
        body: state.appointments
          .filter((a) => a.residentId === user.id)
          .sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn) || b.startTime.localeCompare(a.startTime))
          .map(serialize),
      }
    }

    if (!parts[1] && method === 'POST') {
      const service = SERVICES.find((s) => s.id === body.serviceId)
      if (!service) throw new DemoError(404, 'Service not found.')
      const date = String(body.scheduledOn ?? '')
      const startTime = String(body.startTime ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DemoError(400, 'Give a date as YYYY-MM-DD.')
      if (!/^\d{2}:\d{2}$/.test(startTime)) throw new DemoError(400, 'Give a time as HH:MM.')

      // Date, then the hall's calendar, then the time — same order as the
      // server, so a Saturday reads as "the hall is closed", not "8am has gone".
      const badDate = bookableDateProblem(date)
      if (badDate) throw new DemoError(400, badDate)
      const closed = closedReasonFor(date, holidays)
      if (closed) throw new DemoError(400, closed)
      const badTime = bookableTimeProblem(date, startTime)
      if (badTime) throw new DemoError(400, badTime)

      const taken = state.appointments.filter(
        (a) => a.departmentId === service.categoryId && a.scheduledOn === date &&
               a.startTime === startTime && a.status !== 'cancelled'
      ).length
      if (taken >= BOOKING_DEFAULTS.capacity) {
        throw new DemoError(409, 'That time has just been taken. Please choose another.')
      }

      const clash = state.appointments.find(
        (a) => a.residentId === user.id && a.departmentId === service.categoryId &&
               (a.status === 'booked' || a.status === 'arrived') && a.scheduledOn >= officeToday()
      )
      if (clash) {
        throw new DemoError(409,
          `You already have an appointment at this office on ${clash.scheduledOn} (${clash.queueNo}). ` +
          'Cancel it first if you need a different time.')
      }

      const requestId = body.requestId ? String(body.requestId) : null
      if (requestId && !state.requests.some((r) => r.id === requestId && r.residentId === user.id)) {
        throw new DemoError(409, 'Request not found.')
      }

      const key = `${service.categoryId}:${date}`
      state.queueCounters[key] = (state.queueCounters[key] ?? 0) + 1
      const made: DemoAppointment = {
        id: uid(), residentId: user.id, departmentId: service.categoryId, serviceId: service.id,
        requestId, scheduledOn: date, startTime,
        queueNo: `${PREFIX[service.categoryId] ?? 'LGU'}-${String(state.queueCounters[key]).padStart(3, '0')}`,
        status: 'booked', note: body.note ? String(body.note).slice(0, 300) : null,
        createdAt: new Date().toISOString(),
      }
      state.appointments.push(made)
      notify(user.id, requestId, 'appointment_booked', `${service.name} — appointment booked`,
        `You are booked at ${officeName(service.categoryId)} on ${date} at ${startTime}. ` +
        `Your queue number is ${made.queueNo}.`)
      persist()
      return { status: 201, body: serialize(made) }
    }

    if (parts[1] && method === 'DELETE') {
      const found = state.appointments.find((a) => a.id === parts[1] && a.residentId === user.id)
      if (!found) throw new DemoError(404, 'Appointment not found.')
      if (found.status !== 'booked') {
        throw new DemoError(409, `That appointment is already marked ${found.status.replace('_', ' ')}.`)
      }
      found.status = 'cancelled'
      notify(user.id, null, 'appointment_cancelled', 'Appointment cancelled',
        `Your appointment at ${officeName(found.departmentId)} on ${found.scheduledOn} (${found.queueNo}) ` +
        'has been cancelled. The slot is free for someone else.')
      persist()
      return { status: 204 }
    }

    throw new DemoError(404, 'Not found.')
  }

  // ---- admin: the municipality's own data ----
  // Same rules as server/src/routes/admin.ts: administrators only, the same
  // validation, and every change written to the audit trail with the old value.
  if (parts[0] === 'admin' && ['hotlines', 'holidays', 'offices', 'audit'].includes(parts[1] ?? '')) {
    const actor = need('admin')
    const audit = (action: string, target: string, before?: unknown, after?: unknown) => {
      state.audit.unshift({
        id: state.audit.length + 1, actorName: actor.fullName, action, target,
        before: before ?? null, after: after ?? null, createdAt: new Date().toISOString(),
      })
    }

    if (parts[1] === 'hotlines') {
      const sorted = () => [...state.hotlines].sort(
        (a, b) => Number(a.isNational) - Number(b.isNational) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
      )
      if (!parts[2] && method === 'GET') return { status: 200, body: sorted() }

      if (!parts[2] && method === 'POST') {
        const row = readHotline(body)
        const id = `${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hotline'}-${Math.random().toString(16).slice(2, 8)}`
        const created = { id, ...row }
        state.hotlines.push(created)
        audit('hotline.create', id, undefined, created)
        persist()
        return { status: 201, body: created }
      }

      const found = state.hotlines.find((h) => h.id === parts[2])
      if (!found) throw new DemoError(404, 'Hotline not found.')

      if (method === 'PUT') {
        const before = { ...found }
        Object.assign(found, readHotline(body, found.sortOrder))
        audit('hotline.update', found.id, before, { ...found })
        persist()
        return { status: 200, body: found }
      }
      if (method === 'DELETE') {
        state.hotlines = state.hotlines.filter((h) => h.id !== found.id)
        audit('hotline.delete', found.id, { ...found })
        persist()
        return { status: 204 }
      }
    }

    if (parts[1] === 'holidays') {
      if (!parts[2] && method === 'GET') {
        const year = Number(query.get('year')) || new Date().getFullYear()
        if (year < 2000 || year > 2100) throw new DemoError(400, 'Pick a year between 2000 and 2100.')
        return {
          status: 200,
          body: state.holidays.filter((h) => h.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date)),
        }
      }
      if (!parts[2] && method === 'POST') {
        const date = String(body.date ?? '')
        if (!isRealDay(date)) throw new DemoError(400, 'That is not a real date.')
        const name = String(body.name ?? '').trim()
        if (!name || name.length > 120) throw new DemoError(400, 'Give the day a name.')
        const isLocal = Boolean(body.isLocal)
        const existing = state.holidays.find((h) => h.date === date)
        const before = existing ? { ...existing } : undefined
        // Upsert, exactly as the server does: a proclamation renaming a day is
        // the ordinary case, not a reason to make someone delete a row first.
        if (existing) Object.assign(existing, { name, isLocal })
        else state.holidays.push({ date, name, isLocal })
        const after = state.holidays.find((h) => h.date === date)!
        audit(existing ? 'holiday.update' : 'holiday.create', date, before, { ...after })
        persist()
        return { status: 201, body: after }
      }
      if (parts[2] && method === 'DELETE') {
        if (!isRealDay(parts[2])) throw new DemoError(400, 'That is not a real date.')
        const existing = state.holidays.find((h) => h.date === parts[2])
        if (!existing) throw new DemoError(404, 'That day is not in the calendar.')
        state.holidays = state.holidays.filter((h) => h.date !== parts[2])
        audit('holiday.delete', parts[2], { ...existing })
        persist()
        return { status: 204 }
      }
    }

    if (parts[1] === 'offices') {
      const rows = () => SERVICE_CATEGORIES.map((c) => ({
        id: c.id, name: c.name, officeName: c.officeName, ...state.offices[c.id]!,
      }))
      if (!parts[2] && method === 'GET') return { status: 200, body: rows() }

      if (parts[2] && method === 'PATCH') {
        const office = state.offices[parts[2]]
        const meta = SERVICE_CATEGORIES.find((c) => c.id === parts[2])
        if (!office || !meta) throw new DemoError(404, 'Office not found.')
        // Only contact details. An unknown key is dropped, which leaves nothing
        // to change and refuses the whole request rather than doing something
        // else quietly.
        const patch: Record<string, string | null> = {}
        for (const key of ['address', 'hours', 'phone', 'email'] as const) {
          if (!(key in body)) continue
          const raw = body[key]
          const value = raw === null ? null : String(raw).trim() || null
          if (key === 'phone' && value !== null && !dialable(value)) {
            throw new DemoError(400, 'That does not look like a number a resident could dial.')
          }
          if (key === 'email' && value !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
            throw new DemoError(400, 'That is not an email address.')
          }
          patch[key] = value
        }
        if (Object.keys(patch).length === 0) throw new DemoError(400, 'Nothing to change.')
        const before = { id: meta.id, name: meta.name, officeName: meta.officeName, ...office }
        Object.assign(office, patch)
        const after = { id: meta.id, name: meta.name, officeName: meta.officeName, ...office }
        audit('office.update', meta.id, before, after)
        persist()
        return { status: 200, body: after }
      }
    }

    if (parts[1] === 'audit' && method === 'GET') {
      const limit = Math.min(Math.max(Number(query.get('limit')) || 50, 1), 200)
      return { status: 200, body: state.audit.slice(0, limit) }
    }

    throw new DemoError(404, 'Not found.')
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
        photo: null, photoUpdatedAt: null,
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
