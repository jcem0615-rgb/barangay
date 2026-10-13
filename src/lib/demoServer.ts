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
  BARANGAYS, BARANGAY_CERTIFICATES, EMERGENCY_CONTACTS, HOLIDAYS, MUNICIPALITY,
  SECTORAL_PROGRAMS, SERVICES, SERVICE_CATEGORIES,
} from '../data/mockData'
import { addWorkingDays } from './schedule'
import { WORKFLOW_STEPS, type ServiceDefinition, type ServiceField } from '../types'

// Bumped whenever the seeded shape changes: a store written by an older build
// would be missing fields this one reads, so it is discarded rather than
// patched. Losing a demo's clicked-through state is the cheaper failure.
const STORE_KEY = 'elgu-demo-state-v25'

interface DemoIncident {
  id: string
  referenceNo: string
  reporterId: string
  reporterName: string
  kind: string
  description: string
  location: string | null
  status: 'new' | 'acknowledged' | 'resolved' | 'closed'
  reportedAt: string
  officeNote: string | null
  handledAt: string | null
  handledBy: string | null
  evidence: Array<{
    id: string
    contentType: string
    byteSize: number
    durationSeconds: number | null
    uploadedAt: string
    /** A data URL. The demo has nowhere else to put bytes. */
    data: string
  }>
}

interface DemoPayment {
  reference: string
  requestId: string
  residentId: string
  provider: string
  providerRef: string | null
  method: string | null
  amountCentavos: number
  status: 'pending' | 'settled' | 'failed' | 'mismatched'
  createdAt: string
  settledAt: string | null
  note: string | null
  /** Issued in the same step that settles the payment, as on the real server. */
  receipt: DemoReceipt | null
}

/**
 * A receipt, frozen at issue.
 *
 * The municipality's details are copied onto the row rather than read back from
 * `state.municipality`, for the same reason the server stores the rendered PDF:
 * a receipt re-made from the current row would carry the current treasurer's
 * name over last month's payment.
 */
interface DemoReceipt {
  receiptNo: string
  verificationCode: string
  issuedAt: string
  issuedTo: string
  issuedToAddress: string | null
  particulars: string
  issuer: DemoMunicipality
}

/** What the municipality prints on an official receipt. */
interface DemoMunicipality {
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
}

interface DemoUser {
  id: string
  email: string
  password: string
  fullName: string
  role: 'resident' | 'staff' | 'admin' | 'barangay_admin' | 'barangay_officer' | 'barangay_kagawad'
  departments: string[]
  position: string | null
  active: boolean
  notifyEmail: boolean
  notifySms: boolean
  /** The register this account belongs to; null on the seeded demo accounts. */
  municipalityCode?: string | null
  /**
   * For a resident, the barangay they said they live in; for barangay staff, the
   * barangay they work for. Null means the resident has not said yet.
   */
  barangayId?: string | null
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
  payments: DemoPayment[]
  incidents: DemoIncident[]
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
  /** What goes on an official receipt, and the seal printed on it. */
  municipality: DemoMunicipality
  /**
   * The uploaded seal, as a data URL downscaled before it is stored. The real
   * store takes 2 MB; localStorage does not, so the demo shrinks it rather than
   * accepting an upload that would silently fail to persist.
   */
  seal: string | null
  sealUpdatedAt: string | null
  /** barangay id -> its own seal, as a downscaled data URL. */
  barangaySeals: Record<string, { seal: string; updatedAt: string }>
  /** One series for the municipality, like every other counter here. */
  receiptCounter: number
  barangayRequests: DemoBarangayRequest[]
  /** barangay id -> certificate id -> fee in pesos. Only what a barangay changed. */
  barangayFees: Record<string, Record<string, number>>
  /** barangay id -> the hall's details, for the same reason the offices are here. */
  barangayOffices: Record<string, DemoBarangayOffice>
  /** The certificate catalogue: shared rows and each barangay's own. */
  certificates: DemoCertificateType[]
  /**
   * The blotter. Held like everything else here, and read by nothing but the
   * barangay console — the demo mirrors that rule because a demo that leaked it
   * would teach the opposite of what the real server does.
   */
  blotter: DemoBlotterEntry[]
  /** The register of inhabitants, scoped to a barangay exactly as on the server. */
  households: DemoHousehold[]
  /** The barangay's board of notices — the one barangay record residents read. */
  announcements: DemoAnnouncement[]
}

interface DemoAnnouncement {
  id: string; barangayId: string
  kind: 'general' | 'service' | 'emergency' | 'health' | 'event'
  title: string; body: string; urgent: boolean
  expiresAt: string | null; archivedAt: string | null
  postedBy: string | null; postedAt: string; updatedAt: string
}

interface DemoHouseholdMember {
  id: string; fullName: string; birthDate: string | null; sex: 'female' | 'male' | null
  relationship: string; civilStatus: string | null; occupation: string | null
  isPwd: boolean; isFourPs: boolean; isVoter: boolean
}

interface DemoHousehold {
  id: string; barangayId: string; householdNo: number
  address: string; purok: string | null; headName: string
  contact: string | null; notes: string | null
  status: 'active' | 'moved' | 'archived'; statusNote: string | null
  updatedAt: string; members: DemoHouseholdMember[]
}

interface DemoBlotterEntry {
  id: string; referenceNo: string; barangayId: string
  complainant: string; complainantContact: string | null
  respondent: string; respondentAddress: string | null; respondentContact: string | null
  nature: string; narrative: string; occurredAt: string | null
  status: 'recorded' | 'mediation' | 'settled' | 'unsettled' | 'withdrawn' | 'referred'
  outcomeNote: string | null
  recordedBy: string | null; recordedAt: string; updatedAt: string
  summons: Array<{
    id: string; sequence: number; hearingAt: string; venue: string; note: string | null
    servedAt: string | null; servedNote: string | null
    /** That a reminder went to the typed contacts. Not service. */
    notifiedAt: string | null; notifyResult: string | null
    outcome: 'pending' | 'appeared' | 'failed_to_appear' | 'rescheduled' | 'cancelled'
    issuedAt: string; issuedBy: string | null
  }>
}

interface DemoBarangayRequest {
  id: string; referenceNo: string; barangayId: string; residentId: string; residentName: string
  typeId: string; typeName: string; purpose: string; fee: number
  status: 'pending' | 'processing' | 'ready' | 'released' | 'rejected'
  requestedAt: string; updatedAt: string; note: string | null
  /** Stamped on the move to `ready`, like the server. A calendar day. */
  validUntil: string | null
  /**
   * The certificate, written on the move to `released` — not `ready`. The
   * barangay takes its fee at the hall on collection, so a copy available at
   * `ready` would hand somebody the document without their ever going.
   */
  certificate: { verificationCode: string; issuedAt: string } | null
}

/**
 * A barangay's own hall details, held in state rather than read off the seed —
 * the same reason the municipal office details are: a demo that showed an edit
 * saving and then not appearing anywhere would teach the wrong thing.
 */
/**
 * A row of the certificate catalogue, held in state rather than read from the
 * imported constant — the same reason the municipal office contacts are, now
 * that both tiers can add to it. `barangayId` null is the shared catalogue.
 */
interface DemoCertificateType {
  id: string; name: string; description: string; fee: number
  purposeHint: string; sortOrder: number; active: boolean
  validityDays: number | null; barangayId: string | null
  steps: unknown[]
  /** What the certificate says; null falls back to the plain sentence. */
  attestation: string | null
}

/** What the renderer can fill in. Mirrors the server's closed list. */
const ATTESTATION_PLACEHOLDERS = [
  'name', 'residence', 'barangay', 'municipality', 'province', 'purpose', 'date',
]

interface DemoBarangayOffice {
  captain: string | null; secretary: string | null
  hallAddress: string | null; officeHours: string | null
  phone: string | null; email: string | null
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
    // Barangay accounts, the same way the real seed makes them: an administrator
    // everywhere, plus one officer in the first barangay so both halves of that
    // portal can be signed into without creating twelve demo logins.
    ...BARANGAYS.flatMap((b, index) => [
      {
        id: uid(), email: `admin.${b.id}@malasiqui.gov.ph`, password: DEMO_PASSWORD,
        fullName: `${b.name} Barangay Secretary`, role: 'barangay_admin' as const,
        departments: [], position: null, active: true, notifyEmail: true, notifySms: false,
        barangayId: b.id,
        profile: { philSysId: null, barangay: b.name, municipality: null, province: null, birthDate: null, address: null, phone: null },
        photo: null, photoUpdatedAt: null, programs: [],
      },
      ...(index === 0
        ? [{
            id: uid(), email: `officer.${b.id}@malasiqui.gov.ph`, password: DEMO_PASSWORD,
            fullName: `${b.name} Barangay Clerk`, role: 'barangay_officer' as const,
            departments: [], position: null, active: true, notifyEmail: true, notifySms: false,
            barangayId: b.id,
            profile: { philSysId: null, barangay: b.name, municipality: null, province: null, birthDate: null, address: null, phone: null },
            photo: null, photoUpdatedAt: null, programs: [],
          },
          // One kagawad, so the demo can show what an elected member sees and —
          // the more interesting half — what they are refused.
          {
            id: uid(), email: `kagawad.${b.id}@malasiqui.gov.ph`, password: DEMO_PASSWORD,
            fullName: `${b.name} Barangay Kagawad`, role: 'barangay_kagawad' as const,
            departments: [], position: null, active: true, notifyEmail: true, notifySms: false,
            barangayId: b.id,
            profile: { philSysId: null, barangay: b.name, municipality: null, province: null, birthDate: null, address: null, phone: null },
            photo: null, photoUpdatedAt: null, programs: [],
          }]
        : []),
    ]),
  ]

  // A resident with history, so the demo isn't an empty shell on first open.
  const resident: DemoUser = {
    id: uid(), email: 'maria@example.ph', password: DEMO_PASSWORD,
    fullName: 'Maria Clara D. Santos', role: 'resident', departments: [], position: null,
    active: true, notifyEmail: true, notifySms: false,
    // In a real barangay from the list rather than an invented one, so the
    // barangay console's queue and the resident's hub are the same barangay.
    barangayId: BARANGAYS[0]!.id,
    profile: {
      philSysId: '6392-8841-0027-3311', barangay: `Barangay ${BARANGAYS[0]!.name}`,
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
    users, requests: [], drafts: [], verifications: [], notifications: [], payments: [], incidents: [], counters: {},
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
    // Seeded from the authored municipality, exactly as the real seed does, and
    // editable from the Municipality tab after that.
    municipality: {
      address: MUNICIPALITY.address, phone: MUNICIPALITY.phone, email: MUNICIPALITY.email,
      website: MUNICIPALITY.website, tin: MUNICIPALITY.tin,
      treasurerName: MUNICIPALITY.treasurerName, treasurerTitle: MUNICIPALITY.treasurerTitle,
      receiptPrefix: MUNICIPALITY.receiptPrefix,
      receiptFormLabel: MUNICIPALITY.receiptFormLabel || null,
      receiptFooter: MUNICIPALITY.receiptFooter || null,
    },
    seal: null,
    sealUpdatedAt: null,
    barangaySeals: {},
    receiptCounter: 0,
    barangayRequests: [],
    barangayFees: {},
    // Seeded from the authored catalogue and editable from both consoles after
    // that. Everything authored is shared; a barangay's own are added at runtime.
    certificates: BARANGAY_CERTIFICATES.map((c, index) => ({
      id: c.id, name: c.name, description: c.description, fee: c.fee,
      purposeHint: c.purposeHint, sortOrder: index, active: true,
      validityDays: c.validityDays ?? null, barangayId: null,
      steps: c.steps ?? [],
      attestation: c.attestation ?? null,
    })),
    barangayOffices: Object.fromEntries(
      BARANGAYS.map((b) => [b.id, {
        captain: b.captain, secretary: b.secretary,
        hallAddress: b.hallAddress, officeHours: b.officeHours,
        phone: b.phone, email: b.email,
      }])
    ),
    blotter: [],
    households: [],
    announcements: [],
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

  // Two barangay requests in the resident's own barangay, so the barangay
  // console opens on a queue rather than an empty table and the resident's hub
  // has history. One already collected, one waiting to be worked.
  const brgyYear = new Date(now).getFullYear()
  const brgySeed: Array<[string, string, DemoBarangayRequest['status'], number]> = [
    ['clearance', 'Local employment requirement', 'pending', 2],
    ['residency', 'School enrolment of my daughter', 'released', 21],
  ]
  for (const [typeId, purpose, status, daysAgo] of brgySeed) {
    const type = BARANGAY_CERTIFICATES.find((c) => c.id === typeId)!
    state.counters[`brgy-${brgyYear}`] = (state.counters[`brgy-${brgyYear}`] ?? 0) + 1
    const at = new Date(now - 86400000 * daysAgo).toISOString()
    state.barangayRequests.push({
      id: uid(),
      referenceNo: `BRGY-${brgyYear}-${String(state.counters[`brgy-${brgyYear}`]).padStart(5, '0')}`,
      barangayId: resident.barangayId!,
      residentId: resident.id,
      residentName: resident.fullName,
      typeId: type.id,
      typeName: type.name,
      purpose,
      fee: type.fee,
      status,
      requestedAt: at,
      updatedAt: at,
      note: null,
      // The released one carries its copy, so the demo shows the download
      // without somebody having to walk a request through the whole queue.
      certificate:
        status === 'released'
          ? { verificationCode: 'H7QB-2MXT-5KRE-91WD', issuedAt: at }
          : null,
      // The released one was issued when it was requested, so it is already
      // partway through its validity — which is the case worth showing, since a
      // certificate that always looks fresh never demonstrates the lapse.
      validUntil:
        status === 'released' && type.validityDays
          ? new Date(now - 86400000 * daysAgo + 86400000 * type.validityDays)
              .toLocaleDateString('en-CA')
          : null,
    })
  }

  // Two entries in the blotter so the console opens on a book rather than an
  // empty table: one being mediated with a hearing called, one already settled.
  // Both name people who are not sign-in accounts, which is the ordinary case —
  // a respondent rarely has one, and matching them to one is exactly what this
  // book must not do.
  const bltrYear = new Date(now).getFullYear()
  const blotterSeed: Array<[Partial<DemoBlotterEntry>, number]> = [
    [{
      complainant: 'Lourdes M. Fabro', complainantContact: '0917 555 0134',
      respondent: 'Rodel A. Quinto', respondentAddress: 'Purok 2, Poblacion',
      nature: 'Dispute between neighbours',
      narrative: 'Complainant states the respondent has burned refuse against the shared fence on three occasions after being asked to stop, and that smoke enters her kitchen.',
      status: 'mediation',
    }, 6],
    [{
      complainant: 'Nestor B. Ancheta',
      respondent: 'Vilma R. Soriano', respondentAddress: 'Purok 5, Poblacion',
      nature: 'Debt or unpaid obligation',
      narrative: 'Complainant states an agreed repayment of a loan has not been made since January and that messages have gone unanswered.',
      status: 'settled',
      outcomeNote: 'Parties agreed on repayment of ₱1,000 monthly beginning the first week of next month. Both signed.',
    }, 40],
  ]
  for (const [seed, daysAgo] of blotterSeed) {
    state.counters[`bltr-${bltrYear}`] = (state.counters[`bltr-${bltrYear}`] ?? 0) + 1
    const at = new Date(now - 86400000 * daysAgo).toISOString()
    const entry: DemoBlotterEntry = {
      id: uid(),
      referenceNo: `BLTR-${bltrYear}-${String(state.counters[`bltr-${bltrYear}`]).padStart(5, '0')}`,
      barangayId: BARANGAYS[0]!.id,
      complainantContact: null, respondentContact: null,
      respondentAddress: null, occurredAt: null, outcomeNote: null,
      recordedBy: `${BARANGAYS[0]!.name} Barangay Clerk`,
      recordedAt: at, updatedAt: at, summons: [],
      ...seed,
    } as DemoBlotterEntry
    if (entry.status === 'mediation') {
      entry.summons.push({
        id: uid(), sequence: 1,
        hearingAt: new Date(now + 86400000 * 3).toISOString(),
        venue: 'Barangay hall', note: 'Both parties to appear.',
        notifiedAt: null, notifyResult: null,
        servedAt: new Date(now - 86400000 * 4).toISOString(), servedNote: 'Served personally.',
        outcome: 'pending',
        issuedAt: new Date(now - 86400000 * 5).toISOString(),
        issuedBy: `${BARANGAYS[0]!.name} Barangay Secretary`,
      })
    }
    state.blotter.push(entry)
  }

  // A few households so the register opens on figures rather than zeroes, and
  // so the age bands have something in them. Deliberately includes one member
  // with no date of birth, because that is the ordinary case in a real register
  // and the screen says so rather than quietly undercounting.
  const years = (n: number) => {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }
  const member = (
    fullName: string, relationship: string, age: number | null,
    sex: 'female' | 'male' | null, extra: Partial<DemoHouseholdMember> = {}
  ): DemoHouseholdMember => ({
    id: uid(), fullName, relationship, sex,
    birthDate: age === null ? null : years(age),
    civilStatus: null, occupation: null,
    isPwd: false, isFourPs: false, isVoter: age !== null && age >= 18,
    ...extra,
  })

  const householdSeed: Array<[string, string, string, DemoHouseholdMember[]]> = [
    ['Rosa D. Mendoza', '12 Mabini St', 'Purok 3', [
      member('Rosa D. Mendoza', 'Head', 44, 'female', { occupation: 'Sari-sari store owner' }),
      member('Elmer P. Mendoza', 'Spouse', 47, 'male', { occupation: 'Tricycle driver' }),
      member('Ana D. Mendoza', 'Daughter', 9, 'female', { isFourPs: true }),
      member('Nena V. Dizon', 'Parent', 72, 'female', { isPwd: true }),
    ]],
    ['Benito S. Aquino', '14 Mabini St', 'Purok 3', [
      member('Benito S. Aquino', 'Head', 61, 'male', { occupation: 'Farmer' }),
      member('Luzviminda R. Aquino', 'Spouse', 58, 'female'),
      // No date of birth on record, which the figures panel reports rather than
      // hiding.
      member('Tiyo Ramon', 'Relative', null, 'male'),
    ]],
    ['Grace T. Villanueva', '3 Rizal Ave', 'Purok 1', [
      member('Grace T. Villanueva', 'Head', 33, 'female', { occupation: 'Teacher' }),
      member('Kyle T. Villanueva', 'Son', 6, 'male'),
    ]],
  ]
  for (const [headName, address, purok, members] of householdSeed) {
    const key = `hh-${BARANGAYS[0]!.id}`
    state.counters[key] = (state.counters[key] ?? 0) + 1
    state.households.push({
      id: uid(), barangayId: BARANGAYS[0]!.id, householdNo: state.counters[key]!,
      address, purok, headName, contact: null, notes: null,
      status: 'active', statusNote: null,
      updatedAt: new Date(now - 86400000 * 30).toISOString(),
      members,
    })
  }

  // Two notices on the demo resident's own barangay board: one urgent that is
  // the kind people act on, one ordinary. They are what makes the hub show a
  // board at all on a first visit.
  const annSeed: Array<[Partial<DemoAnnouncement>, number]> = [
    [{
      kind: 'service', urgent: true,
      title: 'Water interruption, Tuesday 8am to 4pm',
      body: 'The main along Mabini St is being repaired. Store water on Monday night. Tankers will be at the covered court from 10am.',
    }, 1],
    [{
      kind: 'event',
      title: 'Barangay assembly, Sunday 3pm',
      body: 'Quarterly assembly at the covered court. The budget and the clean-up schedule are on the agenda. All household heads are asked to attend.',
    }, 4],
  ]
  for (const [seed, daysAgo] of annSeed) {
    const at = new Date(now - 86400000 * daysAgo).toISOString()
    state.announcements.push({
      id: uid(), barangayId: BARANGAYS[0]!.id,
      kind: 'general', title: '', body: '', urgent: false,
      expiresAt: null, archivedAt: null,
      postedBy: `${BARANGAYS[0]!.name} Barangay Secretary`,
      postedAt: at, updatedAt: at,
      ...seed,
    } as DemoAnnouncement)
  }

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
 * What this barangay charges for a certificate: its own figure where it set one,
 * the shared catalogue's where it did not. The same coalesce the server does in
 * SQL, so the resident's screen and the administrator's agree.
 */
const certificates = (): DemoCertificateType[] =>
  state.certificates ?? BARANGAY_CERTIFICATES.map((c, index) => ({
    id: c.id, name: c.name, description: c.description, fee: c.fee,
    purposeHint: c.purposeHint, sortOrder: index, active: true,
    validityDays: c.validityDays ?? null, barangayId: null, steps: c.steps ?? [],
    attestation: c.attestation ?? null,
  }))

/** Shared rows plus this barangay's own — never another barangay's. */
const certificatesFor = (barangayId: string) =>
  certificates().filter((c) => c.barangayId === null || c.barangayId === barangayId)

const certificateType = (typeId: string) => certificates().find((c) => c.id === typeId)

const serializeCertificate = (c: DemoCertificateType) => ({
  id: c.id, name: c.name, description: c.description, fee: c.fee,
  purposeHint: c.purposeHint, sortOrder: c.sortOrder, active: c.active,
  validityDays: c.validityDays, barangayId: c.barangayId,
  attestation: c.attestation,
})

/**
 * The validation both tiers share, mirroring the server's one module — two
 * copies here would drift exactly where the server refuses to let them.
 */
const readCertificateBody = (body: Record<string, unknown> | undefined, partial: boolean) => {
  const name = body?.name === undefined ? undefined : String(body.name).trim()
  const description = body?.description === undefined ? undefined : String(body.description).trim()
  const fee = body?.fee === undefined ? undefined : Number(body.fee)
  if (!partial || name !== undefined) {
    if (!name || name.length < 3) throw new DemoError(400, 'Give it the name people will ask for at the counter.')
  }
  if (!partial || description !== undefined) {
    if (!description || description.length < 10) throw new DemoError(400, 'Say what it is for.')
  }
  if (!partial || fee !== undefined) {
    if (fee === undefined || !Number.isFinite(fee) || fee < 0) throw new DemoError(400, 'Give a fee in pesos, 0 or more.')
  }
  const validityDays = 'validityDays' in (body ?? {})
    ? (body!.validityDays === null ? null : Number(body!.validityDays))
    : undefined
  // The placeholder check is at the save rather than at the print, as on the
  // server: a name the renderer cannot fill would come out as literal braces in
  // the middle of an official document.
  const attestation = 'attestation' in (body ?? {})
    ? (body!.attestation === null ? null : String(body!.attestation))
    : undefined
  if (attestation) {
    const unknown = [...new Set(
      [...attestation.matchAll(/\{([a-zA-Z0-9_]*)\}/g)]
        .filter((m) => !ATTESTATION_PLACEHOLDERS.includes(m[1] ?? ''))
        .map((m) => m[0])
    )]
    if (unknown.length > 0) {
      throw new DemoError(
        400,
        `${unknown.join(', ')} is not something a certificate can fill in. ` +
          `Use ${ATTESTATION_PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}.`
      )
    }
  }
  return { name, description, fee, validityDays, attestation }
}

/** Slug plus a tail: two barangays will both add "Tricycle Permit". */
const certificateId = (name: string) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug || 'certificate'}-${Math.random().toString(16).slice(2, 8)}`
}

/** Shared with the municipal audit log, which is where the treasury reads it. */
const auditCertificate = (
  actor: DemoUser, action: string, target: string, before: unknown, after: unknown
) => {
  state.audit.unshift({
    id: state.audit.length + 1, actorName: actor.fullName, action, target,
    before: before ?? null, after: after ?? null, createdAt: new Date().toISOString(),
  })
}

const barangayFee = (barangayId: string, typeId: string) =>
  state.barangayFees[barangayId]?.[typeId] ??
  certificateType(typeId)?.fee ??
  0

/**
 * The hall's details as they now stand. Read from state so an edit in the
 * console shows up on the resident's screen, with the authored row as the
 * fallback for a browser whose state predates this.
 */
/**
 * Age on today, derived rather than stored — the same rule the server follows,
 * because a stored age is wrong the day after it is written. Module scope now
 * that both the register and the council's figures need it.
 */
const ageOn = (birthDate: string | null) => {
  if (!birthDate) return null
  const born = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  const before =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  if (before) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/**
 * The register as counts, apart from the route that serves them — the same
 * split the server makes, and for the same reason: a kagawad reads these and
 * must never reach the register they come from.
 */
const barangayFigures = (barangayId: string) => {
  const active = state.households.filter((h) => h.barangayId === barangayId && h.status === 'active')
  const people = active.flatMap((h) => h.members.map((m) => ({ ...m, purok: h.purok })))
  const ages = people.map((m) => ageOn(m.birthDate))
  const known = ages.filter((a): a is number => a !== null)
  const puroks = [...new Set(active.map((h) => h.purok))]
  return {
    households: active.length,
    population: people.length,
    female: people.filter((m) => m.sex === 'female').length,
    male: people.filter((m) => m.sex === 'male').length,
    children: known.filter((a) => a < 18).length,
    adults: known.filter((a) => a >= 18 && a < 60).length,
    seniors: known.filter((a) => a >= 60).length,
    withoutBirthDate: ages.length - known.length,
    pwd: people.filter((m) => m.isPwd).length,
    fourPs: people.filter((m) => m.isFourPs).length,
    voters: people.filter((m) => m.isVoter).length,
    byPurok: puroks.map((purok) => ({
      purok,
      households: active.filter((h) => h.purok === purok).length,
      population: people.filter((m) => m.purok === purok).length,
    })),
  }
}

const barangayOffice = (barangayId: string): DemoBarangayOffice => {
  const seeded = BARANGAYS.find((b) => b.id === barangayId)
  return state.barangayOffices?.[barangayId] ?? {
    captain: seeded?.captain ?? null, secretary: seeded?.secretary ?? null,
    hallAddress: seeded?.hallAddress ?? null, officeHours: seeded?.officeHours ?? null,
    phone: seeded?.phone ?? null, email: seeded?.email ?? null,
  }
}

const serializeAnnouncement = (a: DemoAnnouncement) => ({
  id: a.id, kind: a.kind, title: a.title, body: a.body, urgent: a.urgent,
  expiresAt: a.expiresAt, archivedAt: a.archivedAt,
  postedBy: a.postedBy, postedAt: a.postedAt,
  // A notice corrected after it went out is not the one people read.
  editedAt: a.updatedAt > a.postedAt ? a.updatedAt : null,
})

/**
 * Expiry applied on read rather than by a job, as on the server: a notice stops
 * showing on the day it lapses with nothing scheduled to make that true.
 */
const liveAnnouncements = (barangayId: string) =>
  state.announcements
    .filter((a) => a.barangayId === barangayId && !a.archivedAt)
    .filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.postedAt.localeCompare(a.postedAt))
    .map(serializeAnnouncement)

const serializeBarangayRequest = (r: DemoBarangayRequest) => ({
  id: r.id,
  referenceNo: r.referenceNo,
  typeId: r.typeId,
  typeName: r.typeName,
  purpose: r.purpose,
  fee: r.fee,
  status: r.status,
  requestedAt: r.requestedAt,
  updatedAt: r.updatedAt,
  note: r.note,
  barangayName: BARANGAYS.find((b) => b.id === r.barangayId)?.name,
  residentName: r.residentName,
  validUntil: r.validUntil,
  // Derived on read, as on the server: a stored flag would be wrong the day
  // after it was written.
  expired: r.validUntil !== null && r.validUntil < officeDay(),
  hasCertificate: r.certificate !== null,
  certificateCode: r.certificate?.verificationCode ?? null,
})

/**
 * What the barangay attests, as the barangay wrote it — the authored text off
 * the certificate type, with the names filled in. A type with none falls back
 * to a sentence claiming only what the barangay actually did.
 */
function attestationLines(r: DemoBarangayRequest, barangayName: string): string[] {
  const resident = state.users.find((u) => u.id === r.residentId)
  const address = resident?.profile.address
  const residence = address ? `${address}, Barangay ${barangayName}` : `Barangay ${barangayName}`
  const template = certificateType(r.typeId)?.attestation?.trim()
  const body = template
    ? template.replace(/\{([a-zA-Z0-9_]*)\}/g, (whole, key: string) => {
        const values: Record<string, string> = {
          name: r.residentName,
          residence,
          barangay: barangayName,
          municipality: MUNICIPALITY.name,
          province: MUNICIPALITY.province,
          purpose: r.purpose,
          date: r.certificate
            ? new Date(r.certificate.issuedAt).toLocaleDateString('en-PH', {
                year: 'numeric', month: 'long', day: 'numeric',
              })
            : '',
        }
        return key in values ? values[key]! : whole
      })
    : `This is to certify that ${r.residentName}, a resident of ${residence}, ` +
      `has been issued this ${r.typeName} by the Barangay Government.\n\n` +
      `Issued upon request for the purpose of: ${r.purpose}.`
  // The hand-rolled PDF writer takes one line at a time, so paragraphs are
  // wrapped here rather than by a layout engine.
  return body
    .split(/\n\s*\n/)
    .flatMap((paragraph) => [...wrapLine(paragraph.replace(/\s+/g, ' ').trim()), ''])
    .slice(0, -1)
}

/** Breaks a paragraph at roughly the width the demo's PDF page holds. */
function wrapLine(text: string, width = 92): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

/** The barangay certificate PDF, assembled by hand like the municipal one. */
function barangayCertificateFor(r: DemoBarangayRequest): Blob {
  const barangay = BARANGAYS.find((b) => b.id === r.barangayId)
  const office = barangayOffice(r.barangayId)
  return makePdf([
    'Republic of the Philippines',
    `Province of ${MUNICIPALITY.province}`,
    `Municipality of ${MUNICIPALITY.name}`,
    `BARANGAY ${(barangay?.name ?? '').toUpperCase()}`,
    office.hallAddress ?? '',
    '',
    r.typeName.toUpperCase(),
    `Reference No. ${r.referenceNo}`,
    '',
    'TO WHOM IT MAY CONCERN:',
    ...attestationLines(r, barangay?.name ?? ''),
    '',
    `Issued on: ${r.certificate ? new Date(r.certificate.issuedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}`,
    `Valid until: ${r.validUntil ?? 'This barangay states no validity period for this certificate.'}`,
    `Fee: ${r.fee > 0 ? `PHP ${r.fee.toFixed(2)}, paid at the barangay hall` : 'No fee'}`,
    '',
    `Attested by: ${office.secretary ?? ''} — Barangay Secretary`,
    `Issued by: ${office.captain ?? ''} — Punong Barangay`,
    '',
    `VERIFICATION CODE: ${r.certificate?.verificationCode ?? ''}`,
    '',
    // The demo assembles this PDF in the browser and cannot embed an image, so
    // no seal is drawn. The real renderer prints it and the console still shows
    // which seal is on file.
    'Demo certificate — generated in your browser, not issued by a barangay.',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== ''))
}

/** Today where the office is, for comparing a stored calendar day against it. */
const officeDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

/** The day a certificate marked ready today would lapse. */
const lapseDay = (days: number | null | undefined) => {
  if (days === null || days === undefined) return null
  const day = new Date()
  day.setDate(day.getDate() + days)
  return day.toLocaleDateString('en-CA')
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

/**
 * Issues the receipt for a settled payment.
 *
 * Done in the same step that settles the payment, as on the real server, so
 * there is no demo state where money landed and nothing says so.
 */
function issueDemoReceipt(target: DemoRequest, resident: DemoUser): DemoReceipt {
  state.receiptCounter += 1
  const year = new Date().getFullYear()
  const prefix = state.municipality.receiptPrefix || 'OR'
  return {
    receiptNo: `${prefix}-${year}-${String(state.receiptCounter).padStart(6, '0')}`,
    verificationCode: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () =>
        '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]
      ).join('')
    ).join('-'),
    issuedAt: new Date().toISOString(),
    issuedTo: resident.fullName,
    issuedToAddress: resident.profile.address ?? null,
    particulars: `${target.serviceName} (${target.referenceNo})`,
    // Copied, not referenced: a later edit must not rewrite a receipt somebody
    // is already holding.
    issuer: { ...state.municipality },
  }
}

function receiptFor(payment: DemoPayment): Blob {
  const r = payment.receipt!
  const money = (payment.amountCentavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  return makePdf([
    'Republic of the Philippines',
    `Province of ${MUNICIPALITY.province}`,
    MUNICIPALITY.name.toUpperCase(),
    r.issuer.address ?? '',
    [r.issuer.phone, r.issuer.email].filter(Boolean).join('  ·  '),
    r.issuer.tin ? `TIN ${r.issuer.tin}` : '',
    '',
    'ELECTRONIC OFFICIAL RECEIPT',
    r.issuer.receiptFormLabel ?? '',
    `Receipt No. ${r.receiptNo}`,
    new Date(r.issuedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    '',
    `Received from: ${r.issuedTo}`,
    r.issuedToAddress ? `Address: ${r.issuedToAddress}` : '',
    `In payment of: ${r.particulars}`,
    '',
    `AMOUNT PAID: PHP ${money}`,
    `Paid through: ${payment.method ?? 'Online payment'}`,
    `Payment reference: ${payment.reference}`,
    '',
    r.issuer.treasurerName ?? '',
    r.issuer.treasurerTitle,
    '',
    `VERIFICATION CODE: ${r.verificationCode}`,
    r.issuer.receiptFooter ?? '',
    '',
    // The demo draws no seal: this PDF is assembled by hand in the browser and
    // cannot embed an image. The real renderer prints it, and the console still
    // shows which seal is on file.
    'Demo receipt — generated in your browser, not issued by an LGU.',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== ''))
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

  // ---- the barangay tier ----
  //
  // Kept apart from the municipal routes exactly as on the server: its own
  // records, its own roles, and a scope that comes from the signed-in account's
  // own barangay rather than anything the caller passes.

  /** Public: the list is needed before anybody has an account. */
  if (parts[0] === 'barangays') {
    if (parts[1] === 'certificates') {
      return {
        status: 200,
        // The shared catalogue only: this endpoint is public and barangay-less,
        // so a barangay's own documents have no business being listed.
        body: certificates()
          .filter((c) => c.barangayId === null && c.active)
          .map((c) => ({ ...c, validityDays: c.validityDays ?? null })),
      }
    }
    return {
      status: 200,
      body: BARANGAYS.map((b) => ({ id: b.id, name: b.name, captain: b.captain })),
    }
  }

  if (parts[0] === 'barangay') {
    const user = need('resident')

    if (parts[1] === 'me') {
      if (method === 'PUT') {
        const chosen = BARANGAYS.find((b) => b.id === body?.barangayId)
        if (!chosen) throw new DemoError(404, 'That barangay is not in this municipality.')
        user.barangayId = chosen.id
        persist()
        return { status: 200, body: { ok: true } }
      }
      const own = BARANGAYS.find((b) => b.id === user.barangayId)
      if (!own) return { status: 200, body: { barangay: null, certificates: [] } }
      return {
        status: 200,
        body: {
          // The hall's details ride along here, because this is the screen that
          // has to answer "come and collect it".
          barangay: { id: own.id, name: own.name, ...barangayOffice(own.id) },
          certificates: certificatesFor(own.id)
            .filter((c) => c.active)
            .map((c) => ({
              ...c, fee: barangayFee(own.id, c.id),
              validityDays: c.validityDays ?? null,
            })),
        },
      }
    }

    // The board of notices on this resident's own barangay. Relevance, not
    // secrecy: their barangay and no other.
    if (parts[1] === 'announcements') {
      if (!user.barangayId) return { status: 200, body: [] }
      return { status: 200, body: liveAnnouncements(user.barangayId) }
    }

    if (parts[1] === 'requests') {
      if (method === 'POST') {
        if (!user.barangayId) throw new DemoError(409, 'Set which barangay you live in first.')
        const type = certificatesFor(user.barangayId)
          .find((c) => c.id === body?.typeId && c.active)
        if (!type) throw new DemoError(404, 'That certificate is not issued here.')
        const purpose = String(body?.purpose ?? '').trim()
        if (purpose.length < 3) throw new DemoError(400, 'Say what it is for.')

        const year = new Date().getFullYear()
        // One counter for the municipality, as on the server.
        const key = `brgy-${year}`
        state.counters[key] = (state.counters[key] ?? 0) + 1
        const now = new Date().toISOString()
        const created: DemoBarangayRequest = {
          id: uid(),
          referenceNo: `BRGY-${year}-${String(state.counters[key]).padStart(5, '0')}`,
          barangayId: user.barangayId,
          residentId: user.id,
          residentName: user.fullName,
          typeId: type.id,
          typeName: type.name,
          purpose,
          // Frozen at the fee in force now, so a later change does not rewrite
          // what this resident was quoted.
          fee: barangayFee(user.barangayId, type.id),
          status: 'pending',
          requestedAt: now,
          updatedAt: now,
          note: null,
          // Nothing has been issued yet, so there is nothing to lapse.
          validUntil: null,
          certificate: null,
        }
        state.barangayRequests.unshift(created)
        persist()
        return {
          status: 201,
          body: {
            id: created.id, referenceNo: created.referenceNo, requestedAt: created.requestedAt,
            status: created.status, typeName: created.typeName, fee: created.fee,
          },
        }
      }
      if (parts[2] && parts[3] === 'certificate' && method === 'GET') {
        const mine = state.barangayRequests.find(
          (r) => r.id === parts[2] && r.residentId === user.id && r.certificate
        )
        if (!mine) {
          throw new DemoError(404, 'No certificate yet. The barangay issues it when the certificate is released.')
        }
        return {
          status: 200,
          blob: barangayCertificateFor(mine),
          fileName: `${mine.typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${mine.referenceNo}.pdf`,
        }
      }

      return {
        status: 200,
        body: state.barangayRequests
          .filter((r) => r.residentId === user.id)
          .map(serializeBarangayRequest),
      }
    }
  }

  // ---- the council's own view ----
  //
  // Its own branch with its own role check, mirroring the server's separate
  // router: a kagawad never reaches the staff branch below, so every route
  // there — including ones added later — refuses them without a filter.
  // Figures, never people.
  if (parts[0] === 'barangay-kagawad') {
    const user = need('barangay_kagawad')
    const own = BARANGAYS.find((b) => b.id === user.barangayId)
    if (!own) throw new DemoError(409, 'This account is not attached to a barangay.')

    if (parts[1] === 'me') {
      const office = barangayOffice(own.id)
      return {
        status: 200,
        body: {
          barangay: { id: own.id, name: own.name, captain: office.captain },
          role: 'barangay_kagawad',
        },
      }
    }

    if (parts[1] === 'summary') {
      const mine = state.barangayRequests.filter((r) => r.barangayId === own.id)
      const count = (status: DemoBarangayRequest['status']) =>
        mine.filter((r) => r.status === status).length
      return {
        status: 200,
        body: {
          barangay: own.name,
          counts: {
            pending: count('pending'), processing: count('processing'), ready: count('ready'),
            released: count('released'), rejected: count('rejected'),
          },
          // Released only — a fee on a pending request is not money the
          // barangay has, and a council budgeting against it would be wrong.
          collected: mine.filter((r) => r.status === 'released')
            .reduce((total, r) => total + r.fee, 0),
        },
      }
    }

    if (parts[1] === 'figures') {
      return { status: 200, body: { barangay: own.name, ...barangayFigures(own.id) } }
    }

    if (parts[1] === 'announcements') {
      return { status: 200, body: liveAnnouncements(own.id) }
    }

    throw new DemoError(404, 'Not found.')
  }

  if (parts[0] === 'barangay-staff') {
    const user = need('barangay_admin', 'barangay_officer')
    const own = BARANGAYS.find((b) => b.id === user.barangayId)
    if (!own) throw new DemoError(409, 'This account is not attached to a barangay.')
    const sealState = () => ({
      hasSeal: Boolean(state.barangaySeals[own.id]),
      sealUpdatedAt: state.barangaySeals[own.id]?.updatedAt ?? null,
    })
    const adminOnly = () => {
      if (user.role !== 'barangay_admin') {
        throw new DemoError(403, 'You do not have access to this area.')
      }
    }

    if (parts[1] === 'me') {
      const office = barangayOffice(own.id)
      return {
        status: 200,
        body: {
          barangay: {
            id: own.id, name: own.name,
            captain: office.captain, secretary: office.secretary,
          },
          role: user.role,
        },
      }
    }

    // ---- the hall's own details ----
    //
    // Both roles read; only the administrator saves. The barangay's *name* is
    // not editable, the same rule that stops a browser naming the municipality.
    if (parts[1] === 'office') {
      if (method === 'PATCH') {
        adminOnly()
        const allowed = ['captain', 'secretary', 'hallAddress', 'officeHours', 'phone', 'email'] as const
        const keys = Object.keys(body ?? {})
        if (keys.length === 0) throw new DemoError(400, 'Nothing to change.')
        if (keys.some((k) => !(allowed as readonly string[]).includes(k))) {
          throw new DemoError(400, 'Unrecognised field.')
        }
        const phone = body?.phone === null ? null : body?.phone ? String(body.phone).trim() : undefined
        if (phone && !/\d/.test(phone)) {
          throw new DemoError(400, 'That phone number is not dialable. Ring it before saving it.')
        }
        // Blank clears it; anything else has to look like an address, as on the
        // server. The demo mirrors the refusals as well as the successes.
        const email = body?.email === null ? null : body?.email ? String(body.email).trim() : undefined
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          throw new DemoError(400, 'Invalid email address.')
        }
        const current = barangayOffice(own.id)
        const next = { ...current }
        for (const key of allowed) {
          if (!(key in (body ?? {}))) continue
          const value = body[key]
          next[key] = value === null || String(value).trim() === '' ? null : String(value).trim()
        }
        state.barangayOffices[own.id] = next
        // Recorded with the row as it was, like the municipal edits: the only
        // defence against a wrong number nobody notices is the old one still
        // being written down.
        state.audit.unshift({
          id: state.audit.length + 1, actorName: user.fullName,
          action: 'barangay_office.update', target: own.id,
          before: current, after: next, createdAt: new Date().toISOString(),
        })
        persist()
        return { status: 200, body: { id: own.id, name: own.name, ...next, ...sealState() } }
      }

      // ---- the barangay's own seal ----
      if (parts[2] === 'seal') {
        if (method === 'PUT') {
          adminOnly()
          if (!file) throw new DemoError(400, 'Choose an image to upload.')
          if (file.size > 2 * 1024 * 1024) {
            throw new DemoError(413, 'That file is too large. The limit is 2 MB.')
          }
          // The declared type is the caller's claim; the bytes are the fact.
          const kind = sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
          if (!kind || (kind.mime !== 'image/png' && kind.mime !== 'image/jpeg')) {
            throw new DemoError(415, 'A seal has to be a PNG or JPEG image — those are the two a certificate can be printed with.')
          }
          state.barangaySeals[own.id] = {
            // Shrunk before it is stored: localStorage will not take 2 MB, and
            // a seal that looks uploaded and vanishes on reload is worse than
            // one that was refused.
            seal: await shrinkToDataUrl(file, 240),
            updatedAt: new Date().toISOString(),
          }
          state.audit.unshift({
            id: state.audit.length + 1, actorName: user.fullName,
            action: 'barangay_seal.update', target: own.id,
            before: { hasSeal: false }, after: { hasSeal: true },
            createdAt: new Date().toISOString(),
          })
          persist()
          return { status: 200, body: { hasSeal: true } }
        }
        if (method === 'GET') {
          const held = state.barangaySeals[own.id]
          if (!held) throw new DemoError(404, 'No seal has been uploaded.')
          return { status: 200, blob: dataUrlToBlob(held.seal, 'image/png') }
        }
        if (method === 'DELETE') {
          adminOnly()
          if (!state.barangaySeals[own.id]) throw new DemoError(404, 'No seal has been uploaded.')
          delete state.barangaySeals[own.id]
          state.audit.unshift({
            id: state.audit.length + 1, actorName: user.fullName,
            action: 'barangay_seal.remove', target: own.id,
            before: { hasSeal: true }, after: { hasSeal: false },
            createdAt: new Date().toISOString(),
          })
          persist()
          return { status: 204 }
        }
        throw new DemoError(404, 'Not found.')
      }

      return {
        status: 200,
        body: { id: own.id, name: own.name, ...barangayOffice(own.id), ...sealState() },
      }
    }

    // A reprint of what was handed over, scoped to this barangay in the same
    // lookup — another barangay's certificate is not found rather than refused.
    if (parts[1] === 'requests' && parts[2] && parts[3] === 'certificate' && method === 'GET') {
      const held = state.barangayRequests.find(
        (r) => r.id === parts[2] && r.barangayId === own.id && r.certificate
      )
      if (!held) throw new DemoError(404, 'No certificate has been released for this request.')
      return {
        status: 200,
        blob: barangayCertificateFor(held),
        fileName: `${held.typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${held.referenceNo}.pdf`,
      }
    }

    if (parts[1] === 'requests' && !parts[2]) {
      const status = query.get('status')
      const open = ['pending', 'processing', 'ready']
      return {
        status: 200,
        body: state.barangayRequests
          .filter((r) => r.barangayId === own.id && (!status || r.status === status))
          // Open first, oldest first within them: the order somebody should work it.
          .sort((a, b) =>
            Number(open.includes(b.status)) - Number(open.includes(a.status)) ||
            a.requestedAt.localeCompare(b.requestedAt)
          )
          .map(serializeBarangayRequest),
      }
    }

    if (parts[1] === 'requests' && parts[2] && method === 'PATCH') {
      const row = state.barangayRequests.find((r) => r.id === parts[2] && r.barangayId === own.id)
      if (!row) throw new DemoError(404, 'Request not found.')
      const next = String(body?.status ?? '')
      const note = body?.note ? String(body.note).trim() : ''
      const allowed: Record<string, string[]> = {
        pending: ['processing', 'rejected'],
        processing: ['ready', 'rejected'],
        ready: ['released', 'rejected'],
        released: [], rejected: [],
      }
      if (next === 'rejected' && !note) {
        throw new DemoError(400, 'Give a reason the resident can read.')
      }
      if (!allowed[row.status]?.includes(next)) {
        throw new DemoError(409, `A request that is ${row.status} cannot be set to ${next}.`)
      }
      row.status = next as DemoBarangayRequest['status']
      if (note) row.note = note
      row.updatedAt = new Date().toISOString()
      // Released is when the barangay has handed the paper over and taken the
      // fee, which is why the copy exists from here and not from `ready`.
      if (next === 'released' && !row.certificate) {
        row.certificate = {
          verificationCode: Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () =>
              '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]
            ).join('')
          ).join('-'),
          issuedAt: new Date().toISOString(),
        }
      }
      // Stamped on `ready`, as on the server: that is when the paper is
      // prepared and dated, and the paper is what an office reads.
      if (next === 'ready') {
        row.validUntil = lapseDay(
          certificateType(row.typeId)?.validityDays ?? null
        )
      }
      const hours = barangayOffice(own.id).officeHours
      notify(
        row.residentId,
        null,
        'barangay_request',
        next === 'rejected'
          ? `${row.referenceNo} — not issued`
          : next === 'ready'
            ? `${row.referenceNo} — ready for pickup`
            : `${row.referenceNo} — ${next}`,
        next === 'ready'
          ? `Your certificate is ready at Barangay ${own.name}. Bring a valid ID.` +
            (hours ? ` Open ${hours}.` : '')
          : next === 'released'
            ? `Your ${row.typeName} has been released. A copy you can show or print is in the app.`
            : note || `Your barangay certificate request is now ${next}.`
      )
      persist()
      return { status: 200, body: { ok: true } }
    }

    // ---- the board of notices ----
    //
    // Posting is both roles'; urgent is the administrator's, because it is the
    // only thing here that reaches a phone.
    if (parts[1] === 'announcements') {
      const mine = () => state.announcements.filter((a) => a.barangayId === own.id)

      if (!parts[2] && method === 'POST') {
        const title = String(body?.title ?? '').trim()
        const text = String(body?.body ?? '').trim()
        if (title.length < 4) throw new DemoError(400, 'Give it a title people can scan.')
        if (text.length < 10) throw new DemoError(400, 'Say what is happening.')
        if (body?.urgent && user.role !== 'barangay_admin') {
          throw new DemoError(403, 'An urgent notice reaches every resident\u2019s phone, so the barangay administrator posts it.')
        }
        if (body?.expiresAt && new Date(body.expiresAt).getTime() < Date.now()) {
          throw new DemoError(400, 'That notice would expire before anybody saw it.')
        }
        const now = new Date().toISOString()
        const notice: DemoAnnouncement = {
          id: uid(), barangayId: own.id,
          kind: (body?.kind ?? 'general') as DemoAnnouncement['kind'],
          title, body: text, urgent: Boolean(body?.urgent),
          expiresAt: body?.expiresAt ? String(body.expiresAt) : null,
          archivedAt: null, postedBy: user.fullName, postedAt: now, updatedAt: now,
        }
        state.announcements.unshift(notice)

        // The fan-out, exactly as the server does it: this barangay's residents,
        // and only for an urgent notice.
        let notified = 0
        if (notice.urgent) {
          for (const resident of state.users) {
            if (resident.role !== 'resident' || resident.barangayId !== own.id || !resident.active) continue
            notify(resident.id, null, 'barangay_announcement',
              `Barangay ${own.name}: ${notice.title}`, notice.body)
            notified++
          }
        }
        persist()
        return { status: 201, body: { ...serializeAnnouncement(notice), notified } }
      }

      if (!parts[2]) {
        const archived = query.get('archived')
        return {
          status: 200,
          body: mine()
            .filter((a) => archived === null ||
              (archived === 'true' ? a.archivedAt !== null : a.archivedAt === null))
            .sort((a, b) =>
              Number(b.archivedAt === null) - Number(a.archivedAt === null) ||
              Number(b.urgent) - Number(a.urgent) ||
              b.postedAt.localeCompare(a.postedAt))
            .map(serializeAnnouncement),
        }
      }

      const notice = state.announcements.find((a) => a.id === parts[2] && a.barangayId === own.id)

      if (method === 'PATCH') {
        if (!notice || notice.archivedAt) {
          throw new DemoError(404, 'Notice not found, or already taken down.')
        }
        if (body?.kind !== undefined) notice.kind = body.kind as DemoAnnouncement['kind']
        if (body?.title !== undefined) notice.title = String(body.title).trim()
        if (body?.body !== undefined) notice.body = String(body.body).trim()
        if ('expiresAt' in (body ?? {})) {
          notice.expiresAt = body.expiresAt ? String(body.expiresAt) : null
        }
        // `urgent` is deliberately not editable: the notification went when it
        // was posted, or it did not.
        notice.updatedAt = new Date().toISOString()
        persist()
        return { status: 200, body: serializeAnnouncement(notice) }
      }

      if (method === 'DELETE') {
        if (user.role !== 'barangay_admin') {
          throw new DemoError(403, 'You do not have access to this area.')
        }
        if (!notice || notice.archivedAt) {
          throw new DemoError(404, 'Notice not found, or already taken down.')
        }
        notice.archivedAt = new Date().toISOString()
        notice.updatedAt = notice.archivedAt
        persist()
        return { status: 200, body: { ok: true } }
      }
    }

    // ---- the register of inhabitants ----
    //
    // The one directory, contained by the barangay boundary exactly as on the
    // server. Members are free text here too — the demo must not teach that a
    // clerk can look up an account.
    if (parts[1] === 'households') {
      const mine = () => state.households.filter((h) => h.barangayId === own.id)
      const member = (m: DemoHouseholdMember) => ({ ...m, age: ageOn(m.birthDate) })
      const summary = (h: DemoHousehold) => ({
        id: h.id, householdNo: h.householdNo, address: h.address, purok: h.purok,
        headName: h.headName, contact: h.contact, status: h.status, statusNote: h.statusNote,
        updatedAt: h.updatedAt, memberCount: h.members.length,
      })
      const adminOnlyHere = () => {
        if (user.role !== 'barangay_admin') {
          throw new DemoError(403, 'You do not have access to this area.')
        }
      }

      // what the register is for
      if (parts[2] === 'figures' && parts[3] === 'summary') {
        return { status: 200, body: { barangay: own.name, ...barangayFigures(own.id) } }
      }

      if (!parts[2] && method === 'POST') {
        const address = String(body?.address ?? '').trim()
        const headName = String(body?.headName ?? '').trim()
        if (address.length < 2) throw new DemoError(400, 'Where is the household?')
        if (headName.length < 2) throw new DemoError(400, 'Who is the head of the household?')
        const key = `hh-${own.id}`
        state.counters[key] = (state.counters[key] ?? 0) + 1
        const household: DemoHousehold = {
          id: uid(), barangayId: own.id, householdNo: state.counters[key]!,
          address, purok: body?.purok ? String(body.purok) : null, headName,
          contact: body?.contact ? String(body.contact) : null,
          notes: body?.notes ? String(body.notes) : null,
          status: 'active', statusNote: null, updatedAt: new Date().toISOString(),
          // The head is a member, so the figures can count them.
          members: [{
            id: uid(), fullName: headName, birthDate: null, sex: null, relationship: 'Head',
            civilStatus: null, occupation: null, isPwd: false, isFourPs: false, isVoter: false,
          }],
        }
        state.households.push(household)
        persist()
        return { status: 201, body: { id: household.id, householdNo: household.householdNo } }
      }

      if (!parts[2]) {
        const status = query.get('status')
        const q = (query.get('q') ?? '').trim().toLowerCase()
        return {
          status: 200,
          body: mine()
            .filter((h) => !status || h.status === status)
            .filter((h) => !q ||
              h.headName.toLowerCase().includes(q) ||
              h.address.toLowerCase().includes(q) ||
              h.members.some((m) => m.fullName.toLowerCase().includes(q)))
            .sort((a, b) => a.status.localeCompare(b.status) || a.householdNo - b.householdNo)
            .map(summary),
        }
      }

      const household = state.households.find((h) => h.id === parts[2] && h.barangayId === own.id)
      if (!household) throw new DemoError(404, 'Household not found.')

      if (!parts[3] && method === 'GET') {
        return {
          status: 200,
          body: { ...summary(household), notes: household.notes, members: household.members.map(member) },
        }
      }

      if (!parts[3] && method === 'PATCH') {
        if (body?.address !== undefined) household.address = String(body.address)
        if (body?.purok !== undefined) household.purok = String(body.purok) || null
        if (body?.headName !== undefined) household.headName = String(body.headName)
        if (body?.contact !== undefined) household.contact = String(body.contact) || null
        if (body?.notes !== undefined) household.notes = String(body.notes) || null
        household.updatedAt = new Date().toISOString()
        persist()
        return { status: 200, body: { ok: true } }
      }

      if (parts[3] === 'status' && method === 'PATCH') {
        adminOnlyHere()
        const next = String(body?.status ?? '')
        const note = body?.statusNote ? String(body.statusNote).trim() : ''
        if (!['active', 'moved', 'archived'].includes(next)) {
          throw new DemoError(400, 'Choose what to set it to.')
        }
        if (next !== 'active' && !note) {
          throw new DemoError(400, 'Say why it is leaving the active register.')
        }
        household.status = next as DemoHousehold['status']
        household.statusNote = note || null
        household.updatedAt = new Date().toISOString()
        persist()
        return { status: 200, body: { ok: true } }
      }

      if (parts[3] === 'members' && !parts[4] && method === 'POST') {
        const fullName = String(body?.fullName ?? '').trim()
        if (fullName.length < 2) throw new DemoError(400, 'Who is it?')
        if (body?.birthDate && new Date(body.birthDate).getTime() > Date.now()) {
          throw new DemoError(400, 'A date of birth cannot be in the future.')
        }
        const added: DemoHouseholdMember = {
          id: uid(), fullName,
          birthDate: body?.birthDate ? String(body.birthDate) : null,
          sex: (body?.sex as DemoHouseholdMember['sex']) ?? null,
          relationship: String(body?.relationship ?? 'Other'),
          civilStatus: body?.civilStatus ? String(body.civilStatus) : null,
          occupation: body?.occupation ? String(body.occupation) : null,
          isPwd: Boolean(body?.isPwd), isFourPs: Boolean(body?.isFourPs), isVoter: Boolean(body?.isVoter),
        }
        household.members.push(added)
        household.updatedAt = new Date().toISOString()
        persist()
        return { status: 201, body: member(added) }
      }

      if (parts[3] === 'members' && parts[4]) {
        const index = household.members.findIndex((m) => m.id === parts[4])
        if (index === -1) throw new DemoError(404, 'Member not found.')
        const existing = household.members[index]!

        if (method === 'DELETE') {
          if (existing.relationship === 'Head') {
            throw new DemoError(409, 'The head is the household. Change who the head is instead of removing them.')
          }
          household.members.splice(index, 1)
          household.updatedAt = new Date().toISOString()
          persist()
          return { status: 200, body: { ok: true } }
        }

        if (method === 'PATCH') {
          if (body?.fullName !== undefined) existing.fullName = String(body.fullName)
          if (body?.birthDate !== undefined) existing.birthDate = String(body.birthDate) || null
          if (body?.sex !== undefined) existing.sex = (body.sex || null) as DemoHouseholdMember['sex']
          if (body?.relationship !== undefined) existing.relationship = String(body.relationship)
          if (body?.civilStatus !== undefined) existing.civilStatus = String(body.civilStatus) || null
          if (body?.occupation !== undefined) existing.occupation = String(body.occupation) || null
          for (const key of ['isPwd', 'isFourPs', 'isVoter'] as const) {
            if (body?.[key] !== undefined) existing[key] = Boolean(body[key])
          }
          household.updatedAt = new Date().toISOString()
          persist()
          return { status: 200, body: member(existing) }
        }
      }
    }

    // ---- the blotter ----
    //
    // Both roles may write and close; only the administrator calls a hearing or
    // records what happened at one, exactly as the server has it.
    if (parts[1] === 'blotter') {
      const mine = () => state.blotter.filter((b) => b.barangayId === own.id)
      const serialize = (b: DemoBlotterEntry) => ({
        id: b.id, referenceNo: b.referenceNo,
        complainant: b.complainant, complainantContact: b.complainantContact,
        respondentContact: b.respondentContact,
        respondent: b.respondent, respondentAddress: b.respondentAddress,
        nature: b.nature, narrative: b.narrative, occurredAt: b.occurredAt,
        status: b.status, outcomeNote: b.outcomeNote,
        recordedAt: b.recordedAt, updatedAt: b.updatedAt, recordedBy: b.recordedBy,
        summonsCount: b.summons.length,
        nextHearing: b.summons.find((x) => x.outcome === 'pending')?.hearingAt ?? null,
      })
      const OPEN = ['recorded', 'mediation']
      const CLOSINGS = ['settled', 'unsettled', 'withdrawn', 'referred']
      const adminOnlyHere = () => {
        if (user.role !== 'barangay_admin') {
          throw new DemoError(403, 'You do not have access to this area.')
        }
      }

      // the captain's upcoming hearings
      if (parts[2] === 'calendar' && parts[3] === 'upcoming') {
        return {
          status: 200,
          body: mine()
            .flatMap((b) => b.summons
              .filter((x) => x.outcome === 'pending')
              .map((x) => ({
                id: x.id, blotterId: b.id, sequence: x.sequence, hearingAt: x.hearingAt,
                venue: x.venue, servedAt: x.servedAt, referenceNo: b.referenceNo,
                complainant: b.complainant, respondent: b.respondent,
              })))
            .sort((a, b) => a.hearingAt.localeCompare(b.hearingAt)),
        }
      }

      if (!parts[2] && method === 'POST') {
        const narrative = String(body?.narrative ?? '').trim()
        if (narrative.length < 20) {
          throw new DemoError(400, 'Write what happened, in a few sentences.')
        }
        if (String(body?.complainant ?? '').trim().length < 2) {
          throw new DemoError(400, 'Who is complaining?')
        }
        if (String(body?.respondent ?? '').trim().length < 2) {
          throw new DemoError(400, 'Who is it against?')
        }
        if (body?.occurredAt && new Date(body.occurredAt).getTime() > Date.now() + 60_000) {
          throw new DemoError(400, 'The incident cannot be in the future.')
        }
        const year = new Date().getFullYear()
        const key = `bltr-${year}`
        state.counters[key] = (state.counters[key] ?? 0) + 1
        const now = new Date().toISOString()
        const entry: DemoBlotterEntry = {
          id: uid(),
          referenceNo: `BLTR-${year}-${String(state.counters[key]).padStart(5, '0')}`,
          barangayId: own.id,
          complainant: String(body.complainant).trim(),
          complainantContact: body.complainantContact ? String(body.complainantContact) : null,
          respondentContact: body.respondentContact ? String(body.respondentContact) : null,
          respondent: String(body.respondent).trim(),
          respondentAddress: body.respondentAddress ? String(body.respondentAddress) : null,
          nature: String(body.nature ?? 'Other'),
          narrative,
          occurredAt: body.occurredAt ? String(body.occurredAt) : null,
          status: 'recorded',
          outcomeNote: null,
          recordedBy: user.fullName,
          recordedAt: now,
          updatedAt: now,
          summons: [],
        }
        state.blotter.unshift(entry)
        persist()
        return { status: 201, body: serialize(entry) }
      }

      if (!parts[2]) {
        const status = query.get('status')
        const q = (query.get('q') ?? '').trim().toLowerCase()
        return {
          status: 200,
          body: mine()
            .filter((b) => (!status || b.status === status))
            .filter((b) => !q || [b.referenceNo, b.complainant, b.respondent]
              .some((v) => v.toLowerCase().includes(q)))
            .sort((a, b) =>
              Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status)) ||
              b.recordedAt.localeCompare(a.recordedAt))
            .map(serialize),
        }
      }

      const entry = state.blotter.find((b) => b.id === parts[2] && b.barangayId === own.id)
      if (!entry) throw new DemoError(404, 'Entry not found.')

      // one entry, with its hearings
      if (!parts[3] && method === 'GET') {
        return { status: 200, body: { ...serialize(entry), summons: entry.summons } }
      }

      if (!parts[3] && method === 'PATCH') {
        const next = String(body?.status ?? '')
        const note = body?.outcomeNote ? String(body.outcomeNote).trim() : ''
        if (!['mediation', ...CLOSINGS].includes(next)) {
          throw new DemoError(400, 'Choose what to set it to.')
        }
        if (CLOSINGS.includes(next) && !note) {
          throw new DemoError(400, 'Say how it ended — the terms agreed, or where it was sent.')
        }
        if (!OPEN.includes(entry.status)) {
          throw new DemoError(409, `This entry is already ${entry.status}. A concluded matter is not reopened here.`)
        }
        entry.status = next as DemoBlotterEntry['status']
        if (note) entry.outcomeNote = note
        entry.updatedAt = new Date().toISOString()
        if (CLOSINGS.includes(next)) {
          for (const s of entry.summons) if (s.outcome === 'pending') s.outcome = 'cancelled'
        }
        persist()
        return { status: 200, body: { ok: true } }
      }

      if (parts[3] === 'summons' && !parts[4] && method === 'POST') {
        adminOnlyHere()
        if (!OPEN.includes(entry.status)) {
          throw new DemoError(409, `This entry is ${entry.status}. Nothing more is called on it.`)
        }
        if (entry.summons.some((s) => s.outcome === 'pending')) {
          throw new DemoError(409, 'There is already a hearing called on this entry. Record what happened at it first.')
        }
        const at = String(body?.hearingAt ?? '')
        if (!at || new Date(at).getTime() < Date.now() - 60_000) {
          throw new DemoError(400, 'A hearing cannot be called for a date that has passed.')
        }
        const summons = {
          id: uid(),
          sequence: entry.summons.length + 1,
          hearingAt: at,
          venue: String(body?.venue ?? 'Barangay hall'),
          note: body?.note ? String(body.note) : null,
          servedAt: null,
          servedNote: null,
          notifiedAt: null as string | null,
          notifyResult: null as string | null,
          outcome: 'pending' as const,
          issuedAt: new Date().toISOString(),
          issuedBy: user.fullName,
        }
        entry.summons.push(summons)
        if (entry.status === 'recorded') entry.status = 'mediation'
        entry.updatedAt = new Date().toISOString()
        // The reminder goes to contacts the barangay typed, never to a matched
        // account — the rule that keeps this book from becoming a lookup. There
        // is no mail or SMS in the demo, so it says what *would* have happened
        // rather than implying something went.
        const reachable = [entry.complainantContact, entry.respondentContact]
          .map((c) => c?.trim()).filter(Boolean)
        summons.notifiedAt = new Date().toISOString()
        summons.notifyResult = reachable.length === 0
          ? 'no contact on file'
          : `${reachable.length} contact${reachable.length > 1 ? 's' : ''} on file — not sent in the demo`
        persist()
        return {
          status: 201,
          body: {
            id: summons.id, sequence: summons.sequence, hearingAt: summons.hearingAt,
            notifyResult: summons.notifyResult,
          },
        }
      }

      if (parts[3] === 'summons' && parts[4] && method === 'PATCH') {
        adminOnlyHere()
        const summons = entry.summons.find((s) => s.id === parts[4])
        if (!summons) throw new DemoError(404, 'Summons not found.')
        const outcome = body?.outcome ? String(body.outcome) : null
        if (!outcome && !body?.servedAt && !body?.servedNote) {
          throw new DemoError(400, 'Nothing to record.')
        }
        if (outcome && summons.outcome !== 'pending') {
          throw new DemoError(409, `That hearing is already recorded as ${summons.outcome}.`)
        }
        if (outcome) summons.outcome = outcome as typeof summons.outcome
        if (body?.servedAt) summons.servedAt = String(body.servedAt)
        if (body?.servedNote) summons.servedNote = String(body.servedNote)
        persist()
        return { status: 200, body: { ok: true } }
      }
    }

    if (parts[1] === 'fees' && !parts[2]) {
      adminOnly()
      return {
        status: 200,
        // Shared plus this barangay's own, never another's.
        body: certificatesFor(own.id)
          .filter((c) => c.active)
          .map((c) => ({ id: c.id, name: c.name, fee: barangayFee(own.id, c.id) })),
      }
    }

    if (parts[1] === 'fees' && parts[2] && method === 'PUT') {
      adminOnly()
      const fee = Number(body?.fee)
      if (!Number.isFinite(fee) || fee < 0 || fee > 10000) {
        throw new DemoError(400, 'Give a fee in pesos, 0 or more.')
      }
      // Scoped: another barangay's own document is not found rather than refused.
      if (!certificatesFor(own.id).some((c) => c.id === parts[2])) {
        throw new DemoError(404, 'No such certificate.')
      }
      const was = barangayFee(own.id, parts[2]!)
      state.barangayFees[own.id] = { ...(state.barangayFees[own.id] ?? {}), [parts[2]!]: fee }
      // Audited, because this changes what a resident is charged and the
      // treasury reconciles against it.
      auditCertificate(user, 'barangay_fee.update', `${own.id}/${parts[2]}`,
        { fee: was, barangay: own.name }, { fee, barangay: own.name })
      persist()
      return { status: 200, body: { ok: true, fee } }
    }

    // ---- this barangay's own certificates ----
    //
    // Shared rows are the municipality's; a barangay may price them and nothing
    // else. Every statement filters on this barangay's own id, so a shared row —
    // or another barangay's — is not found rather than refused.
    if (parts[1] === 'certificates') {
      adminOnly()

      if (!parts[2] && method === 'POST') {
        const input = readCertificateBody(body, false)
        const row: DemoCertificateType = {
          id: certificateId(input.name!), name: input.name!, description: input.description!,
          fee: input.fee!, purposeHint: '', active: true,
          sortOrder: Math.max(0, ...certificates().map((c) => c.sortOrder)) + 1,
          validityDays: input.validityDays ?? null, barangayId: own.id, steps: [],
          attestation: input.attestation ?? null,
        }
        state.certificates.push(row)
        auditCertificate(user, 'certificate.create', row.id, null, serializeCertificate(row))
        persist()
        return { status: 201, body: { ...serializeCertificate(row), own: true } }
      }

      const mineOnly = parts[2]
        ? state.certificates.find((c) => c.id === parts[2] && c.barangayId === own.id)
        : undefined

      if (parts[2] && method === 'PATCH') {
        if (!mineOnly) throw new DemoError(404, 'That is not one of your barangay\u2019s own certificates.')
        const input = readCertificateBody(body, true)
        const before = serializeCertificate(mineOnly)
        if (input.name !== undefined) mineOnly.name = input.name
        if (input.description !== undefined) mineOnly.description = input.description
        if (input.fee !== undefined) mineOnly.fee = input.fee
        if (input.validityDays !== undefined) mineOnly.validityDays = input.validityDays
        if (input.attestation !== undefined) mineOnly.attestation = input.attestation
        auditCertificate(user, 'certificate.update', mineOnly.id, before, serializeCertificate(mineOnly))
        persist()
        return { status: 200, body: { ...serializeCertificate(mineOnly), own: true } }
      }

      if (parts[2] && method === 'DELETE') {
        const restore = query.get('restore') === 'true'
        if (!mineOnly || mineOnly.active === restore) {
          throw new DemoError(404, 'Not found, or already in that state.')
        }
        mineOnly.active = restore
        auditCertificate(
          user, restore ? 'certificate.restore' : 'certificate.withdraw',
          mineOnly.id, null, serializeCertificate(mineOnly)
        )
        persist()
        return { status: 200, body: { ...serializeCertificate(mineOnly), own: true } }
      }

      return {
        status: 200,
        body: certificatesFor(own.id)
          .slice()
          .sort((a, b) =>
            Number(a.barangayId !== null) - Number(b.barangayId !== null) ||
            a.sortOrder - b.sortOrder)
          .map((c) => ({
            ...serializeCertificate(c),
            fee: barangayFee(own.id, c.id),
            own: c.barangayId !== null,
          })),
      }
    }

    if (parts[1] === 'officers') {
      adminOnly()
      const roster = () => state.users
        .filter((u) => u.barangayId === own.id && u.role !== 'resident')
        .map((u) => ({
          id: u.id, fullName: u.fullName, email: u.email, role: u.role, active: u.active,
        }))

      // The roles a barangay may issue. Never barangay_admin: making an
      // administrator stays a municipal act, which is what keeps this from
      // being a way to hand out your own authority.
      const ISSUABLE = ['barangay_officer', 'barangay_kagawad']

      if (!parts[2] && method === 'POST') {
        const email = String(body?.email ?? '').trim()
        const fullName = String(body?.fullName ?? '').trim()
        const role = String(body?.role ?? '')
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DemoError(400, 'Give a real email address.')
        if (fullName.length < 2) throw new DemoError(400, 'Give their name.')
        if (!ISSUABLE.includes(role)) {
          throw new DemoError(400, 'A barangay issues clerks and kagawads. An administrator comes from the municipal hall.')
        }
        if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          throw new DemoError(409, 'That email already has an account.')
        }
        const created: DemoUser = {
          id: uid(), email, password: DEMO_PASSWORD,
          fullName, role: role as DemoUser['role'],
          departments: [], position: null, active: true, notifyEmail: true, notifySms: false,
          barangayId: own.id,
          profile: { philSysId: null, barangay: own.name, municipality: null, province: null, birthDate: null, address: null, phone: null },
          photo: null, photoUpdatedAt: null, programs: [],
        }
        state.users.push(created)
        persist()
        // The real server mails an invitation and the account starts unusable.
        // There is no mail here, so the demo says so rather than implying a
        // link went somewhere — and gives the account the demo password, since
        // an account nobody can sign into teaches nothing.
        return {
          status: 201,
          body: {
            id: created.id, fullName, email, role, active: true, invited: false,
          },
        }
      }

      // Scoped to this barangay and to the issuable roles in one step, so an
      // administrator's row is not found rather than refused.
      const target = parts[2]
        ? state.users.find((u) =>
            u.id === parts[2] && u.barangayId === own.id && ISSUABLE.includes(u.role))
        : undefined

      if (parts[2] && parts[3] === 'deactivate' && method === 'POST') {
        if (parts[2] === user.id) throw new DemoError(409, 'You cannot revoke your own account.')
        if (!target || !target.active) throw new DemoError(404, 'Account not found, or already revoked.')
        target.active = false
        persist()
        return { status: 204, body: null }
      }

      if (parts[2] && parts[3] === 'reactivate' && method === 'POST') {
        if (!target || target.active) throw new DemoError(404, 'Account not found, or already active.')
        target.active = true
        persist()
        return { status: 204, body: null }
      }

      if (parts[2] && parts[3] === 'send-reset' && method === 'POST') {
        if (!target || !target.active) throw new DemoError(404, 'Account not found.')
        // No mail in the demo, and saying it sent would be a lie somebody acts on.
        return { status: 200, body: { sent: false } }
      }

      return { status: 200, body: roster() }
    }

    if (parts[1] === 'summary') {
      adminOnly()
      const mine = state.barangayRequests.filter((r) => r.barangayId === own.id)
      const count = (status: DemoBarangayRequest['status']) =>
        mine.filter((r) => r.status === status).length
      return {
        status: 200,
        body: {
          barangay: own.name,
          counts: {
            pending: count('pending'), processing: count('processing'), ready: count('ready'),
            released: count('released'), rejected: count('rejected'),
          },
          // Released only: a fee on a pending request is not money in the drawer.
          collected: mine
            .filter((r) => r.status === 'released')
            .reduce((total, r) => total + r.fee, 0),
        },
      }
    }
  }

  // ---- incident reports ----
  //
  // The same rules the server enforces: a video over thirty minutes is refused,
  // the queue is the administrator's, and updating one tells the resident.
  if (parts[0] === 'incidents') {
    const user = need('resident')

    if (!parts[1] && method === 'POST') {
      const description = String(body.description ?? '').trim()
      if (description.length < 10) {
        throw new DemoError(400, 'Say what happened, in a sentence or two.')
      }
      const year = new Date().getFullYear()
      state.counters[`incident-${year}`] = (state.counters[`incident-${year}`] ?? 0) + 1
      const incident: DemoIncident = {
        id: uid(),
        referenceNo: `INC-${year}-${String(state.counters[`incident-${year}`]).padStart(5, '0')}`,
        reporterId: user.id,
        reporterName: user.fullName,
        kind: String(body.kind ?? 'other'),
        description,
        location: body.location ? String(body.location) : null,
        status: 'new',
        reportedAt: new Date().toISOString(),
        officeNote: null,
        handledAt: null,
        handledBy: null,
        evidence: [],
      }
      state.incidents.unshift(incident)
      persist()
      return {
        status: 201,
        body: {
          id: incident.id, referenceNo: incident.referenceNo,
          reportedAt: incident.reportedAt, status: incident.status, evidence: [],
        },
      }
    }

    if (!parts[1] && method === 'GET') {
      return {
        status: 200,
        body: state.incidents
          .filter((i) => i.reporterId === user.id)
          .map((i) => ({
            id: i.id, referenceNo: i.referenceNo, kind: i.kind, description: i.description,
            location: i.location, status: i.status, reportedAt: i.reportedAt,
            officeNote: i.officeNote, handledAt: i.handledAt, evidenceCount: i.evidence.length,
          })),
      }
    }

    if (parts[2] === 'evidence' && method === 'POST') {
      const incident = state.incidents.find((i) => i.id === parts[1] && i.reporterId === user.id)
      if (!incident) throw new DemoError(404, 'Report not found.')
      if (incident.status === 'closed' || incident.status === 'resolved') {
        throw new DemoError(409, 'This report is closed and no longer accepts files.')
      }
      if (incident.evidence.length >= 6) throw new DemoError(409, 'At most 6 files per report.')
      if (!file) throw new DemoError(400, 'Choose a photo or video.')
      const duration = Number(body?.durationSeconds)
      const seconds = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null
      if (file.type.startsWith('video/') && seconds !== null && seconds > 30 * 60) {
        throw new DemoError(413, 'Videos can be up to 30 minutes.')
      }
      return asDataUrl(file).then((data) => {
        const stored = {
          id: uid(), contentType: file.type || 'application/octet-stream',
          byteSize: file.size, durationSeconds: seconds,
          uploadedAt: new Date().toISOString(), data,
        }
        incident.evidence.push(stored)
        persist()
        return { status: 201, body: { id: stored.id } }
      })
    }

    throw new DemoError(404, 'Not found.')
  }

  // ---- payments ----
  //
  // The same shape as the server: an intent priced from the request, a separate
  // step that stands in for the provider, and a status the screen polls. The
  // demo has no signature to check — there is no network here to forge one
  // across — but nothing marks a request paid because the browser asked it to.
  if (parts[0] === 'payments') {
    const user = need('resident')

    if (parts[1] === 'intents' && method === 'POST' && !parts[2]) {
      const target = state.requests.find((r) => r.id === body.requestId && r.residentId === user.id)
      if (!target) throw new DemoError(404, 'Request not found.')
      if (target.paid) throw new DemoError(409, 'This request is already paid.')
      if (target.currentStepIndex < 1) {
        throw new DemoError(409, 'Wait for the treasury assessment before paying.')
      }
      if (target.fee <= 0) throw new DemoError(409, 'This request has nothing to pay.')

      // Reused rather than stacked, so a resident who taps twice lands on the
      // same payment instead of leaving the treasury two to reconcile.
      const open = state.payments.find((p) => p.requestId === target.id && p.status === 'pending')
      const payment: DemoPayment = open ?? {
        reference: `PAY-${uid().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
        requestId: target.id,
        residentId: user.id,
        provider: 'mock',
        providerRef: null,
        method: null,
        // The server's figure, read off the request — not anything sent here.
        amountCentavos: Math.round(target.fee * 100),
        status: 'pending',
        createdAt: new Date().toISOString(),
        settledAt: null,
        note: null,
        receipt: null,
      }
      if (!open) {
        payment.providerRef = `mock_${payment.reference}`
        state.payments.push(payment)
        persist()
      }
      return {
        status: 201,
        body: {
          reference: payment.reference,
          amount: payment.amountCentavos / 100,
          provider: 'mock',
          redirectUrl: `${location.origin}/?reference=${payment.reference}`,
          status: payment.status,
        },
      }
    }

    if (parts[1] === 'intents' && parts[2] && method === 'GET') {
      const payment = state.payments.find((p) => p.reference === parts[2] && p.residentId === user.id)
      if (!payment) throw new DemoError(404, 'Payment not found.')
      return {
        status: 200,
        body: {
          reference: payment.reference,
          status: payment.status,
          amount: payment.amountCentavos / 100,
          providerRef: payment.providerRef,
          method: payment.method,
          requestId: payment.requestId,
          note: payment.note,
          receiptNo: payment.receipt?.receiptNo ?? null,
        },
      }
    }

    if (parts[1] === 'mock' && parts[3] === 'complete' && method === 'POST') {
      const payment = state.payments.find((p) => p.reference === parts[2] && p.residentId === user.id)
      if (!payment) throw new DemoError(404, 'Payment not found.')
      // Settling twice is what a retrying gateway does. It must not pay a
      // request twice, here or on the server.
      if (payment.status === 'settled') return { status: 200, body: { delivered: true } }

      const target = state.requests.find((r) => r.id === payment.requestId)
      if (!target) throw new DemoError(404, 'Request not found.')

      payment.status = 'settled'
      payment.settledAt = new Date().toISOString()
      payment.method = typeof body.method === 'string' ? body.method : 'gcash'
      payment.receipt = issueDemoReceipt(target, user)
      target.paid = true
      target.paymentMethod = payment.method ?? undefined
      // The office's clock starts here, as on the real server.
      target.paidAt = new Date().toISOString()
      target.status = 'in_progress'
      target.currentStepIndex = WORKFLOW_STEPS.length - 1
      target.events.push({
        eventType: 'paid',
        note: `Paid ${(payment.amountCentavos / 100).toFixed(2)} via ${payment.method}`,
        createdAt: new Date().toISOString(),
        actorName: user.fullName,
      })
      state.notifications.unshift({
        id: uid(), userId: user.id, requestId: target.id, kind: 'request_paid',
        title: 'Payment received',
        body:
          `We have received ${(payment.amountCentavos / 100).toFixed(2)} for ${target.referenceNo}. ` +
          `Your official receipt ${payment.receipt.receiptNo} is in the app.`,
        readAt: null, createdAt: new Date().toISOString(),
      })
      persist()
      return { status: 200, body: { delivered: true } }
    }

    throw new DemoError(404, 'Not found.')
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
      // The barangay is a row, so a named one has to exist and the name on the
      // profile comes from it — the municipality rule, one tier down.
      const chosenBarangay = body.barangayId
        ? BARANGAYS.find((b) => b.id === body.barangayId)
        : undefined
      if (body.barangayId && !chosenBarangay) {
        throw new DemoError(400, 'That barangay is not in this municipality.')
      }
      const user: DemoUser = {
        id: uid(), email: body.email, password: body.password, fullName: body.fullName,
        role: 'resident', departments: [], position: null, active: true,
        notifyEmail: true, notifySms: false,
        // Stamped from the deployment's own record, never from the request.
        municipalityCode: MUNICIPALITY.code,
        identityKey: identity,
        barangayId: chosenBarangay?.id ?? null,
        profile: {
          philSysId: null, barangay: chosenBarangay?.name ?? body.barangay ?? null,
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

    const receiptPayment = () =>
      state.payments.find((p) => p.requestId === target.id && p.receipt)

    if (!parts[2] && method === 'GET') {
      const paid = receiptPayment()
      return {
        status: 200,
        body: {
          ...serialize(target), events: target.events,
          receiptNo: paid?.receipt?.receiptNo ?? null,
          receiptIssuedAt: paid?.receipt?.issuedAt ?? null,
          receiptCode: paid?.receipt?.verificationCode ?? null,
        },
      }
    }

    if (parts[2] === 'receipt' && method === 'GET') {
      const paid = receiptPayment()
      if (!paid) throw new DemoError(404, 'No receipt has been issued for this request.')
      return {
        status: 200,
        blob: receiptFor(paid),
        fileName: `official-receipt-${paid.receipt!.receiptNo}.pdf`,
      }
    }

    // Paying moved to /payments, where the server prices the intent and only a
    // signed callback settles it. Gone rather than redirected, as on the server.
    if (parts[2] === 'pay' && method === 'POST') {
      throw new DemoError(410, 'Payment has moved. Reload the app and try again.')
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
    // Incident reports, the administrator's queue. Admin only, as on the
    // server: a demo that showed every office these would teach something the
    // real system refuses.
    if (parts[1] === 'incidents') {
      const staff = need('staff', 'admin')
      if (staff.role !== 'admin') throw new DemoError(403, 'Forbidden.')

      if (parts[2] && parts[3] === 'evidence' && parts[4] && method === 'GET') {
        const incident = state.incidents.find((i) => i.id === parts[2])
        const found = incident?.evidence.find((e) => e.id === parts[4])
        if (!found) throw new DemoError(404, 'Evidence not found.')
        return { status: 200, blob: dataUrlToBlob(found.data, found.contentType), fileName: 'evidence' }
      }

      if (parts[2] && method === 'PATCH') {
        const incident = state.incidents.find((i) => i.id === parts[2])
        if (!incident) throw new DemoError(404, 'Report not found.')
        incident.status = body.status
        if (body.note) incident.officeNote = String(body.note)
        incident.handledAt = new Date().toISOString()
        incident.handledBy = staff.fullName
        state.notifications.unshift({
          id: uid(), userId: incident.reporterId, requestId: null, kind: 'incident_updated',
          title: `Report ${incident.referenceNo} — ${incident.status}`,
          body: incident.officeNote ?? `The municipality has marked your report ${incident.status}.`,
          readAt: null, createdAt: new Date().toISOString(),
        })
        persist()
        return { status: 200, body: { ok: true } }
      }

      if (method === 'GET') {
        const wanted = query.get('status')
        const rank = (i: DemoIncident) => (i.status === 'new' || i.status === 'acknowledged' ? 0 : 1)
        return {
          status: 200,
          body: state.incidents
            .filter((i) => !wanted || i.status === wanted)
            .slice()
            .sort((a, b) => rank(a) - rank(b) || a.reportedAt.localeCompare(b.reportedAt))
            .map((i) => ({
              id: i.id, referenceNo: i.referenceNo, kind: i.kind, description: i.description,
              location: i.location, latitude: null, longitude: null, status: i.status,
              reportedAt: i.reportedAt, reportedBy: i.reporterName, officeNote: i.officeNote,
              handledAt: i.handledAt, handledBy: i.handledBy,
              evidence: i.evidence.map((e) => ({
                id: e.id, contentType: e.contentType, byteSize: e.byteSize,
                durationSeconds: e.durationSeconds, uploadedAt: e.uploadedAt,
              })),
            })),
        }
      }
    }

    // The treasurer's book. Scoped the same way the server scopes it: the
    // treasury and admins, and nobody else — a demo that showed every office the
    // payment ledger would teach something the real system refuses.
    // What changed about money, for the office that collects it. Same gate as
    // the payment book, and a read of the audit trail rather than a second
    // record of the same fact.
    if (parts[1] === 'fee-changes' && method === 'GET') {
      if (user.role !== 'admin' && !user.departments.includes('treasury')) {
        throw new DemoError(403, 'Fee changes are the treasury\u2019s to reconcile.')
      }
      const MONEY = [
        'certificate.create', 'certificate.update', 'certificate.withdraw',
        'certificate.restore', 'barangay_fee.update',
      ]
      return { status: 200, body: state.audit.filter((a) => MONEY.includes(a.action)).slice(0, 50) }
    }

    if (parts[1] === 'payments' && method === 'GET') {
      const staff = need('staff', 'admin')
      if (staff.role !== 'admin' && !staff.departments.includes('treasury')) {
        throw new DemoError(403, "The payment book is the treasury's.")
      }
      const from = query.get('from') ?? ''
      const to = query.get('to') ?? ''
      const settled = state.payments
        .filter((p) => p.status === 'settled' && p.settledAt && p.settledAt.slice(0, 10) >= from && p.settledAt.slice(0, 10) <= to)
        .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''))
      const requestFor = (id: string) => state.requests.find((r) => r.id === id)
      return {
        status: 200,
        body: {
          from, to,
          total: settled.reduce((sum, p) => sum + p.amountCentavos, 0) / 100,
          count: settled.length,
          settled: settled.map((p) => ({
            reference: p.reference, provider: p.provider, providerRef: p.providerRef,
            method: p.method, amount: p.amountCentavos / 100, settledAt: p.settledAt,
            requestRef: requestFor(p.requestId)?.referenceNo ?? '—',
            serviceName: requestFor(p.requestId)?.serviceName ?? '—',
            receiptNo: p.receipt?.receiptNo ?? null,
          })),
          // Not limited to the period, as on the server: a payment stuck since
          // last week is exactly what this list exists to surface.
          unsettled: state.payments
            .filter((p) => p.status === 'mismatched' || p.status === 'failed')
            .map((p) => ({
              reference: p.reference, provider: p.provider, providerRef: p.providerRef,
              status: p.status, amount: p.amountCentavos / 100, createdAt: p.createdAt,
              note: p.note, requestRef: requestFor(p.requestId)?.referenceNo ?? '—',
            })),
        },
      }
    }

    if (parts[1] === 'payments' && parts[2] && parts[3] === 'receipt' && method === 'GET') {
      const staff = need('staff', 'admin')
      if (staff.role !== 'admin' && !staff.departments.includes('treasury')) {
        throw new DemoError(403, "The payment book is the treasury's.")
      }
      const paid = state.payments.find((p) => p.reference === parts[2] && p.receipt)
      if (!paid) throw new DemoError(404, 'No receipt was issued for that payment.')
      return {
        status: 200,
        blob: receiptFor(paid),
        fileName: `official-receipt-${paid.receipt!.receiptNo}.pdf`,
      }
    }

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
  if (parts[0] === 'admin' &&
      ['hotlines', 'holidays', 'offices', 'audit', 'certificates', 'municipality'].includes(parts[1] ?? '')) {
    const actor = need('admin')
    const audit = (action: string, target: string, before?: unknown, after?: unknown) => {
      state.audit.unshift({
        id: state.audit.length + 1, actorName: actor.fullName, action, target,
        before: before ?? null, after: after ?? null, createdAt: new Date().toISOString(),
      })
    }

    // ---- what an official receipt says ----
    //
    // The municipality's own name and province are not here: those belong to
    // the register, and the schema stripping an unknown key is what makes the
    // refusal happen rather than a check somebody has to remember.
    if (parts[1] === 'municipality') {
      const shown = () => ({
        code: MUNICIPALITY.code, name: MUNICIPALITY.name, province: MUNICIPALITY.province,
        ...state.municipality,
        hasSeal: state.seal !== null,
        sealUpdatedAt: state.sealUpdatedAt,
      })

      if (!parts[2] && method === 'GET') return { status: 200, body: shown() }

      if (!parts[2] && method === 'PATCH') {
        const allowed = [
          'address', 'phone', 'email', 'website', 'tin', 'treasurerName',
          'treasurerTitle', 'receiptPrefix', 'receiptFormLabel', 'receiptFooter',
        ] as const
        const patch: Partial<DemoMunicipality> = {}
        for (const key of allowed) {
          if (body && key in body) {
            const value = body[key]
            patch[key] = (typeof value === 'string' ? value.trim() : value) || null
          }
        }
        if (Object.keys(patch).length === 0) throw new DemoError(400, 'Nothing to change.')
        if (patch.receiptPrefix !== undefined) {
          if (!patch.receiptPrefix || !/^[A-Z][A-Z0-9-]{0,11}$/.test(patch.receiptPrefix)) {
            throw new DemoError(400, 'Use capital letters, digits and hyphens, starting with a letter.')
          }
        }
        if (patch.treasurerTitle === null) patch.treasurerTitle = 'Municipal Treasurer'
        const before = shown()
        state.municipality = { ...state.municipality, ...patch } as DemoMunicipality
        audit('municipality.update', MUNICIPALITY.code, before, shown())
        persist()
        return { status: 200, body: shown() }
      }

      if (parts[2] === 'seal' && method === 'PUT') {
        if (!file) throw new DemoError(400, 'Choose an image to upload.')
        if (file.size > 2 * 1024 * 1024) {
          throw new DemoError(413, 'That file is too large. The limit is 2 MB.')
        }
        // The declared type is the caller's claim; the bytes are the fact.
        const kind = sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
        if (!kind || (kind.mime !== 'image/png' && kind.mime !== 'image/jpeg')) {
          throw new DemoError(415, 'A seal has to be a PNG or JPEG image — those are the two a receipt can be printed with.')
        }
        const before = shown()
        // Shrunk before it is stored: the real store takes 2 MB and
        // localStorage does not, so the demo downscales rather than accepting
        // an upload that would silently fail to persist.
        state.seal = await shrinkToDataUrl(file, 240)
        state.sealUpdatedAt = new Date().toISOString()
        audit('municipality.seal.update', MUNICIPALITY.code, before, shown())
        persist()
        return { status: 200, body: shown() }
      }

      if (parts[2] === 'seal' && method === 'GET') {
        if (!state.seal) throw new DemoError(404, 'No seal has been uploaded.')
        return { status: 200, blob: dataUrlToBlob(state.seal, 'image/png') }
      }

      if (parts[2] === 'seal' && method === 'DELETE') {
        if (!state.seal) throw new DemoError(404, 'No seal has been uploaded.')
        const before = shown()
        state.seal = null
        state.sealUpdatedAt = null
        audit('municipality.seal.remove', MUNICIPALITY.code, before, shown())
        persist()
        return { status: 200, body: shown() }
      }

      throw new DemoError(404, 'Not found.')
    }

    // ---- the shared certificate catalogue ----
    //
    // The documents every barangay issues. A barangay's own are not here and
    // are not the hall's to edit, which is the mirror of the rule on the other
    // side: each statement filters on barangayId === null.
    if (parts[1] === 'certificates') {
      const sharedOnly = parts[2]
        ? state.certificates.find((c) => c.id === parts[2] && c.barangayId === null)
        : undefined

      if (!parts[2] && method === 'POST') {
        const input = readCertificateBody(body, false)
        const row: DemoCertificateType = {
          id: certificateId(input.name!), name: input.name!, description: input.description!,
          fee: input.fee!, purposeHint: '', active: true,
          sortOrder: Math.max(0, ...certificates().map((c) => c.sortOrder)) + 1,
          validityDays: input.validityDays ?? null, barangayId: null, steps: [],
          attestation: input.attestation ?? null,
        }
        state.certificates.push(row)
        audit('certificate.create', row.id, null, serializeCertificate(row))
        persist()
        return { status: 201, body: serializeCertificate(row) }
      }

      if (parts[2] && method === 'PATCH') {
        if (!sharedOnly) throw new DemoError(404, 'No such certificate in the shared catalogue.')
        const input = readCertificateBody(body, true)
        const before = serializeCertificate(sharedOnly)
        if (input.name !== undefined) sharedOnly.name = input.name
        if (input.description !== undefined) sharedOnly.description = input.description
        if (input.fee !== undefined) sharedOnly.fee = input.fee
        if (input.validityDays !== undefined) sharedOnly.validityDays = input.validityDays
        if (input.attestation !== undefined) sharedOnly.attestation = input.attestation
        audit('certificate.update', sharedOnly.id, before, serializeCertificate(sharedOnly))
        persist()
        return { status: 200, body: serializeCertificate(sharedOnly) }
      }

      if (parts[2] && method === 'DELETE') {
        const restore = query.get('restore') === 'true'
        if (!sharedOnly || sharedOnly.active === restore) {
          throw new DemoError(404, 'Not found, or already in that state.')
        }
        sharedOnly.active = restore
        audit(
          restore ? 'certificate.restore' : 'certificate.withdraw',
          sharedOnly.id, null, serializeCertificate(sharedOnly)
        )
        persist()
        return { status: 200, body: serializeCertificate(sharedOnly) }
      }

      return {
        status: 200,
        body: certificates()
          .filter((c) => c.barangayId === null)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(serializeCertificate),
      }
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

/**
 * An image as a small PNG data URL.
 *
 * Only the demo needs this: the real server stores the bytes it was given, but
 * localStorage would refuse a 2 MB seal, and a seal that looks uploaded and
 * then vanishes on reload is worse than one that was refused. Falls back to the
 * original bytes where canvas cannot decode the file.
 */
async function shrinkToDataUrl(file: File, edge: number): Promise<string> {
  const original = await asDataUrl(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('undecodable'))
      img.src = original
    })
    const scale = Math.min(1, edge / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return original
  }
}

function dataUrlToBlob(dataUrl: string, type: string): Blob {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}
