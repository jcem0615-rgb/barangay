// The barangay tier: who may file, who may act, the fixed order a certificate
// moves through, and — the one that matters — that a barangay can see and touch
// nothing outside its own.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: SEED_PASSWORD } })).json?.token

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag) => (await j('/auth/register', { method: 'POST', body: {
  email: `brgy.${tag}.${stamp}@example.com`, password: 'barangay-ko-2026',
  fullName: `Taga ${tag} ${stamp}`, birthDate: '1990-05-06',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

console.log('\n== the public list ==')

const list = await j('/barangays')
check('the barangays are public, before any account', list.status === 200 && list.json.length > 1, list.status)
// Poblacion, because the seed gives an officer account to the first barangay
// only and this suite needs both roles in one of them.
const first = list.json.find((b) => b.id === 'poblacion')
const second = list.json.find((b) => b.id !== first.id)
check('every barangay carries a name', list.json.every((b) => b.name), '')

const types = await j('/barangays/certificates')
check('the certificate catalogue is public', types.status === 200 && types.json.length > 0, types.status)
check(
  'indigency is free — charging for proof of poverty is what it exists to relieve',
  types.json.find((t) => t.id === 'indigency')?.fee === 0,
  JSON.stringify(types.json.find((t) => t.id === 'indigency'))
)

console.log('\n== a resident has to say where they live ==')

const resident = await register('a')
const outsider = await register('b')

const beforeChoosing = await j('/barangay/me', { token: resident })
check('before choosing, there is no barangay', beforeChoosing.status === 200 && beforeChoosing.json.barangay === null, JSON.stringify(beforeChoosing.json))

const tooEarly = await j('/barangay/requests', { method: 'POST', token: resident, body: { typeId: 'clearance', purpose: 'Employment' } })
check('nothing can be filed until they do', tooEarly.status === 409, tooEarly.status)

const madeUp = await j('/barangay/me', { method: 'PUT', token: resident, body: { barangayId: 'not-a-barangay' } })
check('a barangay outside this municipality is refused', madeUp.status === 404, madeUp.status)

check('choosing one works', (await j('/barangay/me', { method: 'PUT', token: resident, body: { barangayId: first.id } })).status === 200)
check('and the outsider picks a different one', (await j('/barangay/me', { method: 'PUT', token: outsider, body: { barangayId: second.id } })).status === 200)

const mine = await j('/barangay/me', { token: resident })
check('the hub names their barangay and what it charges', mine.json.barangay.id === first.id && mine.json.certificates.length > 0, JSON.stringify(mine.json.barangay))

console.log('\n== filing ==')

const blank = await j('/barangay/requests', { method: 'POST', token: resident, body: { typeId: 'clearance', purpose: 'x' } })
check('a purpose too short to write on a certificate is refused', blank.status === 400, blank.status)

const noSuch = await j('/barangay/requests', { method: 'POST', token: resident, body: { typeId: 'dragon-licence', purpose: 'Slaying' } })
check('a certificate the barangay does not issue is refused', noSuch.status === 404, noSuch.status)

const filed = await j('/barangay/requests', { method: 'POST', token: resident, body: { typeId: 'clearance', purpose: 'Local employment requirement' } })
check('filing works', filed.status === 201, filed.status)
check('and comes back with a reference', /^BRGY-\d{4}-\d{5}$/.test(filed.json?.referenceNo ?? ''), filed.json?.referenceNo)
const clearanceFee = mine.json.certificates.find((c) => c.id === 'clearance').fee
check('priced at what the resident was quoted', filed.json.fee === clearanceFee, `${filed.json.fee} vs ${clearanceFee}`)

const second_ = await j('/barangay/requests', { method: 'POST', token: resident, body: { typeId: 'indigency', purpose: 'Hospital bill assistance' } })
check('a second reference is a new number, never a reused one', second_.json.referenceNo !== filed.json.referenceNo, second_.json.referenceNo)

const outsiderFiled = await j('/barangay/requests', { method: 'POST', token: outsider, body: { typeId: 'clearance', purpose: 'Bank requirement' } })
check('the outsider files to their own barangay', outsiderFiled.status === 201, outsiderFiled.status)

const myList = await j('/barangay/requests', { token: resident })
check('a resident sees only their own', myList.json.every((r) => r.referenceNo !== outsiderFiled.json.referenceNo) && myList.json.length >= 2, myList.json.length)

console.log('\n== who may work the queue ==')

const residentQueue = await j('/barangay-staff/requests', { token: resident })
check('a resident cannot open the barangay queue', residentQueue.status === 403, residentQueue.status)

const municipalStaff = await login('bpls@malasiqui.gov.ph')
const municipalPeek = await j('/barangay-staff/requests', { token: municipalStaff })
check('nor can municipal staff — a different tier, not a wider one', municipalPeek.status === 403, municipalPeek.status)

const municipalAdmin = await login('admin@malasiqui.gov.ph')
check('nor the municipal administrator', (await j('/barangay-staff/requests', { token: municipalAdmin })).status === 403)

const brgyAdmin = await login(`admin.${first.id}@malasiqui.gov.ph`)
const brgyOfficer = await login(`officer.${first.id}@malasiqui.gov.ph`)
const otherAdmin = await login(`admin.${second.id}@malasiqui.gov.ph`)
check('the barangay accounts exist and sign in', Boolean(brgyAdmin && brgyOfficer && otherAdmin))

const me = await j('/barangay-staff/me', { token: brgyOfficer })
check('an officer gets their own barangay, not a choice of them', me.json?.barangay?.id === first.id, JSON.stringify(me.json))

console.log('\n== isolation ==')

const ourQueue = await j('/barangay-staff/requests', { token: brgyOfficer })
check('our queue holds our request', ourQueue.json.some((r) => r.id === filed.json.id), ourQueue.status)
check(
  "and nothing from the next barangay over",
  ourQueue.json.every((r) => r.id !== outsiderFiled.json.id),
  ourQueue.json.length
)

const reachAcross = await j(`/barangay-staff/requests/${outsiderFiled.json.id}`, {
  method: 'PATCH', token: brgyOfficer, body: { status: 'processing' },
})
check(
  "another barangay's request is not found rather than refused — there is nowhere to name one",
  reachAcross.status === 404,
  reachAcross.status
)

console.log('\n== the order it moves in ==')

const skip = await j(`/barangay-staff/requests/${filed.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'released' } })
check('a new request cannot be released without being prepared', skip.status === 409, skip.status)

check('pending -> processing', (await j(`/barangay-staff/requests/${filed.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'processing' } })).status === 200)
check('processing -> ready', (await j(`/barangay-staff/requests/${filed.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'ready' } })).status === 200)

const residentView = await j('/barangay/requests', { token: resident })
check('the resident sees it is ready', residentView.json.find((r) => r.id === filed.json.id)?.status === 'ready')

const notes = await j('/notifications', { token: resident })
check(
  'and was told, in words that say where to collect it',
  notes.json.notifications.some((n) => n.title.includes(filed.json.referenceNo) && /ready/i.test(n.title)),
  JSON.stringify(notes.json.notifications.slice(0, 3))
)

check('ready -> released', (await j(`/barangay-staff/requests/${filed.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'released' } })).status === 200)
const closed = await j(`/barangay-staff/requests/${filed.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'processing' } })
check('a released certificate cannot be walked backwards', closed.status === 409, closed.status)

const silentReject = await j(`/barangay-staff/requests/${second_.json.id}`, { method: 'PATCH', token: brgyOfficer, body: { status: 'rejected' } })
check('refusing without a reason is refused', silentReject.status === 400, silentReject.status)

const rejected = await j(`/barangay-staff/requests/${second_.json.id}`, {
  method: 'PATCH', token: brgyOfficer, body: { status: 'rejected', note: 'Come in with proof of residence first.' },
})
check('refusing with one works', rejected.status === 200, rejected.status)
const afterReject = await j('/barangay/requests', { token: resident })
check(
  'and the reason reaches the resident',
  afterReject.json.find((r) => r.id === second_.json.id)?.note?.includes('proof of residence'),
  JSON.stringify(afterReject.json.find((r) => r.id === second_.json.id))
)

console.log('\n== what only the administrator decides ==')

const officerFees = await j('/barangay-staff/fees', { token: brgyOfficer })
check('an officer does not set fees', officerFees.status === 403, officerFees.status)
check('nor read the officer list', (await j('/barangay-staff/officers', { token: brgyOfficer })).status === 403)
check('nor the summary', (await j('/barangay-staff/summary', { token: brgyOfficer })).status === 403)

const fees = await j('/barangay-staff/fees', { token: brgyAdmin })
check('the administrator reads the fees as this barangay has them', fees.status === 200 && fees.json.length > 0, fees.status)

const silly = await j('/barangay-staff/fees/clearance', { method: 'PUT', token: brgyAdmin, body: { fee: -5 } })
check('a negative fee is refused', silly.status === 400, silly.status)
const unknownType = await j('/barangay-staff/fees/dragon-licence', { method: 'PUT', token: brgyAdmin, body: { fee: 10 } })
check('a fee for a certificate that does not exist is refused', unknownType.status === 404, unknownType.status)

check('setting one works', (await j('/barangay-staff/fees/clearance', { method: 'PUT', token: brgyAdmin, body: { fee: 75 } })).status === 200)
const quoted = await j('/barangay/me', { token: resident })
check('a resident here is now quoted the new fee', quoted.json.certificates.find((c) => c.id === 'clearance').fee === 75, JSON.stringify(quoted.json.certificates.find((c) => c.id === 'clearance')))
const elsewhere = await j('/barangay/me', { token: outsider })
check(
  'and a resident of the next barangay is not — a fee is one barangay’s to set',
  elsewhere.json.certificates.find((c) => c.id === 'clearance').fee !== 75,
  JSON.stringify(elsewhere.json.certificates.find((c) => c.id === 'clearance'))
)
const alreadyFiled = await j('/barangay/requests', { token: resident })
check(
  'a request already filed keeps the fee it was quoted',
  alreadyFiled.json.find((r) => r.id === filed.json.id)?.fee === clearanceFee,
  alreadyFiled.json.find((r) => r.id === filed.json.id)?.fee
)

const officers = await j('/barangay-staff/officers', { token: brgyAdmin })
check('the administrator sees who can sign in here', officers.status === 200 && officers.json.length >= 2, officers.json?.length)
check('and only accounts of this barangay', officers.json.every((o) => o.role.startsWith('barangay_')), '')

const summary = await j('/barangay-staff/summary', { token: brgyAdmin })
check('the summary counts this barangay only', summary.status === 200 && summary.json.barangay === first.name, JSON.stringify(summary.json))
check('released requests are counted', summary.json.counts.released >= 1, summary.json.counts.released)
check(
  'and only released fees are called collected',
  summary.json.collected >= clearanceFee,
  summary.json.collected
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
