// Putting right a withdrawal, and the hall's own signature.
//
// Withdrawing a document is final, and it stays final: the withdrawn copy was
// printed and handed over, so its code has to go on telling a counter not to
// accept it. What was missing was any way out for the resident. A document
// withdrawn in error stranded them — nothing re-released a completed request,
// so they had to file again and pay again for something the office had already
// issued them.
//
// A reissue mints a *new* document instead of reviving the old one. What this
// suite checks is that the two facts stay true together: the new code is good,
// and the old code still answers "withdrawn" — now saying a replacement exists,
// which is the difference between "do not accept this" and "do not accept this,
// ask them for the current one".
//
// The second half is the municipality's own signatory: the hall had a seal and
// no signature, so the one document a resident collects from the municipal hall
// went out over a single office's name.
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

const upload = async (p, token, bytes, name, type, method = 'PUT') => {
  const body = new FormData()
  body.append('file', new Blob([bytes], { type }), name)
  const res = await fetch(API + p, { method, headers: { Authorization: `Bearer ${token}` }, body })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 200) } }
  return { status: res.status, json }
}

const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).json?.token

/** A real 1x1 PNG — the smallest thing the mark rules will actually accept. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * A PNG with the right magic bytes and damaged pixel data.
 *
 * This is here because of a crash, not a theory: pdfkit's decoder inflates the
 * pixel data inside a zlib callback and throws from there, which no try/catch
 * around `doc.image()` can reach — so one of these, stored as a seal, took the
 * whole API down at the next release.
 */
const DAMAGED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * The text printed on a PDF.
 *
 * pdfkit deflates its content streams, so searching the raw bytes for a line
 * finds nothing whether it was drawn or not — which would make an assertion
 * pass for the wrong reason the day the line stopped being printed. Only the
 * hex runs are joined, which drops the kerning numbers pdfkit writes between
 * them and would otherwise cut a word in half.
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
      // Not a deflated stream — an embedded image, or a font.
    }
  }
  return [...drawn.matchAll(/<([0-9A-Fa-f\s]+)>/g)]
    .map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'hex').toString('latin1'))
    .join('')
}

const form = await formFiller(API)
const stamp = Date.now()

const treasury = await login('treasury@malasiqui.gov.ph')
const bpls = await login('bpls@malasiqui.gov.ph')
const admin = await login('admin@malasiqui.gov.ph')
const barangays = (await j('/barangays')).json
const home = barangays.find((b) => b.id === 'poblacion') ?? barangays[0]
const elsewhere = barangays.find((b) => b.id !== home.id)
const brgyAdmin = await login(`admin.${home.id}@malasiqui.gov.ph`)
const brgyOfficer = await login(`officer.${home.id}@malasiqui.gov.ph`)
const otherAdmin = await login(`admin.${elsewhere.id}@malasiqui.gov.ph`)

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `reissue.${stamp}@example.com`, password: 'kapalit-2026',
  fullName: `Reissue Tester ${stamp}`, birthDate: '1990-03-02',
  motherMaidenName: `Maiden ${stamp}`, residesHere: true, barangayId: home.id,
  address: '18 Rizal St., Purok 1',
}})).json?.token

/** Files a cedula, pays it and advances it to released. */
async function releasedRequest() {
  const filed = await j('/requests', { method: 'POST', token: resident, body: {
    serviceId: 'cedula', formValues: form('cedula'),
  }})
  const id = filed.json.id
  await j(`/staff/requests/${id}/assess`, { method: 'POST', token: treasury, body: { fee: 130 } })
  await payRequest(API, resident, id)
  for (let i = 0; i < 4; i++) {
    await j(`/staff/requests/${id}/advance`, { method: 'POST', token: treasury, body: {} })
  }
  return id
}

// ---------------------------------------------------------------------------
console.log('\n== a reissue is reachable only from a withdrawal ==')

const requestId = await releasedRequest()
const firstCode = (await j(`/requests/${requestId}`, { token: resident })).json.documentCode
check('the request has a document', typeof firstCode === 'string' && firstCode.length > 0)

const early = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: treasury, body: { reason: 'nothing is wrong with it' },
})
check('reissuing a live document is refused', early.status === 409, early.status)
check(
  'and the refusal says a replacement is only for one that was withdrawn',
  /withdrawn in error/.test(early.json?.error ?? ''),
  early.json?.error
)

const noReason = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: treasury, body: {},
})
check('and a reissue with no reason is refused', noReason.status === 400, noReason.status)

// ---------------------------------------------------------------------------
console.log('\n== withdrawing, then replacing ==')

await j(`/staff/requests/${requestId}/revoke-document`, {
  method: 'POST', token: treasury, body: { reason: 'Withdrawn by mistake — wrong resident.' },
})
const withdrawn = await j(`/verify/${firstCode}`)
check('the withdrawn code reads as withdrawn', withdrawn.json.revoked === true)
check('and nothing has replaced it yet', withdrawn.json.replaced === false, JSON.stringify(withdrawn.json.replaced))

const reissued = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: treasury, body: { reason: 'Reissued — the withdrawal was an error.' },
})
check('a replacement is issued', reissued.status === 200, JSON.stringify(reissued.json))
const secondCode = reissued.json?.verificationCode
check('with a new code', typeof secondCode === 'string' && secondCode !== firstCode, secondCode)
check('and it names the one it replaced', reissued.json?.replaced === firstCode)

const fresh = await j(`/verify/${secondCode}`)
check('the new code checks out', fresh.status === 200 && fresh.json.valid === true)
check('and is not withdrawn', fresh.json.revoked === false)
check('and says it is a replacement', fresh.json.reissued === true)

const old = await j(`/verify/${firstCode}`)
check('the withdrawn code still answers', old.status === 200)
check('and is still withdrawn — a reissue does not revive it', old.json.revoked === true)
check('and now says a replacement exists', old.json.replaced === true)
check(
  'the reason the office gave is still there',
  /wrong resident/.test(old.json.revokedReason ?? ''),
  old.json.revokedReason
)

// ---------------------------------------------------------------------------
console.log('\n== what each side now holds ==')

const afterResident = (await j(`/requests/${requestId}`, { token: resident })).json
check('the resident sees the new code', afterResident.documentCode === secondCode)
check('and no longer reads as withdrawn', afterResident.documentRevoked === false)
check('and is told this copy is a replacement', afterResident.documentReissued === true)

const residentPdf = await bin(`/requests/${requestId}/document`, resident)
check('the download is the replacement', residentPdf.status === 200)
const printed = pdfText(residentPdf.bytes)
check('and the paper says so on its face', /REISSUED COPY/.test(printed))
check('naming the code it replaces', printed.includes(firstCode), printed.slice(0, 400))

const staffDetail = (await j(`/staff/requests/${requestId}`, { token: treasury })).json
check('the console sees the new code too', staffDetail.documentCode === secondCode)
check('and that it is a replacement', staffDetail.documentReissued === true)
check(
  'the history records the reissue',
  staffDetail.events.some((e) => e.eventType === 'document_reissued'),
  JSON.stringify(staffDetail.events.map((e) => e.eventType))
)
check(
  'and the resident was told',
  (await j('/notifications', { token: resident })).json.notifications.some(
    (n) => /replacement issued/i.test(n.title)
  )
)

// ---------------------------------------------------------------------------
console.log('\n== one live document at a time ==')

const twice = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: treasury, body: { reason: 'and again' },
})
check('reissuing the replacement is refused', twice.status === 409, twice.status)

await j(`/staff/requests/${requestId}/revoke-document`, {
  method: 'POST', token: treasury, body: { reason: 'Second one withdrawn too.' },
})
const third = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: treasury, body: { reason: 'Third copy.' },
})
check('but a second withdrawal can be replaced in turn', third.status === 200, third.status)
const thirdCode = third.json?.verificationCode
check('each copy keeps its own code', new Set([firstCode, secondCode, thirdCode]).size === 3)
check(
  'the first is still withdrawn and replaced',
  (await j(`/verify/${firstCode}`)).json.revoked === true
)
const middle = await j(`/verify/${secondCode}`)
check('so is the second', middle.json.revoked === true && middle.json.replaced === true)
check('and only the third is good', (await j(`/verify/${thirdCode}`)).json.revoked === false)

// ---------------------------------------------------------------------------
console.log('\n== who may reissue a municipal document ==')

const other = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: bpls, body: { reason: 'not my office' },
})
check("another office gets 404, not 403 — there is nowhere to name it", other.status === 404, other.status)

const byResident = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: resident, body: { reason: 'mine now' },
})
check('a resident cannot reach the staff mount at all', byResident.status === 403, byResident.status)

const byBarangay = await j(`/staff/requests/${requestId}/reissue-document`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'wrong tier' },
})
check('nor can a barangay account', byBarangay.status === 403, byBarangay.status)

// ---------------------------------------------------------------------------
console.log('\n== a barangay certificate, withdrawn and replaced ==')

const typeId = (await j('/barangay/me', { token: resident })).json.certificates[0].id
const certFiled = await j('/barangay/requests', { method: 'POST', token: resident, body: {
  typeId, purpose: 'Reissue test',
}})
const certId = certFiled.json?.id
for (const status of ['processing', 'ready', 'released']) {
  await j(`/barangay-staff/requests/${certId}`, {
    method: 'PATCH', token: brgyAdmin, body: { status },
  })
}
const certList = (await j('/barangay/requests', { token: resident })).json
const certRow = certList.find((r) => r.id === certId)
const certCode = certRow?.certificateCode
check('the certificate was released', typeof certCode === 'string' && certCode.length > 0, certCode)
check('and is listed once, not once per copy', certList.filter((r) => r.id === certId).length === 1)

const certEarly = await j(`/barangay-staff/requests/${certId}/reissue-certificate`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'nothing wrong with it' },
})
check('reissuing a live certificate is refused', certEarly.status === 409, certEarly.status)

await j(`/barangay-staff/requests/${certId}/revoke-certificate`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'Withdrawn in error.' },
})
const certReissued = await j(`/barangay-staff/requests/${certId}/reissue-certificate`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'Replacing the one withdrawn in error.' },
})
check('a replacement is issued', certReissued.status === 200, JSON.stringify(certReissued.json))
const certSecond = certReissued.json?.verificationCode
check('with a new code', typeof certSecond === 'string' && certSecond !== certCode)

const certOld = await j(`/verify/${certCode}`)
check('the withdrawn certificate is still withdrawn', certOld.json.revoked === true)
check('and says a replacement exists', certOld.json.replaced === true)
const certNew = await j(`/verify/${certSecond}`)
check('the replacement checks out', certNew.json.valid === true && certNew.json.revoked === false)
check('and says it is a replacement', certNew.json.reissued === true)
check(
  'it carries the same validity date as the one it replaces',
  certNew.json.validUntil === certOld.json.validUntil,
  `${certNew.json.validUntil} vs ${certOld.json.validUntil}`
)

const certRow2 = (await j('/barangay/requests', { token: resident })).json.find((r) => r.id === certId)
check('the resident sees the new code', certRow2.certificateCode === certSecond)
check('and no longer reads as withdrawn', certRow2.revoked === false)
check('and is told it is a replacement', certRow2.reissued === true)

const certPdf = await bin(`/barangay/requests/${certId}/certificate`, resident)
check('the download is the replacement', certPdf.status === 200)
check('and the paper says so', /REISSUED COPY/.test(pdfText(certPdf.bytes)))

const queue = (await j('/barangay-staff/requests', { token: brgyAdmin })).json
check(
  'the console queue lists it once, not once per copy',
  queue.filter((r) => r.id === certId).length === 1,
  queue.filter((r) => r.id === certId).length
)

// ---------------------------------------------------------------------------
console.log('\n== who may reissue a barangay certificate ==')

await j(`/barangay-staff/requests/${certId}/revoke-certificate`, {
  method: 'POST', token: brgyAdmin, body: { reason: 'Withdrawn again for the role checks.' },
})

const byOfficer = await j(`/barangay-staff/requests/${certId}/reissue-certificate`, {
  method: 'POST', token: brgyOfficer, body: { reason: 'the clerk trying it' },
})
check('the clerk is refused — it is the administrator\'s', byOfficer.status === 403, byOfficer.status)

const byElsewhere = await j(`/barangay-staff/requests/${certId}/reissue-certificate`, {
  method: 'POST', token: otherAdmin, body: { reason: 'another barangay trying it' },
})
check(
  "another barangay gets 404 — there is nowhere to name it",
  byElsewhere.status === 404, byElsewhere.status
)

const byMunicipal = await j(`/barangay-staff/requests/${certId}/reissue-certificate`, {
  method: 'POST', token: admin, body: { reason: 'the hall trying it' },
})
check(
  'and the municipal administrator gets 403 from the whole mount',
  byMunicipal.status === 403, byMunicipal.status
)

// ---------------------------------------------------------------------------
console.log('\n== a receipt is never reissued ==')

const receiptCode = (await j(`/requests/${requestId}`, { token: resident })).json.receiptCode
check('the request has a receipt', typeof receiptCode === 'string')
const receiptCheck = await j(`/verify/${receiptCode}`)
check('and it checks out', receiptCheck.json.kind === 'receipt')
check(
  'it reports no revocation and no replacement',
  receiptCheck.json.revoked === undefined && receiptCheck.json.replaced === undefined,
  JSON.stringify({ revoked: receiptCheck.json.revoked, replaced: receiptCheck.json.replaced })
)

// ---------------------------------------------------------------------------
console.log('\n== the municipality\'s own signatory ==')

// Cleared first rather than assumed, so the suite says the same thing on a
// database that has been through it before. What is seeded is checked by the
// seed; what matters here is that an empty one prints nothing.
await j('/admin/municipality/signatory-signature', { method: 'DELETE', token: admin })
await j('/admin/municipality', { method: 'PATCH', token: admin, body: { signatoryName: null } })

const before = (await j('/admin/municipality', { token: admin })).json
check('there is always a title to print', typeof before.signatoryTitle === 'string' && before.signatoryTitle.length > 1, before.signatoryTitle)
check('and the name can be empty', before.signatoryName === null, before.signatoryName)
check('and no signature is on file', before.hasSignatorySignature === false)

// An unnamed signatory prints nothing at all, which is how a hall declines to
// put the mayor on all seventeen services' documents — not a half-finished
// state with a rule over a bare title.
const unsignedId = await releasedRequest()
const unsignedText = pdfText((await bin(`/staff/requests/${unsignedId}/document`, treasury)).bytes)
check(
  'with no name, nothing is printed for the municipality',
  !/For the Municipality/i.test(unsignedText),
  unsignedText.slice(0, 300)
)
check(
  "but the releasing office's own block is still there",
  /Treasurer/i.test(unsignedText)
)

const named = await j('/admin/municipality', { method: 'PATCH', token: admin, body: {
  signatoryName: `Mayor Testing ${stamp}`, signatoryTitle: 'Municipal Mayor',
}})
check('the administrator can name one', named.status === 200, JSON.stringify(named.json))
check('and it reads back', named.json.signatoryName === `Mayor Testing ${stamp}`)

const renamed = await j('/admin/municipality', { method: 'PATCH', token: admin, body: {
  name: 'Somewhere Else',
}})
check(
  "renaming the municipality through this route is refused, not quietly ignored",
  renamed.status === 400, renamed.status
)

const uploaded = await upload('/admin/municipality/signatory-signature', admin, PNG, 'mayor.png', 'image/png')
check('a PNG signature uploads', uploaded.status === 200, JSON.stringify(uploaded.json))
check('and the state says so', uploaded.json.hasSignatorySignature === true)
check('with when it was uploaded', typeof uploaded.json.signatorySignatureUpdatedAt === 'string')

const pdfUpload = await upload(
  '/admin/municipality/signatory-signature', admin,
  Buffer.from('%PDF-1.4\n%%EOF\n'), 'mayor.pdf', 'image/png'
)
check(
  'a PDF renamed as a PNG is refused on its bytes',
  pdfUpload.status === 415, pdfUpload.status
)

const damaged = await upload(
  '/admin/municipality/signatory-signature', admin, DAMAGED_PNG, 'torn.png', 'image/png'
)
check(
  'a PNG whose pixel data is damaged is refused at the upload',
  damaged.status === 422, damaged.status
)
check(
  'and the refusal says what is wrong with it',
  /damaged PNG/.test(damaged.json?.error ?? ''), damaged.json?.error
)

const read = await bin('/admin/municipality/signatory-signature', admin)
check('the console can read it back', read.status === 200 && read.bytes.length > 0)

// All three verbs, not just the two that write. Reading is refused as well:
// the hall's signatory is the hall's, and a barangay administrator has no more
// business fetching the mayor's signature file than replacing it. The whole
// `/admin` mount is behind `requireRole('admin')`, which is what makes this a
// gate rather than three checks somebody has to remember.
for (const [who, token] of [
  ['municipal staff', treasury], ['a barangay administrator', brgyAdmin], ['a resident', resident],
]) {
  const put = await upload('/admin/municipality/signatory-signature', token, PNG, 'x.png', 'image/png')
  const got = await bin('/admin/municipality/signatory-signature', token)
  const del = await j('/admin/municipality/signatory-signature', { method: 'DELETE', token })
  check(`${who} cannot upload one`, put.status === 403, put.status)
  check(`${who} cannot read one`, got.status === 403, got.status)
  check(`${who} cannot remove one`, del.status === 403, del.status)
}

// And the other way: the hall cannot sign for a barangay either. A different
// tier is not a wider one.
for (const who of ['captain', 'secretary']) {
  const put = await upload(
    `/barangay-staff/office/signature/${who}`, admin, PNG, 'x.png', 'image/png'
  )
  check(
    `the municipal administrator cannot upload a barangay's ${who} signature`,
    put.status === 403, put.status
  )
}

console.log('\n== it prints on a released document, and is audited ==')

const signedId = await releasedRequest()
const signedPdf = await bin(`/staff/requests/${signedId}/document`, treasury)
const signedText = pdfText(signedPdf.bytes)
check('the signatory is named on the paper', signedText.includes(`Mayor Testing ${stamp}`), signedText.slice(0, 600))
check('with their title', signedText.includes('Municipal Mayor'))

const trail = (await j('/admin/audit?limit=30', { token: admin })).json
check(
  'the upload is in the audit trail',
  trail.some((r) => r.action === 'municipality.signatory.update'),
  JSON.stringify(trail.slice(0, 4).map((r) => r.action))
)
check(
  'with the actor named beside their id',
  trail.find((r) => r.action === 'municipality.signatory.update')?.actorName?.length > 0
)
check(
  'and the storage key is kept out of it — the trail is read by people',
  !JSON.stringify(trail).includes('signatorySignatureKey')
)

const removed = await j('/admin/municipality/signatory-signature', { method: 'DELETE', token: admin })
check('it can be removed', removed.status === 200 && removed.json.hasSignatorySignature === false)
check(
  'removing it twice is not found',
  (await j('/admin/municipality/signatory-signature', { method: 'DELETE', token: admin })).status === 404
)

const keptPdf = await bin(`/staff/requests/${signedId}/document`, treasury)
check(
  'and a document printed with it is unchanged — frozen at issue',
  keptPdf.bytes.equals(signedPdf.bytes)
)
check(
  'the removal is audited too',
  (await j('/admin/audit?limit=10', { token: admin })).json.some(
    (r) => r.action === 'municipality.signatory.remove'
  )
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
