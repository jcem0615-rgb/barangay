// The e-seal and the e-signature.
//
// What is checked here is less the picture than the rules around it: that only
// an administrator can put one on, that a barangay cannot reach the hall's and
// the hall cannot reach a barangay's, that the type is decided by the bytes
// rather than the filename, that every upload and removal is in the audit
// trail, and — the one that matters most — that replacing a signature does not
// reach back into a document somebody is already holding.
import { inflateSync } from 'node:zlib'
import { formFiller, payRequest } from './fixtures.mjs'

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

const send = async (p, token, bytes, name, method = 'PUT') => {
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

/** A real 1x1 PNG and a real 1x1 JPEG, so the type comes from the bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
// Valid, and different from the one above — replacing a mark has to be
// observable. It has to decode, not merely start with the PNG magic: a damaged
// one is refused at the upload now, because pdfkit's decoder throws from a
// zlib callback and would take the process down at the next release.
const SECOND_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
  'base64'
)
const NOT_AN_IMAGE = Buffer.from('%PDF-1.4\n% a perfectly good PDF, and not a seal\n')

/**
 * What a PDF actually says.
 *
 * pdfkit deflates its content streams, so searching the raw bytes for a name
 * finds nothing whether it is printed or not — which would make the assertion
 * pass for the wrong reason the day the name stopped being drawn.
 */
function pdfText(bytes) {
  const raw = bytes.toString('latin1')
  let drawn = ''
  const pattern = /stream\r?\n/g
  let match
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    try {
      drawn += inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1')
    } catch {
      // Not a deflated stream — an embedded image, or a font. Skip it.
    }
  }
  // Only the hex runs, joined. The standard fonts this app prints with are not
  // subsetted, so each run is the characters themselves — and taking just the
  // runs drops the kerning numbers pdfkit writes between them, which otherwise
  // cut a name in half ("P 40 unong Bar 10 angay").
  return [...drawn.matchAll(/<([0-9A-Fa-f\s]+)>/g)]
    .map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'hex').toString('latin1'))
    .join('')
}

/** How many pages the PDF has. */
const pageCount = (bytes) => (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

const form = await formFiller(API)
const stamp = Date.now()

const admin = await login('admin@malasiqui.gov.ph')
const treasury = await login('treasury@malasiqui.gov.ph')
const lcr = await login('lcr@malasiqui.gov.ph')
const barangays = (await j('/barangays')).json
// Poblacion rather than whatever the list returns first: the seed issues a
// clerk in the first barangay of the roster only, and the public list is
// ordered by name. Every other barangay suite names it the same way.
const home = barangays.find((b) => b.id === 'poblacion') ?? barangays[0]
const elsewhere = barangays.find((b) => b.id !== home.id)
const brgyAdmin = await login(`admin.${home.id}@malasiqui.gov.ph`)
const brgyOfficer = await login(`officer.${home.id}@malasiqui.gov.ph`)
// The councillor. It is a barangay account, in this same barangay, and it is
// the role most likely to be let into these slots by accident — which is why
// it is in both matrices below rather than only in its own suite.
const brgyKagawad = await login(`kagawad.${home.id}@malasiqui.gov.ph`)
const otherAdmin = await login(`admin.${elsewhere.id}@malasiqui.gov.ph`)

console.log('\n== the bytes decide, not the filename ==')

check(
  'a PDF named .png is refused as a seal',
  (await send('/admin/municipality/seal', admin, NOT_AN_IMAGE, 'seal.png')).status === 415
)
check(
  'and as an office signature',
  (await send('/admin/offices/lcr/signature', admin, NOT_AN_IMAGE, 'sig.png')).status === 415
)
check(
  'and as a barangay signature',
  (await send(`/barangay-staff/office/signature/captain`, brgyAdmin, NOT_AN_IMAGE, 'sig.png')).status === 415
)
check(
  'uploading nothing at all is a 400, not a 415',
  (await fetch(`${API}/admin/offices/lcr/signature`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}` }, body: new FormData(),
  })).status === 400
)

console.log('\n== only an administrator signs for an office ==')

check(
  'municipal staff cannot upload an office signature',
  (await send('/admin/offices/lcr/signature', treasury, PNG, 'sig.png')).status === 403
)
check(
  'a barangay administrator cannot either — a different tier is not a wider one',
  (await send('/admin/offices/lcr/signature', brgyAdmin, PNG, 'sig.png')).status === 403
)
check(
  'the municipal administrator can',
  (await send('/admin/offices/lcr/signature', admin, PNG, 'sig.png')).status === 200
)
check(
  'and it now reads as on file',
  (await j('/admin/offices', { token: admin })).json.find((o) => o.id === 'lcr')?.hasSignature === true
)
check(
  'a barangay officer cannot upload the captain\'s signature',
  (await send('/barangay-staff/office/signature/captain', brgyOfficer, PNG, 'sig.png')).status === 403
)
check(
  'the barangay administrator can',
  (await send('/barangay-staff/office/signature/captain', brgyAdmin, PNG, 'sig.png')).status === 200
)
check(
  'and the officer can see it, because they cannot check what they cannot see',
  (await bin('/barangay-staff/office/signature/captain', brgyOfficer)).status === 200
)
check(
  'the officer cannot take it away either',
  (await j('/barangay-staff/office/signature/captain', { method: 'DELETE', token: brgyOfficer })).status === 403
)

console.log('\n== only the two who actually sign a certificate ==')

check(
  'there is no third signatory to upload for',
  (await send('/barangay-staff/office/signature/kagawad', brgyAdmin, PNG, 'sig.png')).status === 404
)
check(
  'and the seal is not reachable through the signature route',
  (await send('/barangay-staff/office/signature/seal', brgyAdmin, PNG, 'sig.png')).status === 404
)

console.log('\n== a barangay reaches only its own ==')

const mine = await bin('/barangay-staff/office/signature/captain', brgyAdmin)
check('this barangay reads its own captain signature', mine.status === 200, mine.status)
check('and it comes back as an image', mine.type?.startsWith('image/') === true, mine.type)
// Whatever that barangay has on file is not this one's, and a previous run of
// this suite may have left one there — so it is taken off first and the check
// stays about scoping rather than about what happened to be lying around.
await j('/barangay-staff/office/signature/captain', { method: 'DELETE', token: otherAdmin })
check(
  "another barangay's console shows nothing, because it is reading its own row",
  (await bin('/barangay-staff/office/signature/captain', otherAdmin)).status === 404
)
check(
  'the municipal administrator gets 403 from the barangay route',
  (await bin('/barangay-staff/office/signature/captain', admin)).status === 403
)
check(
  'and a barangay administrator gets 403 from the hall route',
  (await bin('/admin/offices/lcr/signature', brgyAdmin)).status === 403
)

console.log('\n== every change is in the trail, with who made it ==')

const trail = (await j('/admin/audit?limit=60', { token: admin })).json
check(
  'uploading an office signature is recorded',
  trail.some((r) => r.action === 'office.signature.update' && r.target === 'lcr')
)
check(
  'and so is a barangay one',
  trail.some((r) => r.action === 'barangay_signature.captain.update' && r.target === home.id)
)
check(
  'the actor is named rather than only their id',
  typeof trail.find((r) => r.action === 'office.signature.update')?.actorName === 'string'
)
check(
  'the storage key is not in the trail',
  !JSON.stringify(trail).includes('signature_key')
)

console.log('\n== what a released document carries ==')

await send('/admin/municipality/seal', admin, PNG, 'seal.png')
await j('/admin/offices/treasury', {
  method: 'PATCH', token: admin,
  body: { headName: `Treasurer ${stamp}`, headTitle: 'Municipal Treasurer' },
})
await send('/admin/offices/treasury/signature', admin, PNG, 'sig.png')

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `sig.${stamp}@example.com`, password: 'lagda-na-2026',
  fullName: `Signature Tester ${stamp}`, birthDate: '1981-03-09',
  motherMaidenName: `Maiden ${stamp}`, residesHere: true, barangayId: home.id,
  address: '5 Luna St., Purok 3',
}})).json?.token

const filed = await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: form('cedula'),
}})
const requestId = filed.json.id
await j(`/staff/requests/${requestId}/assess`, { method: 'POST', token: treasury, body: { fee: 130 } })
await payRequest(API, resident, requestId)
for (let i = 0; i < 4; i++) {
  await j(`/staff/requests/${requestId}/advance`, { method: 'POST', token: treasury, body: {} })
}

const doc = await bin(`/requests/${requestId}/document`, resident)
check('the released document is a PDF', doc.bytes.subarray(0, 5).toString() === '%PDF-', doc.status)
check('it names who signed it', pdfText(doc.bytes).includes(`Treasurer ${stamp}`))
check('and their title under the rule', pdfText(doc.bytes).includes('Municipal Treasurer'))
check(
  'and says the code is what proves it, not the picture',
  pdfText(doc.bytes).includes('verification')
)
check('it is one page, not two', pageCount(doc.bytes) === 1)

const receipt = await bin(`/requests/${requestId}/receipt`, resident)
check('the receipt is a PDF too', receipt.bytes.subarray(0, 5).toString() === '%PDF-', receipt.status)
check('and it is one page', pageCount(receipt.bytes) === 1)

console.log('\n== a document is frozen against a later signature ==')

check(
  'the administrator can replace the office signature',
  (await send('/admin/offices/treasury/signature', admin, SECOND_PNG, 'sig2.png')).status === 200
)
const again = await bin(`/requests/${requestId}/document`, resident)
check(
  'and the document already released is byte-for-byte unchanged',
  Buffer.compare(doc.bytes, again.bytes) === 0
)
check(
  'removing it is the administrator\'s',
  (await j('/admin/offices/treasury/signature', { method: 'DELETE', token: admin })).status === 200
)
check(
  'removing it twice is not found',
  (await j('/admin/offices/treasury/signature', { method: 'DELETE', token: admin })).status === 404
)
const third = await bin(`/requests/${requestId}/document`, resident)
check(
  'and the released document still carries the signature it was printed with',
  Buffer.compare(doc.bytes, third.bytes) === 0
)

console.log('\n== a certificate is frozen the same way ==')

await send('/barangay-staff/office/signature/secretary', brgyAdmin, PNG, 'sig.png')
const cat = (await j('/barangay/me', { token: resident })).json
const certReq = await j('/barangay/requests', { method: 'POST', token: resident, body: {
  typeId: cat.certificates[0].id, purpose: 'Local employment requirement',
}})
for (const status of ['processing', 'ready', 'released']) {
  await j(`/barangay-staff/requests/${certReq.json.id}`, {
    method: 'PATCH', token: brgyAdmin, body: { status },
  })
}
const cert = await bin(`/barangay/requests/${certReq.json.id}/certificate`, resident)
check('the certificate is a PDF', cert.bytes.subarray(0, 5).toString() === '%PDF-', cert.status)
check('and one page, with the footer inside the margin', pageCount(cert.bytes) === 1)
check(
  'it names both signatories',
  pdfText(cert.bytes).includes('Punong Barangay') && pdfText(cert.bytes).includes('Barangay Secretary')
)

await send('/barangay-staff/office/signature/captain', brgyAdmin, SECOND_PNG, 'sig2.png')
const certAgain = await bin(`/barangay/requests/${certReq.json.id}/certificate`, resident)
check(
  'replacing the captain\'s signature leaves it untouched',
  Buffer.compare(cert.bytes, certAgain.bytes) === 0
)

console.log('\n== a resident is not handed the office\'s signature ==')

check(
  'no resident route serves it',
  (await bin('/admin/offices/treasury/signature', resident)).status === 403
)
check(
  'nor the barangay\'s',
  (await bin('/barangay-staff/office/signature/captain', resident)).status === 403
)

console.log('\n== who signs is editable, what the office is called is not ==')

const renamed = await j('/admin/offices/lcr', {
  method: 'PATCH', token: admin, body: { officeName: 'Something Else' },
})
check('renaming an office through this route is refused', renamed.status === 400, renamed.status)
check(
  'and the name is unchanged',
  (await j('/admin/offices', { token: admin })).json.find((o) => o.id === 'lcr')?.officeName ===
    'Office of the Local Civil Registrar'
)
check(
  'naming who signs is accepted',
  (await j('/admin/offices/lcr', {
    method: 'PATCH', token: admin, body: { headName: `Registrar ${stamp}` },
  })).status === 200
)
check(
  'and comes back as written',
  (await j('/admin/offices', { token: admin })).json.find((o) => o.id === 'lcr')?.headName ===
    `Registrar ${stamp}`
)
check(
  'the LCR\'s own staff cannot rename their head',
  (await j('/admin/offices/lcr', { method: 'PATCH', token: lcr, body: { headName: 'Me' } })).status === 403
)

console.log('\n== every slot, every role that is not an administrator ==')

/*
 * The whole of "signatures are uploaded by administrators" in one matrix.
 *
 * The individual checks above read better one at a time, but they cover the
 * slots somebody thought of. This walks all four against every account that is
 * not the administrator for that tier, so a slot added later without a gate
 * fails here rather than being found by whoever uses it.
 */
const SLOTS = [
  ['the municipal seal', '/admin/municipality/seal'],
  ["the treasurer's signature", '/admin/municipality/treasurer-signature'],
  ["the hall's own signatory", '/admin/municipality/signatory-signature'],
  ["an office head's signature", '/admin/offices/lcr/signature'],
]
const MUNICIPAL_OUTSIDERS = [
  ['municipal staff', treasury],
  ['the LCR\'s own staff', lcr],
  ['a barangay administrator', brgyAdmin],
  ['a barangay officer', brgyOfficer],
  ['a barangay kagawad', brgyKagawad],
  ['a resident', resident],
]
for (const [what, path] of SLOTS) {
  for (const [who, token] of MUNICIPAL_OUTSIDERS) {
    const put = await send(path, token, PNG, 'x.png')
    const got = await j(path, { token })
    const del = await j(path, { method: 'DELETE', token })
    // Reading too, not only the two verbs that write: a signature file is the
    // picture that gets printed on official paper, and fetching one is not a
    // lesser act than replacing it.
    check(
      `${who} cannot upload, read or remove ${what}`,
      put.status === 403 && got.status === 403 && del.status === 403,
      `${put.status}/${got.status}/${del.status}`
    )
  }
}

const BARANGAY_SLOTS = [
  ['the barangay seal', '/barangay-staff/office/seal'],
  ["the captain's signature", '/barangay-staff/office/signature/captain'],
  ["the secretary's signature", '/barangay-staff/office/signature/secretary'],
]
for (const [what, path] of BARANGAY_SLOTS) {
  // Everyone outside the barangay's own desk: refused all three verbs. The
  // councillor is in here because the gate that opens `barangayStaffRouter`
  // excludes it, which is the whole reason the kagawad has a router of its
  // own — a third role on that gate would leave every slot here one forgotten
  // `requireRole` away from an elected official.
  for (const [who, token] of [
    ['a barangay kagawad', brgyKagawad],
    ['a resident', resident],
    ['the municipal administrator', admin],
  ]) {
    const put = await send(path, token, PNG, 'x.png')
    const got = await j(path, { token })
    const del = await j(path, { method: 'DELETE', token })
    check(
      `${who} cannot upload, read or remove ${what}`,
      put.status === 403 && got.status === 403 && del.status === 403,
      `${put.status}/${got.status}/${del.status}`
    )
  }

  // The clerk is the one deliberate exception, and it is a split rather than a
  // gap: the administrator writes and *both* roles read, because an officer who
  // cannot see what is being printed on the barangay's certificates cannot
  // notice that it is wrong. So the write is refused and the read is not.
  const clerkPut = await send(path, brgyOfficer, PNG, 'x.png')
  const clerkDel = await j(path, { method: 'DELETE', token: brgyOfficer })
  const clerkGet = await j(path, { token: brgyOfficer })
  check(
    `the barangay clerk cannot upload or remove ${what}`,
    clerkPut.status === 403 && clerkDel.status === 403,
    `${clerkPut.status}/${clerkDel.status}`
  )
  check(
    `but the barangay clerk may read ${what}`,
    clerkGet.status !== 403,
    clerkGet.status
  )
}

console.log('\n== nothing is signed in the app ==')

/*
 * The signature is a scan uploaded once and printed on everything afterwards.
 * There is no signing step in any workflow and no route that would let the
 * named official — or anybody else — sign a particular document, which is what
 * the word "e-signature" invites somebody to look for.
 */
// Each role is asked on the mount it can actually reach: a staff token gets 403
// from `/requests` at the mount, which would say nothing about whether a route
// is there.
for (const [who, token] of [['an administrator', admin], ['the releasing office', treasury]]) {
  check(
    `${who} has no route to sign a document`,
    (await j(`/staff/requests/${requestId}/sign`, { method: 'POST', token, body: {} })).status === 404
  )
}
check(
  'and neither has the resident holding it',
  (await j(`/requests/${requestId}/sign`, { method: 'POST', token: resident, body: {} })).status === 404
)
check(
  'and none to sign a barangay certificate either',
  (await j(`/barangay-staff/requests/${certReq.json.id}/sign`, {
    method: 'POST', token: brgyAdmin, body: {},
  })).status === 404
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
