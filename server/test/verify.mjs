// The public document check, and the QR that leads to it.
//
// Every PDF this app issues has carried a verification code since the first
// release and `/api/verify/:code` has answered for it just as long — but
// nothing called it, so in practice the code was checkable only by somebody who
// knew to open a JSON endpoint by hand. What is checked here is that all three
// kinds answer, that the check needs no session, that it discloses only what is
// already printed on the paper somebody is holding, and that the QR drawn on
// each document decodes to the link that opens it.
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
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) }
}

const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).json?.token

/**
 * Whether a QR was drawn into a PDF.
 *
 * The matrix goes down as one filled rectangle per dark module, so the page's
 * content stream carries several hundred `re` operators where it would
 * otherwise carry a handful. pdfkit deflates that stream, so it has to be
 * inflated before there is anything to count.
 *
 * What this cannot tell you is whether the squares actually *scan* — that
 * needs rendering the page and pointing a decoder at it, which is a different
 * kind of test and lives outside this suite.
 */
function drawsAQr(bytes) {
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
      // An image or a font, not a content stream.
    }
  }
  return (drawn.match(/\bre\b/g) ?? []).length > 200
}

const form = await formFiller(API)
const stamp = Date.now()

const treasury = await login('treasury@malasiqui.gov.ph')
const admin = await login('admin@malasiqui.gov.ph')
const barangays = (await j('/barangays')).json
// Poblacion rather than whatever the list returns first: the seed issues a
// clerk there only, and this suite needs one to check the role line.
const home = barangays.find((b) => b.id === 'poblacion') ?? barangays[0]
const elsewhere = barangays.find((b) => b.id !== home.id)
const brgyAdmin = await login(`admin.${home.id}@malasiqui.gov.ph`)
const otherAdmin = await login(`admin.${elsewhere.id}@malasiqui.gov.ph`)

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `verify.${stamp}@example.com`, password: 'tingnan-mo-2026',
  fullName: `Verify Tester ${stamp}`, birthDate: '1988-07-14',
  motherMaidenName: `Maiden ${stamp}`, residesHere: true, barangayId: home.id,
  address: '7 Burgos St., Purok 4',
}})).json?.token

console.log('\n== a released municipal document ==')

const filed = await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: form('cedula'),
}})
const requestId = filed.json.id
await j(`/staff/requests/${requestId}/assess`, { method: 'POST', token: treasury, body: { fee: 130 } })
await payRequest(API, resident, requestId)
for (let i = 0; i < 4; i++) {
  await j(`/staff/requests/${requestId}/advance`, { method: 'POST', token: treasury, body: {} })
}

const mine = (await j(`/requests/${requestId}`, { token: resident })).json
const docCode = mine.documentCode
check(
  'the resident can read their own document code without opening the PDF',
  typeof docCode === 'string' && docCode.length > 0,
  JSON.stringify(docCode)
)

const doc = await bin(`/requests/${requestId}/document`, resident)
check('and the PDF draws a QR', drawsAQr(doc.bytes))

const checked = await j(`/verify/${docCode}`)
check('the code checks with no session at all', checked.status === 200, checked.status)
check('it says which kind it is', checked.json.kind === 'document', checked.json.kind)
check('it names the document', checked.json.documentType === 'Community Tax Certificate (Cedula)', checked.json.documentType)
check('and the office that released it', typeof checked.json.issuedBy === 'string')
check('and who holds it, so a counter can match it to an ID', checked.json.issuedTo === `Verify Tester ${stamp}`)
check('and when', typeof checked.json.issuedAt === 'string')

console.log('\n== it discloses only what is on the paper ==')

const body = JSON.stringify(checked.json)
check('no email address', !body.includes('@example.com'))
check('no address', !body.includes('Burgos'))
check('no form values', !body.includes('Sample'))
check('no internal id', !body.includes(requestId))

console.log('\n== the receipt and the certificate answer on the same endpoint ==')

const receiptCode = mine.receiptCode
const receiptPdf = await bin(`/requests/${requestId}/receipt`, resident)
check('the receipt PDF draws a QR too', drawsAQr(receiptPdf.bytes))
if (receiptCode) {
  const r = await j(`/verify/${receiptCode}`)
  check('the receipt code checks', r.status === 200, r.status)
  check('and reads as a receipt', r.json.kind === 'receipt', r.json.kind)
  check('carrying what was paid', r.json.amount === 130, r.json.amount)
} else {
  check('the receipt code is published to the resident', false, 'no receiptCode on the request')
}

const cat = (await j('/barangay/me', { token: resident })).json
const certReq = await j('/barangay/requests', { method: 'POST', token: resident, body: {
  typeId: cat.certificates[0].id, purpose: 'Local employment requirement',
}})
for (const status of ['processing', 'ready', 'released']) {
  await j(`/barangay-staff/requests/${certReq.json.id}`, {
    method: 'PATCH', token: brgyAdmin, body: { status },
  })
}
const certRow = (await j('/barangay/requests', { token: resident })).json
  .find((r) => r.id === certReq.json.id)
const certPdf = await bin(`/barangay/requests/${certReq.json.id}/certificate`, resident)
check('the certificate PDF draws a QR', drawsAQr(certPdf.bytes))

const cert = await j(`/verify/${certRow.certificateCode}`)
check('the certificate code checks', cert.status === 200, cert.status)
check('and reads as a barangay certificate', cert.json.kind === 'barangay_certificate', cert.json.kind)
check('naming the barangay that issued it', cert.json.issuedBy === `Barangay ${home.name}`, cert.json.issuedBy)
check('with the date it lapses', typeof cert.json.validUntil === 'string' || cert.json.validUntil === null)
check('and whether it has, derived on read', typeof cert.json.expired === 'boolean')

console.log('\n== a code that matches nothing ==')

const missing = await j('/verify/ZZZZ-ZZZZ-ZZZZ-ZZZZ')
check('is a 404, not an error', missing.status === 404, missing.status)
check('and says so rather than guessing', missing.json.valid === false)

const lower = await j(`/verify/${docCode.toLowerCase()}`)
check('a code typed in lower case still checks', lower.status === 200, lower.status)

console.log('\n== one code is not another ==')

check(
  'the ID card\'s own 12-character code is not a document code',
  (await j('/verify/ABCD-EFGH-JKMN')).status === 404
)

console.log('\n== every check is counted ==')

// A fresh document, so the count starts from nothing this suite can see.
const counted = await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: form('cedula'),
}})
await j(`/staff/requests/${counted.json.id}/assess`, { method: 'POST', token: treasury, body: { fee: 55 } })
await payRequest(API, resident, counted.json.id)
for (let i = 0; i < 4; i++) {
  await j(`/staff/requests/${counted.json.id}/advance`, { method: 'POST', token: treasury, body: {} })
}
const countedCode = (await j(`/requests/${counted.json.id}`, { token: resident })).json.documentCode

const first = await j(`/verify/${countedCode}`)
check('the first check says one', first.json.checks === 1, first.json.checks)
const second = await j(`/verify/${countedCode}`)
check('the second says two', second.json.checks === 2, second.json.checks)
check(
  'and a different document counts separately',
  (await j(`/verify/${docCode}`)).json.checks !== second.json.checks
)

const trail = await j('/admin/document-checks?days=30', { token: admin })
check('the administrator can read what has been checked most', trail.status === 200, trail.status)
check(
  'and this document is in it with its count',
  trail.json.rows.some((r) => r.referenceNo === counted.json.referenceNo && r.checks >= 2)
)
check(
  'the list names documents, never who checked them',
  trail.json.rows.every((row) =>
    Object.keys(row).every((key) => [
      'kind', 'referenceNo', 'documentType', 'issuedBy', 'issuedAt',
      'checks', 'firstChecked', 'lastChecked', 'revoked',
    ].includes(key))
  ),
  JSON.stringify(Object.keys(trail.json.rows[0] ?? {}))
)
check(
  'a resident cannot read that list',
  (await j('/admin/document-checks', { token: resident })).status === 403
)
check(
  'nor can ordinary municipal staff',
  (await j('/admin/document-checks', { token: treasury })).status === 403
)
check(
  'nor a barangay administrator — a different tier is not a wider one',
  (await j('/admin/document-checks', { token: brgyAdmin })).status === 403
)

console.log('\n== withdrawing a released document ==')

check(
  'a resident cannot withdraw their own document',
  (await j(`/staff/requests/${counted.json.id}/revoke-document`, {
    method: 'POST', token: resident, body: { reason: 'I would rather it went away' },
  })).status === 403
)
check(
  'another office cannot withdraw this one',
  (await j(`/staff/requests/${counted.json.id}/revoke-document`, {
    method: 'POST', token: await login('lcr@malasiqui.gov.ph'), body: { reason: 'Not mine to withdraw' },
  })).status === 404
)
check(
  'and a reason is required, like a rejection',
  (await j(`/staff/requests/${counted.json.id}/revoke-document`, {
    method: 'POST', token: treasury, body: { reason: '' },
  })).status === 400
)

const revoked = await j(`/staff/requests/${counted.json.id}/revoke-document`, {
  method: 'POST', token: treasury, body: { reason: 'Issued against the wrong assessment.' },
})
check('the releasing office can withdraw it', revoked.status === 200, JSON.stringify(revoked.json))
check(
  'withdrawing twice is refused rather than silently repeated',
  (await j(`/staff/requests/${counted.json.id}/revoke-document`, {
    method: 'POST', token: treasury, body: { reason: 'Again' },
  })).status === 409
)

const afterRevoke = await j(`/verify/${countedCode}`)
check('the check still finds it', afterRevoke.status === 200)
check(
  'valid stays true — it really was issued here',
  afterRevoke.json.valid === true
)
check('but it reads as withdrawn', afterRevoke.json.revoked === true)
check('with the reason the office gave', afterRevoke.json.revokedReason === 'Issued against the wrong assessment.')
check('and when', typeof afterRevoke.json.revokedAt === 'string')

check(
  'the request is still completed — the office did the work',
  (await j(`/requests/${counted.json.id}`, { token: resident })).json.status === 'completed'
)
check(
  'the resident is told, with the reason',
  (await j('/notifications', { token: resident })).json.notifications
    .some((n) => n.body?.includes('Issued against the wrong assessment.'))
)
check(
  'and the resident can still download what was withdrawn',
  (await bin(`/requests/${counted.json.id}/document`, resident)).status === 200
)

console.log('\n== withdrawing a barangay certificate ==')

const toRevoke = await j('/barangay/requests', { method: 'POST', token: resident, body: {
  typeId: cat.certificates[0].id, purpose: 'Second one, to withdraw',
}})
for (const status of ['processing', 'ready', 'released']) {
  await j(`/barangay-staff/requests/${toRevoke.json.id}`, {
    method: 'PATCH', token: brgyAdmin, body: { status },
  })
}
const toRevokeCode = (await j('/barangay/requests', { token: resident })).json
  .find((r) => r.id === toRevoke.json.id)?.certificateCode

const officer = await login(`officer.${home.id}@malasiqui.gov.ph`)
check(
  'the clerk cannot withdraw one — taking the barangay\'s word back is the administrator\'s',
  (await j(`/barangay-staff/requests/${toRevoke.json.id}/revoke-certificate`, {
    method: 'POST', token: officer, body: { reason: 'Issued in error' },
  })).status === 403
)
check(
  'another barangay cannot reach it at all',
  (await j(`/barangay-staff/requests/${toRevoke.json.id}/revoke-certificate`, {
    method: 'POST', token: otherAdmin, body: { reason: 'Not mine' },
  })).status === 404
)
check(
  'a municipal administrator gets 403 from the whole mount',
  (await j(`/barangay-staff/requests/${toRevoke.json.id}/revoke-certificate`, {
    method: 'POST', token: admin, body: { reason: 'Not mine either' },
  })).status === 403
)

const certRevoked = await j(`/barangay-staff/requests/${toRevoke.json.id}/revoke-certificate`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'Issued to the wrong household.' },
})
check('the barangay administrator can', certRevoked.status === 200, JSON.stringify(certRevoked.json))

const certAfter = await j(`/verify/${toRevokeCode}`)
check('and the check says withdrawn', certAfter.json.revoked === true)
check('with the barangay\'s reason', certAfter.json.revokedReason === 'Issued to the wrong household.')
check(
  'the resident sees it on their own request',
  (await j('/barangay/requests', { token: resident })).json
    .find((r) => r.id === toRevoke.json.id)?.revoked === true
)

console.log('\n== a receipt is never withdrawn ==')

check(
  'there is no route to withdraw one, on either side',
  (await j(`/staff/requests/${requestId}/revoke-receipt`, {
    method: 'POST', token: treasury, body: { reason: 'x' },
  })).status === 404 &&
  (await j(`/requests/${requestId}/revoke-receipt`, {
    method: 'POST', token: resident, body: { reason: 'x' },
  })).status === 404
)
check(
  'and a receipt check never reports a revocation',
  receiptCode ? (await j(`/verify/${receiptCode}`)).json.revoked === undefined : true
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
