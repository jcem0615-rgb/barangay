// Catalogue of municipal offices and the services they provide.
//
// The municipality is Malasiqui, Pangasinan — a real town, which makes the
// placeholders below more dangerous rather than less: every office address,
// phone number and email here is invented, and naming a real LGU is exactly what
// makes a resident believe them. Replace all of them with the real ones before
// deploying, or deploy under a name nobody can mistake for their own municipality.
// The API seeds from this file (server/src/seed.ts), and the app reads the
// catalogue back from the server at runtime — this is the authoring source.
import type {
  EmergencyContact, SectoralProgram, ServiceCategory, ServiceCategoryId, ServiceDefinition,
  ServiceStep,
} from '../types'

/**
 * The municipality this deployment serves.
 *
 * One portal, one LGU. Every account is stamped with this at registration —
 * from here, never from anything the browser sent — and sign-in refuses an
 * account stamped with a different one. A neighbouring municipality running its
 * own deployment changes these three fields and nothing else.
 *
 * The code is the identity the database keeps; the name and province are what a
 * resident reads. Changing the code on a live deployment strands every account
 * already registered under the old one, so it is not something to edit casually.
 */
/**
 * The municipality this development copy serves.
 *
 * `code`, `name` and `province` are the register's. Everything below them is
 * what the municipality prints on an official receipt, and **every one of those
 * values is a placeholder** on exactly the same footing as the emergency
 * hotlines: the address is approximate, the telephone number and email are
 * invented, the TIN is not a real one, and the treasurer named has never held
 * the office. They are seeded so a fresh database produces a receipt that looks
 * like a receipt; they are corrected in the Municipality tab, and a real
 * deployment sets them from the environment and never edits this file.
 */
export const MUNICIPALITY = {
  code: 'malasiqui-pangasinan',
  name: 'Malasiqui',
  province: 'Pangasinan',
  address: 'Municipal Hall, Poblacion, Malasiqui, Pangasinan 2421',
  phone: '(075) 632-0000',
  email: 'treasury@malasiqui.gov.ph',
  website: 'malasiqui.gov.ph',
  // Not a real TIN. Replace with the municipality's own before launch.
  tin: '000-000-000-00000',
  treasurerName: 'Aurelio B. Mendoza',
  treasurerTitle: 'Municipal Treasurer',
  receiptPrefix: 'OR',
  // Deliberately empty. A receipt citing an accountable form number this app
  // invented would be worse than one citing none, so nothing is printed until
  // the municipality fills in the form it was actually issued.
  receiptFormLabel: '',
  receiptFooter: 'Keep this receipt. Present it when claiming your document at the counter.',
} as const

/**
 * The barangays of this municipality, and what they issue.
 *
 * A municipality is not the only counter a resident deals with — most of what an
 * ordinary person needs in a year is a barangay clearance or a certificate of
 * indigency, from an office two streets away rather than the municipal hall. The
 * app now covers both tiers, and keeps them apart on screen so nobody has to
 * know which level of government owns what before they can start.
 *
 * **These six are samples.** Malasiqui has dozens of barangays; the real roster
 * is published as PSGC codes and should be loaded from there before deploying,
 * not typed out from memory. The captain and secretary names are placeholders
 * too, and they are printed on every certificate the barangay issues — so they
 * are the first thing to correct.
 *
 * **The hall's own details are seeded here and corrected in the barangay's
 * console**, not by reseeding — the same move the municipal office details made.
 * They are the answer to "come and collect it", which is the one status that
 * asks a resident to travel, so a wrong set of hours costs the trip this app
 * exists to save. Every address, time and number below is invented, exactly like
 * the hotlines: the municipality named on the screen is real, which is precisely
 * why a resident will believe them.
 */
export interface BarangaySeed {
  id: string
  name: string
  captain: string
  secretary: string
  /** Where the hall is, as somebody would be told to find it. */
  hallAddress: string
  /** When it is open. Prose, because a barangay hall's week is not a grid. */
  officeHours: string
  phone: string
  email: string
}

export const BARANGAYS: BarangaySeed[] = [
  { id: 'poblacion', name: 'Poblacion', captain: 'Hon. Ramon T. Agustin', secretary: 'Luzviminda P. Cruz',
    hallAddress: 'Barangay Hall, Mabini St, Poblacion', officeHours: 'Mon–Fri, 8:00am–5:00pm',
    phone: '(075) 632-1180', email: 'poblacion@malasiqui.gov.ph'  },
  { id: 'san-julian', name: 'San Julian', captain: 'Hon. Ernesto B. Dizon', secretary: 'Marites R. Flores',
    hallAddress: 'Barangay Hall, San Julian Road, San Julian', officeHours: 'Mon–Fri, 8:00am–5:00pm',
    phone: '(075) 632-1184', email: 'sanjulian@malasiqui.gov.ph'  },
  { id: 'nalsian', name: 'Nalsian', captain: 'Hon. Teresita M. Ramos', secretary: 'Allan G. Sison',
    hallAddress: 'Barangay Hall, Nalsian Centro', officeHours: 'Mon–Fri, 8:00am–5:00pm',
    phone: '(075) 632-1188', email: 'nalsian@malasiqui.gov.ph'  },
  { id: 'tolonguat', name: 'Tolonguat', captain: 'Hon. Benigno S. Padilla', secretary: 'Cecilia V. Mendoza',
    hallAddress: 'Barangay Hall, Tolonguat Proper', officeHours: 'Mon–Fri, 8:00am–12:00nn and 1:00–5:00pm',
    phone: '0917 845 2210', email: 'tolonguat@malasiqui.gov.ph'  },
  { id: 'cabatling', name: 'Cabatling', captain: 'Hon. Alfredo C. Bautista', secretary: 'Rosalinda T. Garcia',
    hallAddress: 'Barangay Hall, Cabatling', officeHours: 'Mon–Fri, 8:00am–5:00pm; Sat, 8:00am–12:00nn',
    phone: '0917 845 2214', email: 'cabatling@malasiqui.gov.ph'  },
  { id: 'bacundao-weste', name: 'Bacundao Weste', captain: 'Hon. Lourdes A. Navarro', secretary: 'Dante E. Ocampo',
    hallAddress: 'Barangay Hall, Bacundao Weste', officeHours: 'Mon–Fri, 8:00am–5:00pm',
    phone: '0917 845 2218', email: 'bacundaoweste@malasiqui.gov.ph'  },
]

/**
 * What a barangay issues.
 *
 * One catalogue shared by every barangay rather than a per-barangay editable
 * set: a barangay clearance is the same document in all of them, and letting six
 * offices each invent their own would make a resident's certificate depend on
 * which street they live on. Fees are the one thing that genuinely varies, so
 * they are the one thing a barangay can override.
 *
 * **`validityDays` is how long the document is honoured once it is issued**, and
 * it is as much a placeholder as the fees. Nothing in law sets most of these —
 * what a bank or an employer accepts is practice, and practice differs — so a
 * deployment sets each one from what its own offices actually ask for. Leaving it
 * out means the barangay states no validity, which the screen says in those words
 * rather than implying the certificate lasts forever.
 */
export interface BarangayCertificateType {
  id: string
  name: string
  description: string
  /** Default fee in pesos; a barangay may set its own. 0 is free, and common. */
  fee: number
  /** What the resident has to say before it can be issued. */
  purposeHint: string
  /**
   * How long it is good for once issued. Omitted where the barangay states no
   * period — a different thing from forever, and said so on screen.
   */
  validityDays?: number
  /** How to get it, in order. */
  steps: ServiceStep[]
  /**
   * What the certificate says, as the barangay says it.
   *
   * Paragraphs separated by a blank line. The renderer fills `{name}`,
   * `{residence}`, `{barangay}`, `{municipality}`, `{province}`, `{purpose}`
   * and `{date}`, and refuses to save anything else — a placeholder the
   * renderer cannot fill would print as literal braces on an official document.
   *
   * **English only, deliberately.** `steps` carries a required Filipino because
   * a step is an instruction a resident has to follow; this is the text of the
   * document itself, which is issued in English at a Philippine barangay
   * counter exactly as "Cedula" and "Building Permit" are said in English. A
   * certificate whose attestation and whose name were in different languages
   * would be the odd one out.
   *
   * Omitted leaves the generic sentence, which is what a certificate added in a
   * console gets until somebody writes one.
   *
   * **Every text below is placeholder content**, on the same footing as the
   * hotlines and the document routes: a careful reading of how these are
   * ordinarily worded, not any municipality's own form. The one with a real
   * legal source is the first-time jobseeker certificate's reference to RA
   * 11261. Reconcile them with each barangay's actual form before launch — the
   * certificate goes out over the Punong Barangay's name.
   */
  attestation?: string
}

export const BARANGAY_CERTIFICATES: BarangayCertificateType[] = [
  {
    id: 'clearance',
    name: 'Barangay Clearance',
    description: 'The one almost everything else asks for first — employment, a permit, a bank.',
    fee: 50,
    purposeHint: 'e.g. local employment, bank requirement',
    /** Six months is what most employers and banks here will accept; past that they ask for a fresh one. */
    validityDays: 180,
    attestation:
      'This is to certify that {name} is a bona fide resident of {residence}, Municipality of {municipality}, Province of {province}.\n\nThis further certifies that, based on the records of this barangay, the above-named person has no pending case or derogatory record filed before this office as of the date of issue.\n\nIssued this {date} upon the request of the above-named person for {purpose}.',
    steps: [
      {
        label: 'Be a resident of this barangay',
        where: 'Your barangay',
        note: 'The barangay checks this against its own records at the counter.',
        fil: { label: 'Taga-barangay na ito', where: 'Sa barangay mo', note: 'Itinatapat ito ng barangay sa sarili nitong tala sa counter.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Say what it is for',
        where: 'On the next screen',
        note: 'The purpose is written on the certificate, so it has to match what you will use it for.',
        fil: { label: 'Sabihin kung para saan ito', where: 'Sa susunod na screen', note: 'Nakasulat sa sertipiko ang layunin, kaya dapat tugma ito sa pagkakagamitan mo.' },
      },
      {
        label: 'Collect and pay at the barangay hall',
        where: 'Your barangay',
        fil: { label: 'Kunin at bayaran sa barangay hall', where: 'Sa barangay mo' },
      },
    ],
  },
  {
    id: 'residency',
    name: 'Certificate of Residency',
    description: 'Proof that you live in this barangay, and for how long.',
    fee: 30,
    purposeHint: 'e.g. school enrolment, PhilHealth',
    /** Says where you live, and that changes — so it is read as a recent statement rather than a permanent one. */
    validityDays: 180,
    attestation:
      'This is to certify that {name} is a bona fide resident of {residence}, Municipality of {municipality}, Province of {province}, and is known to this office as an actual resident of this barangay.\n\nIssued this {date} upon the request of the above-named person for {purpose}.',
    steps: [
      {
        label: 'Be a resident of this barangay',
        where: 'Your barangay',
        note: 'Some barangays ask how long you have lived there, so know the date you moved in.',
        fil: { label: 'Taga-barangay na ito', where: 'Sa barangay mo', note: 'May mga barangay na nagtatanong kung gaano ka na katagal doon, kaya alamin ang petsa ng paglipat mo.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Say what it is for',
        where: 'On the next screen',
        fil: { label: 'Sabihin kung para saan ito', where: 'Sa susunod na screen' },
      },
      {
        label: 'Collect and pay at the barangay hall',
        where: 'Your barangay',
        fil: { label: 'Kunin at bayaran sa barangay hall', where: 'Sa barangay mo' },
      },
    ],
  },
  {
    id: 'indigency',
    name: 'Certificate of Indigency',
    description: 'For assistance that is means-tested — medical, burial, educational.',
    // Free everywhere, and it should be: charging for proof of poverty is the
    // kind of thing this certificate exists to relieve.
    fee: 0,
    purposeHint: 'e.g. hospital bill, DSWD assistance',
    /** The shortest of these on purpose: it states a household's circumstances, which an office will want stated recently. */
    validityDays: 90,
    attestation:
      'This is to certify that {name} is a bona fide resident of {residence}, Municipality of {municipality}, Province of {province}.\n\nThis further certifies that the above-named person belongs to an indigent family of this barangay and has no sufficient means to meet the expense for which this certification is sought.\n\nIssued this {date} upon the request of the above-named person for {purpose}.',
    steps: [
      {
        label: 'Be a resident of this barangay',
        where: 'Your barangay',
        fil: { label: 'Taga-barangay na ito', where: 'Sa barangay mo' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Say what it is for',
        where: 'On the next screen',
        note: 'Name the assistance you are applying for — the office receiving it will look for that.',
        fil: { label: 'Sabihin kung para saan ito', where: 'Sa susunod na screen', note: 'Pangalanan ang tulong na inaaplayan mo — iyon ang hahanapin ng tanggapang tatanggap nito.' },
      },
      {
        label: 'Collect it at the barangay hall',
        where: 'Your barangay',
        note: 'Free. A barangay may not charge for proof of poverty.',
        fil: { label: 'Kunin ito sa barangay hall', where: 'Sa barangay mo', note: 'Libre. Hindi puwedeng singilin ng barangay ang patunay ng kahirapan.' },
      },
    ],
  },
  {
    id: 'business-clearance',
    name: 'Barangay Business Clearance',
    description: 'Required before the municipal business permit — the BOSS asks for it.',
    fee: 100,
    purposeHint: 'e.g. new sari-sari store, renewal',
    /** Tied to the permit year, because this is what the municipal business permit asks for. */
    validityDays: 365,
    attestation:
      'This is to certify that {name}, a resident of {residence}, has been granted clearance by this barangay to operate a business within the territorial jurisdiction of Barangay {barangay}, Municipality of {municipality}, Province of {province}.\n\nThis clearance is issued without prejudice to the requirements of the Municipal Government and is subject to compliance with all barangay ordinances.\n\nIssued this {date} for {purpose}.',
    steps: [
      {
        label: 'Be a resident, or have the business located in this barangay',
        where: 'Your barangay',
        fil: { label: 'Taga-rito ka, o nasa barangay na ito ang negosyo', where: 'Sa barangay mo' },
      },
      {
        label: 'Proof of the business address',
        where: 'Your lease contract or land title',
        fil: { label: 'Patunay ng address ng negosyo', where: 'Kontrata sa upa o titulo ng lupa mo' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Collect and pay at the barangay hall',
        where: 'Your barangay',
        note: 'Get this before the municipal business permit — the BOSS will ask for it.',
        fil: { label: 'Kunin at bayaran sa barangay hall', where: 'Sa barangay mo', note: 'Kunin ito bago ang business permit sa munisipyo — hihingin ito ng BOSS.' },
      },
    ],
  },
  {
    id: 'good-moral',
    name: 'Certificate of Good Moral Character',
    description: 'Usually for a school, a scholarship, or a first job.',
    fee: 30,
    purposeHint: 'e.g. scholarship application',
    /** Same reading as the clearance — a statement about now, not a record of character. */
    validityDays: 180,
    attestation:
      'This is to certify that {name} is a bona fide resident of {residence}, Municipality of {municipality}, Province of {province}.\n\nThis further certifies that, based on the records of this barangay and to the knowledge of this office, the above-named person is of good moral character and has not been involved in any act contrary to law, public order or good custom within this barangay.\n\nIssued this {date} upon the request of the above-named person for {purpose}.',
    steps: [
      {
        label: 'Be a resident of this barangay',
        where: 'Your barangay',
        note: 'The barangay will check its blotter, so this is not issued on the spot everywhere.',
        fil: { label: 'Taga-barangay na ito', where: 'Sa barangay mo', note: 'Titingnan ng barangay ang blotter nito, kaya hindi ito agad-agad ibinibigay sa lahat ng lugar.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Say what it is for',
        where: 'On the next screen',
        fil: { label: 'Sabihin kung para saan ito', where: 'Sa susunod na screen' },
      },
      {
        label: 'Collect and pay at the barangay hall',
        where: 'Your barangay',
        fil: { label: 'Kunin at bayaran sa barangay hall', where: 'Sa barangay mo' },
      },
    ],
  },
  {
    id: 'first-time-jobseeker',
    name: 'First Time Jobseeker Certificate',
    description: 'Under RA 11261, which also makes it free and waives other fees.',
    fee: 0,
    purposeHint: 'e.g. first employment requirements',
    /** RA 11261 gives the certificate a year, and it may be availed of once. The year is in the law; the one-time rule is not enforced here. */
    validityDays: 365,
    attestation:
      'This is to certify that {name} is a bona fide resident of {residence}, Municipality of {municipality}, Province of {province}, for at least six (6) months prior to the date of issue.\n\nThis further certifies that the above-named person is a first-time jobseeker, and that this certification is issued pursuant to Republic Act No. 11261, the First Time Jobseekers Assistance Act of 2019, for the purpose of availing of the exemption from the fees and charges provided therein.\n\nUnder the same Act this certification is valid for one (1) year from the date of issue and may be availed of only once.\n\nIssued this {date} for {purpose}.',
    steps: [
      {
        label: 'Be a resident of this barangay for at least six months',
        where: 'Your barangay',
        note: 'RA 11261 sets the residency period, not the barangay.',
        fil: { label: 'Taga-barangay na ito nang hindi bababa sa anim na buwan', where: 'Sa barangay mo', note: 'Ang RA 11261 ang nagtatakda ng haba ng paninirahan, hindi ang barangay.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Say what it is for',
        where: 'On the next screen',
        fil: { label: 'Sabihin kung para saan ito', where: 'Sa susunod na screen' },
      },
      {
        label: 'Collect it at the barangay hall',
        where: 'Your barangay',
        note: 'Free by law, and it waives the fees on the documents you need for that first job.',
        fil: { label: 'Kunin ito sa barangay hall', where: 'Sa barangay mo', note: 'Libre ayon sa batas, at inaalis nito ang bayad sa mga dokumentong kailangan mo para sa unang trabahong iyon.' },
      },
    ],
  },
]

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: 'bpls',
    name: 'Business Permits (BOSS)',
    officeName: 'Business One-Stop Shop',
    description: 'Apply, assess taxes, and pay for your business permit',
    icon: 'store',
    address: 'Municipal Hall, Poblacion, Malasiqui — Ground Floor, BOSS counter',
    hours: 'Monday to Friday, 8:00 AM – 5:00 PM (no noon break)',
    phone: '(075) 961-2345',
    email: 'boss@malasiqui.gov.ph',
    headTitle: 'Business Permits and Licensing Officer',
  },
  {
    id: 'cswdo',
    name: 'Social Welfare',
    officeName: 'Municipal Social Welfare & Development Office',
    description: 'Financial aid, Senior Citizen and PWD ID',
    icon: 'hand-heart',
    address: 'Municipal Hall, Poblacion, Malasiqui — Second Floor, CSWDO',
    hours: 'Monday to Friday, 8:00 AM – 5:00 PM',
    phone: '(075) 961-2350',
    email: 'cswdo@malasiqui.gov.ph',
    headTitle: 'Municipal Social Welfare and Development Officer',
  },
  {
    id: 'lcr',
    name: 'Civil Registrar',
    officeName: 'Office of the Local Civil Registrar',
    description: 'Birth, marriage, and death certificates',
    icon: 'scroll-text',
    address: 'Municipal Hall, Poblacion, Malasiqui — Ground Floor, Civil Registry',
    hours: 'Monday to Friday, 8:00 AM – 5:00 PM (no noon break)',
    phone: '(075) 961-2338',
    email: 'lcr@malasiqui.gov.ph',
    headTitle: 'Municipal Civil Registrar',
  },
  {
    id: 'treasury',
    name: "Treasurer's Office",
    officeName: "Municipal Treasurer's Office",
    description: 'Cedula, real property tax, and tax clearance',
    icon: 'coins',
    address: 'Municipal Hall, Poblacion, Malasiqui — Ground Floor, Treasury',
    hours: 'Monday to Friday, 8:00 AM – 5:00 PM (no noon break)',
    phone: '(075) 961-2320',
    email: 'treasury@malasiqui.gov.ph',
    headTitle: 'Municipal Treasurer',
  },
  {
    id: 'obo',
    name: 'Building & Zoning',
    officeName: 'Office of the Building Official',
    description: 'Building, occupancy, and locational clearances',
    icon: 'hard-hat',
    address: 'Municipal Hall, Poblacion, Malasiqui — Third Floor, Engineering',
    hours: 'Monday to Friday, 8:00 AM – 5:00 PM',
    phone: '(075) 961-2361',
    email: 'obo@malasiqui.gov.ph',
    headTitle: 'Municipal Building Official',
  },
  {
    id: 'health',
    name: 'Health Office',
    officeName: 'Municipal Health Office',
    description: 'Health certificates and sanitary permits',
    icon: 'stethoscope',
    address: 'Rural Health Unit I, Barangay Sto. Niño',
    hours: 'Monday to Saturday, 7:00 AM – 4:00 PM',
    phone: '(075) 961-2377',
    email: 'health@malasiqui.gov.ph',
    headTitle: 'Municipal Health Officer',
  },
]

// Resolves the office that handles a request, so residents can see which
// department is working on it.
export function findCategory(id: ServiceCategoryId): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.id === id)
}

/**
 * The service catalogue.
 *
 * **The `steps` on each service are placeholder content, like the hotlines and
 * the holiday calendar.** They are a careful reading of how these documents are
 * ordinarily obtained in a Philippine municipality, and they are not this
 * municipality's Citizen's Charter. The whole point of the guide is to stop a
 * resident making a wasted trip, so a step list that is wrong about what comes
 * first does the exact harm the feature exists to prevent — and it does it with
 * the municipality's name on the screen, which is what makes a resident believe
 * it. Check every chain against the office's own charter before launch, and
 * re-check whenever a requirement changes.
 */
export const SERVICES: ServiceDefinition[] = [
  {
    id: 'boss-application',
    categoryId: 'bpls',
    name: 'BOSS Business Permit Application',
    shortDescription: 'One-Stop Shop application for a new or renewed business permit.',
    processingTime: '3–5 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 2850,
    requiresPayment: true,
    requirements: ['DTI / SEC registration', 'Barangay Business Clearance', 'Lease contract or land title', 'Fire Safety Inspection Certificate'],
    searchTerms: ['business permit', 'mayor’s permit', 'negosyo', 'sari-sari store', 'tindahan', 'new business', 'renewal', 'business registration', 'permit sa negosyo'],
    steps: [
      {
        label: 'Barangay Business Clearance',
        where: 'Your barangay',
        certificateId: 'business-clearance',
        note: 'The barangay has to clear the location before the municipality will look at the permit.',
        fil: { label: 'Barangay Business Clearance', where: 'Sa barangay mo', note: 'Kailangan munang aprubahan ng barangay ang lokasyon bago titingnan ng munisipyo ang permit.' },
      },
      {
        label: 'DTI registration (sole proprietor) or SEC registration (corporation or partnership)',
        where: 'DTI / SEC — not the municipality',
        note: 'Register the business name nationally first. The municipality licenses the business; it does not name it.',
        fil: { label: 'DTI registration (kung ikaw lang ang may-ari) o SEC registration (kung korporasyon o partnership)', where: 'DTI / SEC — hindi sa munisipyo', note: 'Irehistro muna ang pangalan ng negosyo sa pambansang tanggapan. Ang munisipyo ang nagbibigay ng lisensya sa negosyo; hindi ito ang nagpapangalan nito.' },
      },
      {
        label: 'Lease contract, or land title if you own the place',
        where: 'Your lessor, or the Registry of Deeds',
        fil: { label: 'Kontrata sa upa, o titulo ng lupa kung ikaw ang may-ari', where: 'Sa nagpapaupa, o sa Registry of Deeds' },
      },
      {
        label: 'Fire Safety Inspection Certificate',
        where: 'Bureau of Fire Protection',
        note: 'Issued after an inspection, so book it early — this is the step most often waited on.',
        fil: { label: 'Fire Safety Inspection Certificate', where: 'Bureau of Fire Protection', note: 'Ibinibigay ito pagkatapos ng inspeksyon, kaya maaga pa lang ay magpaiskedyul na — ito ang hakbang na madalas pinakamatagal hintayin.' },
      },
      {
        label: 'Sanitary Permit',
        where: 'Municipal Health Office',
        serviceId: 'sanitary-permit',
        onlyIf: 'you will handle food or drink',
        fil: { label: 'Sanitary Permit', where: 'Municipal Health Office', onlyIf: 'may pagkain o inumin ang hahawakan mo' },
      },
      {
        label: 'File the application here',
        where: 'Business Permits (BOSS)',
        fil: { label: 'Dito isumite ang aplikasyon', where: 'Business Permits (BOSS)' },
      },
    ],
    fields: [
      { id: 'businessName', label: 'Business name', type: 'text', placeholder: 'e.g. Santos Sari-Sari Store', required: true },
      { id: 'businessType', label: 'Application type', type: 'select', options: ['New Business', 'Renewal'], required: true },
      { id: 'lineOfBusiness', label: 'Line of business', type: 'select', options: ['Retail / Sari-Sari Store', 'Food & Beverage', 'Services', 'Wholesale / Trading', 'Manufacturing', 'Other'], required: true },
      { id: 'capitalization', label: 'Capitalization (₱)', type: 'number', placeholder: 'e.g. 150000', required: true },
      { id: 'businessAddress', label: 'Business address', type: 'textarea', required: true },
    ],
  },
  {
    id: 'aics-application',
    categoryId: 'cswdo',
    name: 'Financial Assistance (AICS)',
    shortDescription: 'Assistance to Individuals in Crisis Situations — medical, burial, or transport aid.',
    processingTime: '5–7 working days',
    processingDaysMin: 5,
    processingDaysMax: 7,
    fee: 0,
    requiresPayment: false,
    requirements: ['Valid government ID', 'Certificate of Indigency', 'Case-specific proof (medical abstract, death certificate, etc.)'],
    searchTerms: ['ayuda', 'financial assistance', 'tulong', 'medical assistance', 'burial assistance', 'libing', 'pamasahe', 'crisis', 'AICS', 'cash aid'],
    steps: [
      {
        label: 'Certificate of Indigency',
        where: 'Your barangay',
        certificateId: 'indigency',
        note: 'Free, and free by law — a barangay may not charge for proof of poverty.',
        fil: { label: 'Certificate of Indigency', where: 'Sa barangay mo', note: 'Libre, at libre ayon sa batas — hindi puwedeng singilin ng barangay ang patunay ng kahirapan.' },
      },
      {
        label: 'Proof of what happened',
        where: 'The hospital, funeral home, or clinic',
        note: 'A medical abstract, a billing statement, a death certificate — whatever matches what you are asking help for.',
        fil: { label: 'Patunay ng nangyari', where: 'Sa ospital, punerarya, o klinika', note: 'Medical abstract, billing statement, death certificate — kung alin man ang tugma sa hinihinging tulong.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'File the application here',
        where: 'Social Welfare (CSWDO)',
        fil: { label: 'Dito isumite ang aplikasyon', where: 'Social Welfare (CSWDO)' },
      },
    ],
    fields: [
      { id: 'assistanceType', label: 'Type of assistance', type: 'select', options: ['Medical Assistance', 'Burial Assistance', 'Transportation Assistance', 'Food Assistance'], required: true },
      { id: 'amountRequested', label: 'Amount requested (₱)', type: 'number', placeholder: 'e.g. 5000', required: true },
      { id: 'situation', label: 'Briefly describe your situation', type: 'textarea', required: true },
    ],
  },
  {
    id: 'senior-pwd-id',
    categoryId: 'cswdo',
    name: 'Senior Citizen / PWD ID',
    shortDescription: 'New ID issuance or renewal for Senior Citizens and Persons with Disability.',
    processingTime: '7–10 working days',
    processingDaysMin: 7,
    processingDaysMax: 10,
    fee: 0,
    requiresPayment: false,
    requirements: ['Valid government ID', 'Birth certificate or proof of age', 'Medical certificate (for PWD)', '1x1 ID photo'],
    searchTerms: ['senior citizen', 'matanda', 'PWD', 'person with disability', 'may kapansanan', 'discount card', 'OSCA', 'senior ID'],
    steps: [
      {
        label: 'Birth certificate, or any document proving your age',
        where: 'Local Civil Registrar',
        serviceId: 'birth-certificate',
        fil: { label: 'Birth certificate, o anumang dokumentong nagpapatunay ng edad mo', where: 'Local Civil Registrar' },
      },
      {
        label: 'Medical certificate stating the disability',
        where: 'A licensed physician',
        onlyIf: 'you are applying as a person with disability',
        fil: { label: 'Medical certificate na nagsasaad ng kapansanan', where: 'Sa lisensyadong doktor', onlyIf: 'nag-aaplay ka bilang person with disability' },
      },
      {
        label: 'One 1x1 ID photo',
        where: 'Any photo shop',
        fil: { label: 'Isang 1x1 na ID picture', where: 'Sa kahit anong photo shop' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'File the application here',
        where: 'Social Welfare (CSWDO)',
        note: 'Free. A senior citizen or PWD ID is never sold.',
        fil: { label: 'Dito isumite ang aplikasyon', where: 'Social Welfare (CSWDO)', note: 'Libre. Hindi kailanman ipinagbibili ang senior citizen o PWD ID.' },
      },
    ],
    fields: [
      { id: 'idType', label: 'ID type', type: 'select', options: ['Senior Citizen ID', 'PWD ID'], required: true },
      { id: 'applicationKind', label: 'Application kind', type: 'select', options: ['New Application', 'Renewal', 'Lost ID Replacement'], required: true },
      { id: 'disabilityType', label: 'Type of disability (if PWD)', type: 'text', placeholder: 'Leave blank if applying for Senior Citizen ID', required: false },
    ],
  },
  {
    id: 'birth-certificate',
    categoryId: 'lcr',
    name: 'Birth Certificate (PSA)',
    shortDescription: 'Certified true copy of registered birth record.',
    processingTime: '3–5 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 155,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Complete name and date of birth of registrant'],
    searchTerms: ['birth certificate', 'birth cert', 'kapanganakan', 'PSA birth', 'NSO', 'born', 'live birth'],
    steps: [
      {
        label: "The registrant's complete name and date of birth",
        where: 'Write it exactly as it was registered',
        note: 'A middle name spelled differently from the register is the usual reason a copy comes back not found.',
        fil: { label: 'Buong pangalan at petsa ng kapanganakan ng nakarehistro', where: 'Isulat nang eksakto kung paano ito nakarehistro', note: 'Ang maling baybay ng gitnang apelyido ang karaniwang dahilan kung bakit hindi makita ang kopya.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Request it here',
        where: 'Local Civil Registrar',
        fil: { label: 'Dito ito hingin', where: 'Local Civil Registrar' },
      },
    ],
    fields: [
      { id: 'registrantName', label: 'Full name of registrant', type: 'text', required: true },
      { id: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { id: 'placeOfBirth', label: 'Place of birth', type: 'text', placeholder: 'City / Municipality, Province', required: true },
      { id: 'copies', label: 'Number of copies', type: 'number', placeholder: 'e.g. 2', required: true },
    ],
  },
  {
    id: 'marriage-certificate',
    categoryId: 'lcr',
    name: 'Marriage Certificate (PSA)',
    shortDescription: 'Certified true copy of registered marriage record.',
    processingTime: '3–5 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 155,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Full names of both spouses and date of marriage'],
    searchTerms: ['marriage certificate', 'kasal', 'marriage cert', 'PSA marriage', 'wedding'],
    steps: [
      {
        label: 'Full names of both spouses and the date of marriage',
        where: 'Write them as they were registered',
        fil: { label: 'Buong pangalan ng mag-asawa at petsa ng kasal', where: 'Isulat ang mga ito kung paano nakarehistro' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Request it here',
        where: 'Local Civil Registrar',
        fil: { label: 'Dito ito hingin', where: 'Local Civil Registrar' },
      },
    ],
    fields: [
      { id: 'spouse1', label: "Spouse 1 full name", type: 'text', required: true },
      { id: 'spouse2', label: "Spouse 2 full name", type: 'text', required: true },
      { id: 'dateOfMarriage', label: 'Date of marriage', type: 'date', required: true },
      { id: 'copies', label: 'Number of copies', type: 'number', placeholder: 'e.g. 2', required: true },
    ],
  },
  {
    id: 'death-certificate',
    categoryId: 'lcr',
    name: 'Death Certificate (PSA)',
    shortDescription: 'Certified true copy of registered death record.',
    processingTime: '3–5 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 155,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Full name of deceased and date of death', 'Proof of relationship to the deceased'],
    searchTerms: ['death certificate', 'namatay', 'death cert', 'PSA death', 'burial papers'],
    steps: [
      {
        label: 'Full name of the deceased and the date of death',
        where: 'Write it as it was registered',
        fil: { label: 'Buong pangalan ng yumao at petsa ng pagkamatay', where: 'Isulat ito kung paano nakarehistro' },
      },
      {
        label: 'Proof that you are related to them',
        where: 'A birth or marriage certificate showing the link',
        fil: { label: 'Patunay na kamag-anak ka nila', where: 'Birth o marriage certificate na nagpapakita ng ugnayan' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Request it here',
        where: 'Local Civil Registrar',
        fil: { label: 'Dito ito hingin', where: 'Local Civil Registrar' },
      },
    ],
    fields: [
      { id: 'deceasedName', label: 'Full name of deceased', type: 'text', required: true },
      { id: 'dateOfDeath', label: 'Date of death', type: 'date', required: true },
      { id: 'relationship', label: 'Your relationship to the deceased', type: 'text', required: true },
      { id: 'copies', label: 'Number of copies', type: 'number', placeholder: 'e.g. 2', required: true },
    ],
  },
  {
    id: 'cedula',
    categoryId: 'treasury',
    name: 'Community Tax Certificate (Cedula)',
    shortDescription: 'Basic residency and identity document required for most government transactions.',
    processingTime: 'Same day',
    processingDaysMin: 0,
    processingDaysMax: 0,
    fee: 55,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Proof of address'],
    searchTerms: ['cedula', 'community tax', 'sedula', 'CTC', 'residence certificate', 'buwis sa paninirahan'],
    steps: [
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Proof of your address',
        where: 'A utility bill, or your barangay',
        certificateId: 'residency',
        fil: { label: 'Patunay ng tirahan mo', where: 'Bill ng kuryente o tubig, o sa barangay mo' },
      },
      {
        label: 'Get it here',
        where: "Municipal Treasurer's Office",
        note: 'Many other transactions ask for a cedula, so this is often the first thing to get rather than the last.',
        fil: { label: 'Dito ito kunin', where: "Municipal Treasurer's Office", note: 'Marami pang ibang transaksyon ang humihingi ng cedula, kaya madalas ito ang unang kunin at hindi ang huli.' },
      },
    ],
    fields: [
      { id: 'purpose', label: 'Purpose', type: 'select', options: ['Employment', 'Government Transaction', 'Bank / Loan Requirement', 'School Requirement', 'Other'], required: true },
      { id: 'occupation', label: 'Occupation', type: 'text', placeholder: 'e.g. Store owner', required: true },
      { id: 'grossIncome', label: 'Gross annual income (\u20b1)', type: 'number', placeholder: 'e.g. 180000', required: true, helper: 'Your cedula fee is computed from declared income.' },
    ],
  },
  {
    id: 'rpt-assessment',
    categoryId: 'treasury',
    name: 'Real Property Tax Assessment',
    shortDescription: 'Request a statement of account for your land, building, or machinery (amilyar).',
    processingTime: '1\u20132 working days',
    processingDaysMin: 1,
    processingDaysMax: 2,
    fee: 0,
    requiresPayment: false,
    requirements: ['Tax Declaration number', 'Latest official receipt (if previously paid)'],
    searchTerms: ['real property tax', 'amilyar', 'land tax', 'property assessment', 'tax declaration', 'lupa'],
    steps: [
      {
        label: 'Your Tax Declaration number',
        where: 'On your last tax receipt or declaration',
        fil: { label: 'Ang Tax Declaration number mo', where: 'Nasa huling resibo o deklarasyon mo ng buwis' },
      },
      {
        label: 'The latest official receipt, if you have paid before',
        where: 'Your own records',
        fil: { label: 'Ang pinakahuling opisyal na resibo, kung nakapagbayad ka na dati', where: 'Sa sarili mong mga tala' },
      },
      {
        label: 'Request the assessment here',
        where: "Municipal Treasurer's Office",
        note: 'Free. This tells you what is owed; it does not pay it.',
        fil: { label: 'Dito hingin ang assessment', where: "Municipal Treasurer's Office", note: 'Libre. Sinasabi nito kung magkano ang utang; hindi nito binabayaran iyon.' },
      },
    ],
    fields: [
      { id: 'taxDecNo', label: 'Tax Declaration number', type: 'text', placeholder: 'e.g. 03-0012-00456', required: true },
      { id: 'propertyType', label: 'Property type', type: 'select', options: ['Residential Land', 'Residential Building', 'Commercial', 'Agricultural', 'Machinery'], required: true },
      { id: 'propertyLocation', label: 'Property location', type: 'textarea', placeholder: 'Lot, street, barangay', required: true },
      { id: 'coverage', label: 'Coverage requested', type: 'select', options: ['Full year', 'First quarter', 'Second quarter', 'Third quarter', 'Fourth quarter', 'Back taxes'], required: true },
    ],
  },
  {
    id: 'rpt-clearance',
    categoryId: 'treasury',
    name: 'Real Property Tax Clearance',
    shortDescription: 'Certifies your property has no outstanding real property tax.',
    processingTime: '1\u20133 working days',
    processingDaysMin: 1,
    processingDaysMax: 3,
    fee: 100,
    requiresPayment: true,
    requirements: ['Tax Declaration number', 'Latest real property tax official receipt', 'Valid government ID'],
    searchTerms: ['tax clearance', 'real property clearance', 'amilyar clearance', 'no tax due', 'property clearance'],
    steps: [
      {
        label: 'Know what is owed',
        where: "Municipal Treasurer's Office",
        serviceId: 'rpt-assessment',
        fil: { label: 'Alamin kung magkano ang babayaran', where: "Municipal Treasurer's Office" },
      },
      {
        label: 'Settle the real property tax in full',
        where: "Municipal Treasurer's Office",
        note: 'A clearance says nothing is owed, so nothing can be owed. Keep the receipt.',
        fil: { label: 'Bayaran nang buo ang real property tax', where: "Municipal Treasurer's Office", note: 'Ang sinasabi ng clearance ay walang utang, kaya dapat talagang wala. Itago ang resibo.' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Request the clearance here',
        where: "Municipal Treasurer's Office",
        fil: { label: 'Dito hingin ang clearance', where: "Municipal Treasurer's Office" },
      },
    ],
    fields: [
      { id: 'taxDecNo', label: 'Tax Declaration number', type: 'text', placeholder: 'e.g. 03-0012-00456', required: true },
      { id: 'purpose', label: 'Purpose', type: 'select', options: ['Property Sale / Transfer', 'Bank Loan Collateral', 'Building Permit Requirement', 'Other'], required: true },
      { id: 'lastPaymentYear', label: 'Year of last payment', type: 'number', placeholder: 'e.g. 2026', required: false },
    ],
  },
  {
    id: 'zoning-clearance',
    categoryId: 'obo',
    name: 'Zoning / Locational Clearance',
    shortDescription: 'Confirms your intended use of a property matches the municipal zoning plan.',
    processingTime: '3\u20135 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 500,
    requiresPayment: true,
    requirements: ['Tax Declaration or land title', 'Vicinity map / sketch plan', 'Real Property Tax Clearance'],
    searchTerms: ['zoning', 'locational clearance', 'land use', 'zoning clearance', 'pwesto'],
    steps: [
      {
        label: 'Land title, or the Tax Declaration for the lot',
        where: 'Registry of Deeds, or the Assessor',
        fil: { label: 'Titulo ng lupa, o ang Tax Declaration ng lote', where: 'Registry of Deeds, o sa Assessor' },
      },
      {
        label: 'Real Property Tax Clearance',
        where: "Municipal Treasurer's Office",
        serviceId: 'rpt-clearance',
        fil: { label: 'Real Property Tax Clearance', where: "Municipal Treasurer's Office" },
      },
      {
        label: 'Vicinity map or sketch plan of the lot',
        where: 'A geodetic engineer, or your plans',
        fil: { label: 'Vicinity map o sketch plan ng lote', where: 'Sa geodetic engineer, o nasa plano mo na' },
      },
      {
        label: 'Apply here',
        where: 'Building & Zoning (OBO)',
        note: 'Zoning comes before the building permit: it answers whether you may build that there at all.',
        fil: { label: 'Dito mag-apply', where: 'Building & Zoning (OBO)', note: 'Nauuna ang zoning sa building permit: sinasagot nito kung puwede ba talagang magtayo roon.' },
      },
    ],
    fields: [
      { id: 'projectType', label: 'Intended use', type: 'select', options: ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Mixed Use'], required: true },
      { id: 'projectLocation', label: 'Property location', type: 'textarea', placeholder: 'Lot, street, barangay', required: true },
      { id: 'lotArea', label: 'Lot area (sqm)', type: 'number', placeholder: 'e.g. 120', required: true },
    ],
  },
  {
    id: 'building-permit',
    categoryId: 'obo',
    name: 'Building Permit',
    shortDescription: 'Required before any construction, renovation, or demolition begins.',
    processingTime: '10\u201315 working days',
    processingDaysMin: 10,
    processingDaysMax: 15,
    fee: 1500,
    requiresPayment: true,
    requirements: [
      'Zoning / Locational Clearance',
      'Land title or Tax Declaration',
      'Five sets of building plans signed and sealed by licensed professionals',
      'Structural computations',
      'Real Property Tax Clearance',
    ],
    searchTerms: ['building permit', 'construction', 'magpapatayo', 'bahay', 'renovation', 'pagpapagawa', 'structure'],
    steps: [
      {
        label: 'Zoning / Locational Clearance',
        where: 'Building & Zoning (OBO)',
        serviceId: 'zoning-clearance',
        note: 'Do this one first. If zoning says no, nothing after it matters.',
        fil: { label: 'Zoning / Locational Clearance', where: 'Building & Zoning (OBO)', note: 'Ito ang unahin. Kung hindi papayag ang zoning, wala nang saysay ang lahat ng susunod.' },
      },
      {
        label: 'Land title, or the Tax Declaration for the lot',
        where: 'Registry of Deeds, or the Assessor',
        fil: { label: 'Titulo ng lupa, o ang Tax Declaration ng lote', where: 'Registry of Deeds, o sa Assessor' },
      },
      {
        label: 'Real Property Tax Clearance',
        where: "Municipal Treasurer's Office",
        serviceId: 'rpt-clearance',
        fil: { label: 'Real Property Tax Clearance', where: "Municipal Treasurer's Office" },
      },
      {
        label: 'Five sets of plans, signed and sealed',
        where: 'A licensed architect or civil engineer',
        note: 'Signed and sealed by the professional who prepared them — unsigned plans are returned.',
        fil: { label: 'Limang set ng plano, may pirma at selyo', where: 'Sa lisensyadong arkitekto o civil engineer', note: 'Dapat may pirma at selyo ng propesyonal na gumawa nito — isinasauli ang planong walang pirma.' },
      },
      {
        label: 'Structural computations',
        where: 'The same licensed professional',
        fil: { label: 'Structural computations', where: 'Sa parehong lisensyadong propesyonal' },
      },
      {
        label: 'Apply here',
        where: 'Building & Zoning (OBO)',
        note: 'Apply before any work starts. A permit does not cover what has already been built.',
        fil: { label: 'Dito mag-apply', where: 'Building & Zoning (OBO)', note: 'Mag-apply bago magsimula ang anumang gawain. Hindi sakop ng permit ang naitayo na.' },
      },
    ],
    fields: [
      { id: 'workType', label: 'Scope of work', type: 'select', options: ['New Construction', 'Renovation / Alteration', 'Addition', 'Repair', 'Demolition'], required: true },
      { id: 'occupancyType', label: 'Occupancy classification', type: 'select', options: ['Residential (Single)', 'Residential (Duplex)', 'Commercial', 'Industrial', 'Institutional'], required: true },
      { id: 'floorArea', label: 'Total floor area (sqm)', type: 'number', placeholder: 'e.g. 84', required: true },
      { id: 'estimatedCost', label: 'Estimated project cost (\u20b1)', type: 'number', placeholder: 'e.g. 1200000', required: true },
      { id: 'projectLocation', label: 'Project location', type: 'textarea', placeholder: 'Lot, street, barangay', required: true },
    ],
  },
  {
    id: 'occupancy-permit',
    categoryId: 'obo',
    name: 'Certificate of Occupancy',
    shortDescription: 'Certifies a finished building is safe and may be occupied.',
    processingTime: '5\u201310 working days',
    processingDaysMin: 5,
    processingDaysMax: 10,
    fee: 800,
    requiresPayment: true,
    requirements: ['Approved Building Permit', 'Certificate of Completion', 'As-built plans', 'Fire Safety Inspection Certificate'],
    searchTerms: ['occupancy permit', 'certificate of occupancy', 'move in', 'tapos na bahay', 'final inspection'],
    steps: [
      {
        label: 'Approved Building Permit',
        where: 'Building & Zoning (OBO)',
        serviceId: 'building-permit',
        fil: { label: 'Aprubadong Building Permit', where: 'Building & Zoning (OBO)' },
      },
      {
        label: 'Certificate of Completion',
        where: 'Your architect or engineer',
        fil: { label: 'Certificate of Completion', where: 'Sa arkitekto o inhinyero mo' },
      },
      {
        label: 'As-built plans',
        where: 'Your architect or engineer',
        note: 'What was actually built, which is not always what was drawn.',
        fil: { label: 'As-built plans', where: 'Sa arkitekto o inhinyero mo', note: 'Ang talagang naitayo, na hindi laging katulad ng iginuhit.' },
      },
      {
        label: 'Fire Safety Inspection Certificate',
        where: 'Bureau of Fire Protection',
        fil: { label: 'Fire Safety Inspection Certificate', where: 'Bureau of Fire Protection' },
      },
      {
        label: 'Apply here',
        where: 'Building & Zoning (OBO)',
        note: 'This is what makes the building legal to occupy. Get it before anyone moves in.',
        fil: { label: 'Dito mag-apply', where: 'Building & Zoning (OBO)', note: 'Ito ang nagpapahintulot na legal nang tirhan ang gusali. Kunin ito bago may lumipat.' },
      },
    ],
    fields: [
      { id: 'buildingPermitNo', label: 'Building Permit number', type: 'text', placeholder: 'e.g. BP-2026-00214', required: true },
      { id: 'completionDate', label: 'Date of completion', type: 'date', required: true },
      { id: 'projectLocation', label: 'Building location', type: 'textarea', placeholder: 'Lot, street, barangay', required: true },
    ],
  },
  {
    id: 'health-certificate',
    categoryId: 'health',
    name: 'Health Certificate',
    shortDescription: 'Required for food handlers and workers in public-facing establishments.',
    processingTime: '1\u20132 working days',
    processingDaysMin: 1,
    processingDaysMax: 2,
    fee: 150,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Chest X-ray result', 'Stool and urinalysis results', 'Completed medical examination'],
    searchTerms: ['health certificate', 'health card', 'yellow card', 'food handler', 'sanitary health', 'medical clearance'],
    steps: [
      {
        label: 'Chest X-ray',
        where: 'Any accredited clinic or hospital',
        fil: { label: 'Chest X-ray', where: 'Sa kahit anong akreditadong klinika o ospital' },
      },
      {
        label: 'Stool and urinalysis',
        where: 'The same clinic',
        note: 'Results take a day or two, so have these done before anything else here.',
        fil: { label: 'Stool at urinalysis', where: 'Sa parehong klinika', note: 'Isa hanggang dalawang araw bago lumabas ang resulta, kaya ito ang ipagawa bago ang iba.' },
      },
      {
        label: 'Medical examination',
        where: 'Municipal Health Office, or an accredited clinic',
        fil: { label: 'Medical examination', where: 'Municipal Health Office, o akreditadong klinika' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'Apply here',
        where: 'Municipal Health Office',
        fil: { label: 'Dito mag-apply', where: 'Municipal Health Office' },
      },
    ],
    fields: [
      { id: 'employer', label: 'Employer / establishment', type: 'text', placeholder: 'e.g. Santos Sari-Sari Store', required: true },
      { id: 'natureOfWork', label: 'Nature of work', type: 'select', options: ['Food Handler', 'Food Service Crew', 'Sales / Front Desk', 'Personal Care Services', 'Other'], required: true },
      { id: 'applicationKind', label: 'Application kind', type: 'select', options: ['New Application', 'Renewal'], required: true },
    ],
  },
  {
    id: 'sanitary-permit',
    categoryId: 'health',
    name: 'Sanitary Permit',
    shortDescription: 'Sanitation clearance for an establishment, issued alongside the business permit.',
    processingTime: '3\u20135 working days',
    processingDaysMin: 3,
    processingDaysMax: 5,
    fee: 500,
    requiresPayment: true,
    requirements: ['Business permit application', 'Health Certificates of all workers', 'Water potability test result'],
    searchTerms: ['sanitary permit', 'sanitation', 'kalinisan', 'food establishment', 'restaurant permit', 'karinderya'],
    steps: [
      {
        label: 'A Health Certificate for every worker',
        where: 'Municipal Health Office',
        serviceId: 'health-certificate',
        note: 'Every one of them, not just the owner. This is usually the slowest part.',
        fil: { label: 'Health Certificate para sa bawat manggagawa', where: 'Municipal Health Office', note: 'Bawat isa sa kanila, hindi lang ang may-ari. Ito ang kadalasang pinakamabagal na bahagi.' },
      },
      {
        label: 'Water potability test result',
        where: 'An accredited laboratory',
        fil: { label: 'Resulta ng water potability test', where: 'Sa akreditadong laboratoryo' },
      },
      {
        label: 'Your business permit application',
        where: 'Business Permits (BOSS)',
        note: 'These two are filed together — the BOSS asks for this permit, and this one asks for that application. Start at the BOSS.',
        fil: { label: 'Ang aplikasyon mo sa business permit', where: 'Business Permits (BOSS)', note: 'Magkasabay isinusumite ang dalawang ito — hinihingi ng BOSS ang permit na ito, at hinihingi naman nito ang aplikasyong iyon. Sa BOSS magsimula.' },
      },
      {
        label: 'Apply here',
        where: 'Municipal Health Office',
        fil: { label: 'Dito mag-apply', where: 'Municipal Health Office' },
      },
    ],
    fields: [
      { id: 'businessName', label: 'Establishment name', type: 'text', placeholder: 'e.g. Santos Sari-Sari Store', required: true },
      { id: 'establishmentType', label: 'Type of establishment', type: 'select', options: ['Food Establishment', 'Retail Store', 'Salon / Personal Care', 'Lodging', 'Other'], required: true },
      { id: 'workerCount', label: 'Number of workers', type: 'number', placeholder: 'e.g. 3', required: true },
      { id: 'businessAddress', label: 'Establishment address', type: 'textarea', required: true },
    ],
  },
  {
    id: 'occupational-permit',
    categoryId: 'bpls',
    name: 'Occupational Permit',
    shortDescription: "Working permit for people employed within the municipality's jurisdiction.",
    processingTime: '1\u20132 working days',
    processingDaysMin: 1,
    processingDaysMax: 2,
    fee: 150,
    requiresPayment: true,
    requirements: ['Valid government ID', 'Community Tax Certificate (Cedula)', 'Health Certificate', 'Certificate of employment'],
    searchTerms: ['occupational permit', 'working permit', 'worker permit', 'employment permit', 'trabaho'],
    steps: [
      {
        label: 'Community Tax Certificate (Cedula)',
        where: "Municipal Treasurer's Office",
        serviceId: 'cedula',
        fil: { label: 'Community Tax Certificate (Cedula)', where: "Municipal Treasurer's Office" },
      },
      {
        label: 'Health Certificate',
        where: 'Municipal Health Office',
        serviceId: 'health-certificate',
        note: 'Needs laboratory results of its own, so start it before the rest.',
        fil: { label: 'Health Certificate', where: 'Municipal Health Office', note: 'May sariling kailangang resulta ng laboratoryo, kaya simulan ito bago ang iba.' },
      },
      {
        label: 'Certificate of employment from your employer',
        where: 'Your employer',
        fil: { label: 'Certificate of employment mula sa pinapasukan mo', where: 'Sa employer mo' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'File the application here',
        where: 'Business Permits (BOSS)',
        fil: { label: 'Dito isumite ang aplikasyon', where: 'Business Permits (BOSS)' },
      },
    ],
    fields: [
      { id: 'employer', label: 'Employer', type: 'text', placeholder: 'e.g. Malasiqui Trading Corp.', required: true },
      { id: 'position', label: 'Position', type: 'text', placeholder: 'e.g. Sales Associate', required: true },
      { id: 'applicationKind', label: 'Application kind', type: 'select', options: ['New Application', 'Renewal'], required: true },
    ],
  },
  {
    id: 'marriage-license',
    categoryId: 'lcr',
    name: 'Marriage License Application',
    shortDescription: 'Apply for a marriage license. Posted publicly for 10 days before release.',
    processingTime: '10\u201315 working days',
    processingDaysMin: 10,
    processingDaysMax: 15,
    fee: 300,
    requiresPayment: true,
    requirements: [
      'PSA birth certificate of both parties',
      'CENOMAR of both parties',
      'Valid government IDs',
      'Pre-marriage counseling certificate',
      'Parental consent or advice (if 18\u201324 years old)',
    ],
    searchTerms: ['marriage license', 'ikakasal', 'wedding license', 'apply to marry', 'pakasal'],
    steps: [
      {
        label: 'PSA birth certificate of both of you',
        where: 'Local Civil Registrar',
        serviceId: 'birth-certificate',
        fil: { label: 'PSA birth certificate ninyong dalawa', where: 'Local Civil Registrar' },
      },
      {
        label: 'CENOMAR for both of you',
        where: 'PSA',
        note: 'Certificate of No Marriage Record. Order it early — it comes from the national office, not this one.',
        fil: { label: 'CENOMAR ninyong dalawa', where: 'PSA', note: 'Certificate of No Marriage Record. Maaga pa lang ay ipahanda na — sa pambansang tanggapan ito nanggagaling, hindi dito.' },
      },
      {
        label: 'Pre-marriage counselling certificate',
        where: 'Social Welfare (CSWDO) or the Health Office',
        fil: { label: 'Sertipiko ng pre-marriage counselling', where: 'Social Welfare (CSWDO) o Health Office' },
      },
      {
        label: 'Parental consent, or parental advice',
        where: 'Your parents, in writing',
        note: 'Consent if either of you is 18 to 20; advice if 21 to 24.',
        onlyIf: 'either of you is under 25',
        fil: { label: 'Pahintulot o payo ng magulang', where: 'Mula sa magulang ninyo, nakasulat', note: 'Pahintulot kung 18 hanggang 20 ang isa sa inyo; payo naman kung 21 hanggang 24.', onlyIf: 'wala pang 25 ang isa sa inyo' },
      },
      {
        label: 'Valid government IDs for both of you',
        where: 'You already have these',
        fil: { label: 'Balidong government ID ninyong dalawa', where: 'Nasa inyo na ito' },
      },
      {
        label: 'Apply here',
        where: 'Local Civil Registrar',
        note: 'The application is posted publicly for 10 days before the licence is released. Count that in.',
        fil: { label: 'Dito mag-apply', where: 'Local Civil Registrar', note: 'Ipinapaskil muna sa publiko ang aplikasyon nang 10 araw bago ilabas ang lisensya. Isama iyon sa bilang.' },
      },
    ],
    fields: [
      { id: 'applicantName', label: 'Your full name', type: 'text', required: true },
      { id: 'partnerName', label: "Partner's full name", type: 'text', required: true },
      { id: 'partnerBirthDate', label: "Partner's date of birth", type: 'date', required: true },
      { id: 'intendedDate', label: 'Intended date of marriage', type: 'date', required: true },
      { id: 'civilStatus', label: 'Your civil status', type: 'select', options: ['Single', 'Widowed', 'Annulled'], required: true },
    ],
  },
  {
    id: 'solo-parent-id',
    categoryId: 'cswdo',
    name: 'Solo Parent ID',
    shortDescription: 'Issues the Solo Parent ID and benefits booklet under the Solo Parents Welfare Act.',
    processingTime: '5\u20137 working days',
    processingDaysMin: 5,
    processingDaysMax: 7,
    fee: 0,
    requiresPayment: false,
    requirements: ['Valid government ID', 'Birth certificate of child / children', 'Proof of solo parent status', 'Certificate of no marriage or death certificate of spouse (if applicable)'],
    searchTerms: ['solo parent', 'single parent', 'solo parent ID', 'nag-iisang magulang', 'RA 8972'],
    steps: [
      {
        label: 'Birth certificate of each child',
        where: 'Local Civil Registrar',
        serviceId: 'birth-certificate',
        fil: { label: 'Birth certificate ng bawat anak', where: 'Local Civil Registrar' },
      },
      {
        label: 'Barangay certification that you are raising them alone',
        where: 'Your barangay',
        note: 'Ask at the barangay hall — not every barangay calls it the same thing.',
        fil: { label: 'Sertipikasyon ng barangay na ikaw lang ang nag-aalaga sa kanila', where: 'Sa barangay mo', note: 'Magtanong sa barangay hall — hindi pare-pareho ang tawag dito sa bawat barangay.' },
      },
      {
        label: 'CENOMAR, or the death certificate of your spouse',
        where: 'PSA, or the Local Civil Registrar',
        serviceId: 'death-certificate',
        onlyIf: 'you were married',
        fil: { label: 'CENOMAR, o death certificate ng asawa mo', where: 'PSA, o Local Civil Registrar', onlyIf: 'naikasal ka noon' },
      },
      {
        label: 'Any valid government ID',
        where: 'You already have this',
        fil: { label: 'Anumang balidong government ID', where: 'Nasa iyo na ito' },
      },
      {
        label: 'File the application here',
        where: 'Social Welfare (CSWDO)',
        fil: { label: 'Dito isumite ang aplikasyon', where: 'Social Welfare (CSWDO)' },
      },
    ],
    fields: [
      { id: 'groundForSoloParent', label: 'Ground for solo parent status', type: 'select', options: ['Death of Spouse', 'Separation / Abandonment', 'Annulled Marriage', 'Solo Adoptive Parent', 'Other'], required: true },
      { id: 'childrenCount', label: 'Number of dependent children', type: 'number', placeholder: 'e.g. 2', required: true },
      { id: 'monthlyIncome', label: 'Monthly income (\u20b1)', type: 'number', placeholder: 'e.g. 12000', required: true },
    ],
  },
]

/**
 * Sectoral registries and poverty-reduction programmes the municipality keeps
 * on a resident. These are what the digital ID shows under the resident's name:
 * a counter clerk needs to see at a glance that someone is a senior citizen or
 * a 4Ps household, because that is what decides the discount or the priority
 * lane.
 *
 * Membership is issued by the registering office, never self-declared — the
 * server refuses a write from anyone but CSWDO staff and admins.
 */
export const SECTORAL_PROGRAMS: SectoralProgram[] = [
  {
    code: '4ps',
    name: 'Pantawid Pamilyang Pilipino Program (4Ps)',
    shortName: '4Ps',
    kind: 'poverty_reduction',
    description: 'National conditional cash transfer for the poorest households.',
    benefit: 'Cash grants for health and education, conditional on check-ups and school attendance.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: 'Household ID No.',
    expires: false,
  },
  {
    code: 'indigent',
    name: 'Indigent Household (Listahanan)',
    shortName: 'Indigent',
    kind: 'poverty_reduction',
    description: 'Household listed in the national household targeting system.',
    benefit: 'Free medical assistance, PhilHealth sponsorship, and priority in relief operations.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: 'Household No.',
    expires: false,
  },
  {
    code: 'slp',
    name: 'Sustainable Livelihood Program',
    shortName: 'Livelihood',
    kind: 'poverty_reduction',
    description: 'Livelihood capital and skills training for low-income families.',
    benefit: 'Seed capital, skills training, and access to the municipal livelihood grant.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: 'Member No.',
    expires: false,
  },
  {
    code: 'senior',
    name: 'Senior Citizen',
    shortName: 'Senior Citizen',
    kind: 'sectoral',
    description: 'Registered with the Office for Senior Citizens Affairs.',
    benefit: '20% discount and VAT exemption on medicine, transport, and food, plus priority lanes.',
    issuingOffice: 'Office for Senior Citizens Affairs (OSCA)',
    idLabel: 'OSCA ID No.',
    expires: false,
  },
  {
    code: 'pwd',
    name: 'Person with Disability',
    shortName: 'PWD',
    kind: 'sectoral',
    description: 'Registered in the municipal PWD registry.',
    benefit: '20% discount and VAT exemption on medicine and services, plus priority lanes.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: 'PWD ID No.',
    expires: true,
  },
  {
    code: 'solo_parent',
    name: 'Solo Parent',
    shortName: 'Solo Parent',
    kind: 'sectoral',
    description: 'Registered solo parent under the Expanded Solo Parents Welfare Act.',
    benefit: '10% discount on baby needs and medicine, parental leave, and educational assistance.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: 'Solo Parent ID No.',
    expires: true,
  },
  {
    code: 'farmer',
    name: 'Farmer / Fisherfolk (RSBSA)',
    shortName: 'Farmer',
    kind: 'sectoral',
    description: 'Listed in the Registry System for Basic Sectors in Agriculture.',
    benefit: 'Seed and fertiliser subsidy, crop insurance, and fuel discount programmes.',
    issuingOffice: 'Municipal Agriculture Office',
    idLabel: 'RSBSA Ref. No.',
    expires: false,
  },
  {
    code: 'ip',
    name: 'Indigenous Peoples',
    shortName: 'IP',
    kind: 'sectoral',
    description: 'Member of a recognised indigenous cultural community.',
    benefit: 'Educational assistance, scholarship slots, and representation in local councils.',
    issuingOffice: 'Municipal Social Welfare & Development Office',
    idLabel: null,
    expires: false,
  },
]

/**
 * Non-working days for the expected-ready calculation.
 *
 * Philippine national holidays move each year by presidential proclamation, and
 * a municipality declares its own — a founding anniversary or fiesta closes the
 * hall as surely as Christmas does. Both are seeded into `holidays`, so a wrong
 * date is a row to correct rather than a release to cut.
 *
 * These are 2026 dates for a sample municipality. Check them against the year's
 * proclamation and replace the local ones before deploying.
 */
export const HOLIDAYS: Array<{ date: string; name: string; local?: boolean }> = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-02', name: 'Maundy Thursday' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-09', name: 'Araw ng Kagitingan' },
  { date: '2026-05-01', name: 'Labor Day' },
  { date: '2026-06-12', name: 'Independence Day' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day' },
  { date: '2026-08-31', name: 'National Heroes Day' },
  { date: '2026-11-01', name: "All Saints' Day" },
  { date: '2026-11-30', name: 'Bonifacio Day' },
  { date: '2026-12-08', name: 'Feast of the Immaculate Conception' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-30', name: 'Rizal Day' },
  { date: '2026-12-31', name: "New Year's Eve" },
  // Declared by the municipality — replace with the real ones.
  { date: '2026-05-15', name: 'Municipal Founding Anniversary', local: true },
  { date: '2026-10-12', name: 'Fiesta ng Bayan', local: true },
]

/**
 * Emergency hotlines shown on the digital ID.
 *
 * The national numbers are real and correct nationwide: 911 is the National
 * Emergency Hotline and 143 reaches the Philippine Red Cross. **Not one of the
 * Malasiqui numbers below is real** — they are invented placeholders on a real
 * town's name, which is the worst combination there is. Replace every one of them
 * before deploying, ring each one to confirm, and check them again whenever the
 * offices reorganise. A hotline that rings nowhere is worse than none at all,
 * because a resident will trust it in the moment they can least afford to.
 */
export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    id: 'mdrrmo',
    label: 'Disaster & rescue',
    agency: 'Municipal Disaster Risk Reduction and Management Office (MDRRMO)',
    phone: '(075) 961-2400',
    isNational: false,
  },
  {
    id: 'police',
    label: 'Police',
    agency: 'Malasiqui Municipal Police Station (PNP)',
    phone: '(075) 961-2911',
    isNational: false,
  },
  {
    id: 'fire',
    label: 'Fire',
    agency: 'Bureau of Fire Protection — Malasiqui',
    phone: '(075) 961-2410',
    isNational: false,
  },
  {
    id: 'electric',
    label: 'Power outage & live wires',
    // A downed line is an emergency the municipality cannot answer: the
    // cooperative owns the poles and is the only one who can cut the power.
    // **Check which cooperative actually serves the municipality before
    // deploying** — Pangasinan is split between more than one, and sending a
    // resident standing under a sparking line to the wrong one costs the
    // minutes that matter.
    agency: 'PANELCO I \u2014 electric cooperative, 24-hour line',
    phone: '(075) 961-2420',
    isNational: false,
  },
  {
    id: 'ambulance',
    label: 'Ambulance',
    agency: 'Municipal Health Office — emergency dispatch',
    phone: '(075) 961-2377',
    isNational: false,
  },
  {
    id: 'national-911',
    label: 'Any emergency, nationwide',
    agency: 'National Emergency Hotline',
    phone: '911',
    isNational: true,
  },
  {
    id: 'red-cross',
    label: 'Ambulance & blood services',
    agency: 'Philippine Red Cross',
    phone: '143',
    isNational: true,
  },
]
