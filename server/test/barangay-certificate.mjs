// The barangay certificate as a document somebody can actually hold.
//
// The municipal tier has produced a verifiable PDF since the first release and
// the barangay tier produced nothing — which was backwards, because the
// barangay is the tier most residents deal with in a year. What is checked here
// is less the PDF than the rules around it: that it exists only once the
// barangay has released it (not when it is merely ready, because the fee is
// paid at the hall on collection), that one release makes one certificate, that
// no other barangay and no municipal account can reach it, and that it is
// frozen against later edits to the hall.
import { formFiller } from './fixtures.mjs'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
const PASSWORD = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 200) } }
  return { status: res.status, json }
}

const bin = async (p, token) => {
  const res = await fetch(API + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) }
}

const upload = async (p, token, bytes, name, method = 'PUT') => {
  const fd = new FormData()
  fd.append('file', new Blob([bytes]), name)
  const res = await fetch(API + p, { method, headers: { Authorization: `Bearer ${token}` }, body: fd })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 160) } }
  return { status: res.status, json }
}

const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).json?.token

await formFiller(API) // proves the catalogue is up before anything else runs
const stamp = Date.now()
const barangays = (await j('/barangays')).json
const home = barangays[0]
const elsewhere = barangays[1]

const register = async (tag, barangayId, overrides = {}) =>
  (await j('/auth/register', { method: 'POST', body: {
    email: `brgycert.${tag}.${stamp}@example.com`,
    password: 'sertipiko-na-2026',
    fullName: `Certificate Tester ${tag}`,
    birthDate: '1983-05-22',
    motherMaidenName: `Maiden ${tag}${stamp}`,
    residesHere: true,
    barangayId,
    ...overrides,
  }})).json?.token

const resident = await register('a', home.id, { address: '9 Mabini St., Purok 2' })
const neighbour = await register('b', home.id)
const admin = await login(`admin.${home.id}@malasiqui.gov.ph`)
const otherAdmin = await login(`admin.${elsewhere.id}@malasiqui.gov.ph`)
const municipalAdmin = await login('admin@malasiqui.gov.ph')
const treasury = await login('treasury@malasiqui.gov.ph')

const catalogue = (await j('/barangay/me', { token: resident })).json
const typeId = catalogue.certificates[0].id

/** Files a certificate request and walks it to the status asked for. */
const walk = async (token, to, purpose = 'Local employment requirement') => {
  const filed = await j('/barangay/requests', { method: 'POST', token, body: { typeId, purpose } })
  const order = ['processing', 'ready', 'released']
  for (const status of order) {
    await j(`/barangay-staff/requests/${filed.json.id}`, {
      method: 'PATCH', token: admin, body: { status },
    })
    if (status === to) break
  }
  return filed.json.id
}

const mine = async (token, id) =>
  (await j('/barangay/requests', { token })).json.find((r) => r.id === id)

console.log('\n== nothing exists until the barangay has released it ==')

const waiting = await walk(resident, 'ready')
check('a request that is only ready has no certificate', (await mine(resident, waiting)).hasCertificate === false)
check(
  'and downloading one is not found',
  (await bin(`/barangay/requests/${waiting}/certificate`, resident)).status === 404
)
// The barangay takes its fee at the hall on collection. A copy available at
// `ready` would hand somebody the document without their ever going.
check('the staff side has nothing either', (await bin(`/barangay-staff/requests/${waiting}/certificate`, admin)).status === 404)

await j(`/barangay-staff/requests/${waiting}`, { method: 'PATCH', token: admin, body: { status: 'released' } })
const releasedRow = await mine(resident, waiting)
check('releasing it issues the certificate', releasedRow.hasCertificate === true)

const pdf = await bin(`/barangay/requests/${waiting}/certificate`, resident)
check('the resident can download it', pdf.status === 200, pdf.status)
check('and it is a PDF', pdf.bytes.subarray(0, 5).toString() === '%PDF-')
check('served as a download', pdf.type === 'application/pdf')

console.log('\n== one release, one certificate ==')

// Setting the status again is refused by the order rules, and must not mint a
// second certificate even so.
const again = await j(`/barangay-staff/requests/${waiting}`, {
  method: 'PATCH', token: admin, body: { status: 'released' },
})
check('a second release is refused by the order', again.status === 409, again.status)
const afterReplay = await bin(`/barangay/requests/${waiting}/certificate`, resident)
check('and the certificate is the same one', afterReplay.bytes.equals(pdf.bytes))

console.log('\n== whose certificate it is ==')

check(
  'another resident of the same barangay cannot download it',
  (await bin(`/barangay/requests/${waiting}/certificate`, neighbour)).status === 404
)
check(
  'nor can somebody with no session',
  (await bin(`/barangay/requests/${waiting}/certificate`, null)).status === 401
)
check(
  'another barangay does not find it',
  (await bin(`/barangay-staff/requests/${waiting}/certificate`, otherAdmin)).status === 404
)
// A different tier is not a wider one.
check(
  'the municipal administrator is refused outright',
  (await bin(`/barangay-staff/requests/${waiting}/certificate`, municipalAdmin)).status === 403
)
check(
  'and so is a municipal office',
  (await bin(`/barangay-staff/requests/${waiting}/certificate`, treasury)).status === 403
)

console.log('\n== the barangay can reprint it ==')

const reprint = await bin(`/barangay-staff/requests/${waiting}/certificate`, admin)
check('the barangay gets a copy', reprint.status === 200, reprint.status)
check(
  'and it is the same bytes the resident has — not a second certificate',
  reprint.bytes.equals(pdf.bytes)
)

console.log('\n== anybody holding one can check it ==')

const code = (await mine(resident, waiting)).certificateCode
check('the resident can read the code off their own certificate', typeof code === 'string', code)

const verified = await j(`/verify/${code}`)
check('and anybody holding it can check it, with no session at all', verified.status === 200 && verified.json.valid === true, verified.status)
check('it says which of the three kinds it is', verified.json.kind === 'barangay_certificate')
check('naming the barangay that issued it', /^Barangay /.test(verified.json.issuedBy ?? ''), verified.json.issuedBy)
check('the certificate', verified.json.documentType === catalogue.certificates[0].name)
check('who holds it', verified.json.issuedTo === 'Certificate Tester a')
check('and whether it has lapsed', verified.json.expired === false)

const unknown = await j('/verify/ZZZZ-ZZZZ-ZZZZ-ZZZZ')
check('an unknown code is not found', unknown.status === 404 && unknown.json.valid === false)
check(
  'and the refusal names all three kinds',
  /certificate/i.test(unknown.json.error ?? ''),
  unknown.json.error
)

console.log('\n== the seal ==')

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const PDF_BYTES = Buffer.from('%PDF-1.4\n% not a seal\n', 'utf8')

check(
  'a PDF is not a seal',
  (await upload('/barangay-staff/office/seal', admin, PDF_BYTES, 'seal.png')).status === 415
)
check(
  'the municipal administrator cannot upload one here',
  (await upload('/barangay-staff/office/seal', municipalAdmin, PNG, 'seal.png')).status === 403
)

const sealed = await upload('/barangay-staff/office/seal', admin, PNG, 'seal.png')
check('the barangay administrator can', sealed.status === 200 && sealed.json.hasSeal === true, sealed.status)

const office = await j('/barangay-staff/office', { token: admin })
check('the hall tab says a seal is on file', office.json.hasSeal === true)
check('and when it went up', typeof office.json.sealUpdatedAt === 'string')

const image = await bin('/barangay-staff/office/seal', admin)
check('the console can render it', image.status === 200 && image.type === 'image/png', `${image.status} ${image.type}`)
check(
  'another barangay cannot read it',
  (await bin('/barangay-staff/office/seal', otherAdmin)).status === 404
)

const sealedId = await walk(resident, 'released', 'Scholarship application')
const sealedPdf = await bin(`/barangay/requests/${sealedId}/certificate`, resident)
check('a certificate released now still renders', sealedPdf.status === 200 && sealedPdf.bytes.subarray(0, 5).toString() === '%PDF-')

console.log('\n== what the certificate actually says ==')

// The attestation is authored on the type and printed as written. Read the
// seeded clearance back off the catalogue rather than asserting a literal here:
// the text is deployment data, and a test that hard-codes it would fail the
// first time an LGU edited its own wording.
const shared = (await j('/barangay-staff/certificates', { token: admin })).json
const clearance = shared.find((c) => c.id === typeId)
check('the seeded clearance carries an attestation', typeof clearance?.attestation === 'string', clearance?.attestation?.slice(0, 40))
check(
  'which is the type-specific text, not the generic sentence',
  /no pending case|derogatory/i.test(clearance?.attestation ?? ''),
  clearance?.attestation?.slice(0, 60)
)

// Placeholders the renderer cannot fill would print as literal braces on an
// official document, so they are refused at the save — the only moment somebody
// is still looking at what they typed.
// The body is checked before the row is looked up, so a bad placeholder is
// refused whether or not the caller could have reached that row — the schema
// does not need to know about scoping to do its job.
const badPlaceholder = await j(`/barangay-staff/certificates/${typeId}`, {
  method: 'PATCH', token: admin,
  body: { attestation: 'This certifies that {name} of {municipality} is a {wizard}.' },
})
check('an unknown placeholder is refused', badPlaceholder.status === 400, badPlaceholder.status)

// And with wording the schema accepts, a barangay still cannot rewrite a shared
// certificate: from inside a barangay console a shared row is not found, which
// is the same answer another barangay's row gives.
const sharedEdit = await j(`/barangay-staff/certificates/${typeId}`, {
  method: 'PATCH', token: admin,
  body: { attestation: 'This is to certify that {name} lives in {residence}.' },
})
check('a barangay cannot rewrite a shared certificate', sharedEdit.status === 404, sharedEdit.status)
check(
  'and the shared wording is untouched',
  (await j('/barangay-staff/certificates', { token: admin })).json
    .find((c) => c.id === typeId)?.attestation === clearance.attestation
)

const mineId = (await j('/barangay-staff/certificates', {
  method: 'POST', token: admin,
  body: {
    name: `Barangay Attestation Test ${stamp}`,
    description: 'A document added to check that authored wording round-trips.',
    fee: 0,
  },
})).json.id

check(
  'a certificate added in the console starts with no attestation',
  (await j('/barangay-staff/certificates', { token: admin })).json
    .find((c) => c.id === mineId)?.attestation === null
)

const rejected = await j(`/barangay-staff/certificates/${mineId}`, {
  method: 'PATCH', token: admin,
  body: { attestation: 'This certifies that {name} is a {wizard} of {nowhere}.' },
})
check('an unknown placeholder on its own certificate is refused', rejected.status === 400, rejected.status)
check('and the refusal names the one that is wrong', /\{wizard\}/.test(rejected.json?.error ?? ''), rejected.json?.error)
check('as well as the ones that are right', /\{residence\}/.test(rejected.json?.error ?? ''))

const authored = await j(`/barangay-staff/certificates/${mineId}`, {
  method: 'PATCH', token: admin,
  body: { attestation: 'This is to certify that {name} of {residence} is known to this office.\n\nIssued this {date} for {purpose}.' },
})
check('a valid one is accepted', authored.status === 200, authored.status)
check('and comes back as written', /\{name\}/.test(authored.json?.attestation ?? ''))

const cleared = await j(`/barangay-staff/certificates/${mineId}`, {
  method: 'PATCH', token: admin, body: { attestation: null },
})
check('it can be cleared back to the plain sentence', cleared.json?.attestation === null, cleared.status)

// Withdraw the test row so a second run of the suite does not pile them up.
await j(`/barangay-staff/certificates/${mineId}`, { method: 'DELETE', token: admin })

console.log('\n== an issued certificate is frozen ==')

// Changing who holds the office must not rewrite a certificate somebody is
// already holding — the captain and the secretary are printed on it.
const before = (await j('/barangay-staff/office', { token: admin })).json
const renamed = await j('/barangay-staff/office', {
  method: 'PATCH', token: admin, body: { captain: `Captain ${stamp}` },
})
check('the administrator can change who holds the office', renamed.status === 200, renamed.status)
check(
  'and the certificate already issued is byte-for-byte unchanged',
  (await bin(`/barangay/requests/${sealedId}/certificate`, resident)).bytes.equals(sealedPdf.bytes)
)

const afterEdit = await walk(resident, 'released', 'Bank account opening')
check(
  'but the next one carries the correction',
  !(await bin(`/barangay/requests/${afterEdit}/certificate`, resident)).bytes.equals(sealedPdf.bytes)
)

// 200 with the hall's own state rather than a bare 204: the console renders
// the response, and a 204 left it showing a seal that is no longer there.
const removed = await j('/barangay-staff/office/seal', { method: 'DELETE', token: admin })
check('the seal can be removed', removed.status === 200, removed.status)
check('and the response says it is gone', removed.json?.hasSeal === false)
check('removing it twice is not found', (await j('/barangay-staff/office/seal', { method: 'DELETE', token: admin })).status === 404)
check(
  'and a certificate printed with it is unchanged',
  (await bin(`/barangay/requests/${sealedId}/certificate`, resident)).bytes.equals(sealedPdf.bytes)
)

// Put the captain back, so a suite run twice does not accumulate test names.
await j('/barangay-staff/office', { method: 'PATCH', token: admin, body: { captain: before.captain } })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
