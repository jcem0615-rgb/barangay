// The electronic official receipt.
//
// Money is the one transaction a resident is most likely to be asked to prove,
// and until this it left them with a line in a list. What is checked here is
// less the PDF than the rules around it: that a settled payment always has a
// receipt, that a retrying gateway cannot mint a second, that the number never
// repeats, that a receipt already issued is frozen against later edits, and
// that the municipality's own details are the administrator's alone to change.
import { readFileSync } from 'node:fs'
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
  const buf = Buffer.from(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type'), bytes: buf }
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

const form = await formFiller(API)
const stamp = Date.now()
const barangays = (await j('/barangays')).json

const register = async (tag, overrides = {}) => {
  const out = await j('/auth/register', { method: 'POST', body: {
    email: `receipt.${tag}.${stamp}@example.com`,
    password: 'resibo-na-2026',
    fullName: `Receipt Tester ${tag}`,
    birthDate: '1990-01-15',
    motherMaidenName: `Maiden ${tag}${stamp}`,
    residesHere: true,
    barangayId: barangays[0]?.id,
    ...overrides,
  }})
  return out.json.token
}

const resident = await register('a', { address: '12 Mabini St., Poblacion' })
const other = await register('b')
const admin = await login('admin@malasiqui.gov.ph')
const treasury = await login('treasury@malasiqui.gov.ph')
const health = await login('health@malasiqui.gov.ph')

/** Files a cedula, has the treasury assess it, and pays through the real flow. */
const paidRequest = async (token, fee) => {
  const filed = await j('/requests', { method: 'POST', token, body: {
    serviceId: 'cedula', formValues: form('cedula'),
  }})
  await j(`/staff/requests/${filed.json.id}/assess`, {
    method: 'POST', token: treasury, body: { fee },
  })
  const reference = await payRequest(API, token, filed.json.id, 'GCash')
  return { id: filed.json.id, reference }
}

console.log('\n== a settled payment always has a receipt ==')

const first = await paidRequest(resident, 310.5)
const detail = await j(`/requests/${first.id}`, { token: resident })
check('the request detail carries the receipt number', typeof detail.json.receiptNo === 'string', detail.json.receiptNo)
check('and when it was issued', typeof detail.json.receiptIssuedAt === 'string')

const poll = await j(`/payments/intents/${first.reference}`, { token: resident })
check('so does the payment the resident just made', poll.json.receiptNo === detail.json.receiptNo)

const pdf = await bin(`/requests/${first.id}/receipt`, resident)
check('the resident can download it', pdf.status === 200, pdf.status)
check('and it is a PDF', pdf.bytes.subarray(0, 5).toString() === '%PDF-')
check('served as a download, not inline', pdf.type === 'application/pdf')

console.log('\n== the number is one series for the municipality ==')

const second = await paidRequest(resident, 90)
const secondDetail = await j(`/requests/${second.id}`, { token: resident })
const seq = (no) => Number(no.split('-').pop())
check(
  'the next receipt takes the next number',
  seq(secondDetail.json.receiptNo) === seq(detail.json.receiptNo) + 1,
  `${detail.json.receiptNo} -> ${secondDetail.json.receiptNo}`
)
check(
  'and carries the configured prefix and year',
  /^[A-Z][A-Z0-9-]*-\d{4}-\d{6}$/.test(secondDetail.json.receiptNo),
  secondDetail.json.receiptNo
)

console.log('\n== one receipt per payment ==')

// Settling again is what a retrying gateway does. It must not mint a second
// receipt, any more than it may take the money twice.
const replay = await j(`/payments/mock/${first.reference}/complete`, { method: 'POST', token: resident, body: { method: 'GCash' } })
const afterReplay = await j(`/requests/${first.id}`, { token: resident })
check('a repeated callback does not issue a second receipt', afterReplay.json.receiptNo === detail.json.receiptNo, `${replay.status} ${afterReplay.json.receiptNo}`)

console.log('\n== whose receipt it is ==')

check(
  "another resident cannot download it",
  (await bin(`/requests/${first.id}/receipt`, other)).status === 404
)
check(
  'and neither can somebody with no session',
  (await bin(`/requests/${first.id}/receipt`, null)).status === 401
)

const unpaid = await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: form('cedula'),
}})
check(
  'a request nobody has paid for has no receipt',
  (await bin(`/requests/${unpaid.json.id}/receipt`, resident)).status === 404
)

console.log('\n== the treasury can reprint one ==')

const reprint = await bin(`/staff/payments/${first.reference}/receipt`, treasury)
check('the treasury gets the receipt', reprint.status === 200, reprint.status)
check(
  'and it is the same bytes the resident has — not a second receipt',
  reprint.bytes.equals(pdf.bytes)
)
check('an admin may too', (await bin(`/staff/payments/${first.reference}/receipt`, admin)).status === 200)
check(
  'another office may not',
  (await bin(`/staff/payments/${first.reference}/receipt`, health)).status === 403
)

const book = await j('/staff/payments?from=2000-01-01&to=2100-01-01', { token: treasury })
const line = book.json.settled.find((r) => r.reference === first.reference)
check('the payment book names the receipt on the line', line?.receiptNo === detail.json.receiptNo)

console.log('\n== anybody holding one can check it ==')

// Public on purpose: whoever is holding the printout already has everything on
// it, and a code that cannot be checked is decoration.
const code = detail.json.receiptCode
check('the resident can read the code off their own receipt', typeof code === 'string', code)

const verified = await j(`/verify/${code}`)
check('and anybody holding it can check it, with no session at all', verified.status === 200 && verified.json.valid === true, verified.status)
check('it says it is a receipt', verified.json.kind === 'receipt')
check('naming the receipt', verified.json.referenceNo === detail.json.receiptNo)
check('who paid', verified.json.issuedTo === 'Receipt Tester a')
check('and how much', verified.json.amount === 310.5, verified.json.amount)

const verifyBad = await j('/verify/ZZZZ-ZZZZ-ZZZZ-ZZZZ')
check('an unknown code is not found', verifyBad.status === 404 && verifyBad.json.valid === false)

console.log('\n== what the municipality prints on it ==')

const details = await j('/admin/municipality', { token: admin })
check('the admin can read the receipt details', details.status === 200, details.status)
check('including the municipality it serves', typeof details.json.name === 'string')
check('staff cannot', (await j('/admin/municipality', { token: health })).status === 403)
check('and neither can a resident', (await j('/admin/municipality', { token: resident })).status === 403)

const edited = await j('/admin/municipality', { method: 'PATCH', token: admin, body: {
  treasurerName: `Treasurer ${stamp}`,
  tin: '123-456-789-00000',
  receiptFormLabel: 'Accountable Form No. 51',
}})
check('the admin can correct them', edited.status === 200 && edited.json.treasurerName === `Treasurer ${stamp}`, edited.status)
check('staff cannot', (await j('/admin/municipality', { method: 'PATCH', token: treasury, body: { tin: '1' } })).status === 403)

// The register decides what a place is called. An unknown key is stripped, so
// the request has nothing left to change and is refused rather than quietly
// doing something different.
const rename = await j('/admin/municipality', { method: 'PATCH', token: admin, body: { name: 'Elsewhere', province: 'Nowhere' } })
check('the municipality cannot be renamed through it', rename.status === 400, rename.status)
check('and the name is untouched', (await j('/admin/municipality', { token: admin })).json.name === details.json.name)

const badPrefix = await j('/admin/municipality', { method: 'PATCH', token: admin, body: { receiptPrefix: 'lower case' } })
check('a series prefix that cannot be read down a phone is refused', badPrefix.status === 400, badPrefix.status)

console.log('\n== a receipt already issued is frozen ==')

const afterEdit = await bin(`/requests/${first.id}/receipt`, resident)
check(
  'changing the treasurer does not rewrite a receipt somebody is holding',
  afterEdit.bytes.equals(pdf.bytes)
)
const third = await paidRequest(resident, 55)
const freshPdf = await bin(`/requests/${third.id}/receipt`, resident)
check('but the next receipt carries the correction', !freshPdf.bytes.equals(pdf.bytes))

console.log('\n== the seal ==')

// A 1x1 PNG, which is all the type check and the renderer need.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const PDF_BYTES = Buffer.from('%PDF-1.4\n% not a seal\n', 'utf8')

check(
  'a PDF is not a seal',
  (await upload('/admin/municipality/seal', admin, PDF_BYTES, 'seal.png')).status === 415
)
check(
  'and staff cannot upload one',
  (await upload('/admin/municipality/seal', treasury, PNG, 'seal.png')).status === 403
)

const sealed = await upload('/admin/municipality/seal', admin, PNG, 'seal.png')
check('the admin can upload one', sealed.status === 200 && sealed.json.hasSeal === true, sealed.status)
check('and it records when', typeof sealed.json.sealUpdatedAt === 'string')

const sealImage = await bin('/admin/municipality/seal', admin)
check('the console can render it', sealImage.status === 200 && sealImage.type === 'image/png', `${sealImage.status} ${sealImage.type}`)
check('staff cannot read it', (await bin('/admin/municipality/seal', health)).status === 403)

const sealedReceipt = await paidRequest(resident, 25)
const withSeal = await bin(`/requests/${sealedReceipt.id}/receipt`, resident)
check('a receipt issued now still renders', withSeal.status === 200 && withSeal.bytes.subarray(0, 5).toString() === '%PDF-')

const removed = await j('/admin/municipality/seal', { method: 'DELETE', token: admin })
check('the admin can remove it', removed.status === 200 && removed.json.hasSeal === false, removed.status)
check('removing it twice is not found', (await j('/admin/municipality/seal', { method: 'DELETE', token: admin })).status === 404)
check(
  'and the receipt printed with it is unchanged',
  (await bin(`/requests/${sealedReceipt.id}/receipt`, resident)).bytes.equals(withSeal.bytes)
)

console.log('\n== every change is on the record ==')

const audit = await j('/admin/audit?limit=40', { token: admin })
const actions = audit.json.map((r) => r.action)
check('the edit is audited', actions.includes('municipality.update'))
check('so is the seal going on', actions.includes('municipality.seal.update'))
check('and coming off', actions.includes('municipality.seal.remove'))
const entry = audit.json.find((r) => r.action === 'municipality.update')
check('with the value it used to be', entry?.before !== null && entry?.before !== undefined)

// The treasury reconciles against what a receipt says, so it reads the same
// trail: a TIN that moved without anybody noticing is found out by whoever
// audits them.
const fees = await j('/staff/fee-changes', { token: treasury })
check('and the treasury can see it', fees.json.some((r) => r.action === 'municipality.update'), fees.status)
check(
  'but another office still cannot',
  (await j('/staff/fee-changes', { token: health })).status === 403
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 1 && 0 : 1)
