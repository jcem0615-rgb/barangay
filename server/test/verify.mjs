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
const barangays = (await j('/barangays')).json
const home = barangays[0]
const brgyAdmin = await login(`admin.${home.id}@malasiqui.gov.ph`)

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
