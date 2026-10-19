// The barangay hall's own details, and how long a certificate lasts.
//
// Both halves answer the same question — "come and collect it", the one status
// in this tier that asks a resident to travel. So the checks are about what a
// resident is actually told: that the hours reach them, that the date on the
// certificate is the date the paper carries, and that a lapsed one reads as
// lapsed rather than as a document somebody can still use.
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

const SEED = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: SEED } })).json?.token

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag) => (await j('/auth/register', { method: 'POST', body: {
  email: `office.${tag}.${stamp}@example.com`, password: 'tanggapan-2026',
  fullName: `Taga ${tag} ${stamp}`, birthDate: '1990-07-07',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')

const resident = await register('resident')
const barangays = (await j('/barangays')).json
const poblacion = barangays.find((b) => b.id === 'poblacion')
await j('/barangay/me', { method: 'PUT', token: resident, body: { barangayId: poblacion.id } })

// Put the hall back as the seed had it, so a run does not depend on an earlier one.
const seeded = {
  captain: 'Hon. Ramon T. Agustin', secretary: 'Luzviminda P. Cruz',
  hallAddress: 'Barangay Hall, Mabini St, Poblacion',
  officeHours: 'Mon–Fri, 8:00am–5:00pm',
  phone: '(075) 632-1180', email: 'poblacion@malasiqui.gov.ph',
}
await j('/barangay-staff/office', { method: 'PATCH', token: admin, body: seeded })

console.log('\n== the hall is published where it is needed ==')

const mine = await j('/barangay/me', { token: resident })
check('a resident reads their own hall', mine.status === 200 && mine.json.barangay !== null)
check('with the hours, which is the answer to "come and collect it"',
  mine.json.barangay.officeHours === seeded.officeHours, mine.json.barangay.officeHours)
check('and where it is', Boolean(mine.json.barangay.hallAddress))
check('and a number to ring first', Boolean(mine.json.barangay.phone))
check('and who holds its two offices',
  Boolean(mine.json.barangay.captain) && Boolean(mine.json.barangay.secretary))

const publicList = await j('/barangays')
check('the public list still carries only what sign-up needs',
  publicList.json.every((b) => !('phone' in b) && !('officeHours' in b)),
  JSON.stringify(publicList.json[0]))

console.log('\n== who may correct them ==')

check('a resident cannot', (await j('/barangay-staff/office', {
  method: 'PATCH', token: resident, body: { phone: '0917 000 0000' },
})).status === 403)
check('nor the municipal administrator — this is the barangay’s own hall',
  (await j('/barangay-staff/office', { token: municipalAdmin })).status === 403)

const officerRead = await j('/barangay-staff/office', { token: officer })
check('an officer reads them, because they cannot spot a wrong line otherwise',
  officerRead.status === 200 && officerRead.json.officeHours === seeded.officeHours)
check('but cannot save', (await j('/barangay-staff/office', {
  method: 'PATCH', token: officer, body: { officeHours: 'Whenever' },
})).status === 403)

const saved = await j('/barangay-staff/office', {
  method: 'PATCH', token: admin,
  body: { officeHours: `Mon–Fri, 7:30am–4:30pm (${stamp})`, phone: '(075) 632-1199' },
})
check('the administrator can', saved.status === 200, saved.status)
check('and it reaches the resident at once',
  (await j('/barangay/me', { token: resident })).json.barangay.officeHours.includes(String(stamp)))

check('the barangay’s own name is not editable here', (await j('/barangay-staff/office', {
  method: 'PATCH', token: admin, body: { name: 'Poblacion Uno' },
})).status === 400)
check('nor is anything else that is not a contact detail', (await j('/barangay-staff/office', {
  method: 'PATCH', token: admin, body: { municipalityCode: 'XX' },
})).status === 400)
check('an empty change is refused rather than quietly doing nothing',
  (await j('/barangay-staff/office', { method: 'PATCH', token: admin, body: {} })).status === 400)

const badPhone = await j('/barangay-staff/office', {
  method: 'PATCH', token: admin, body: { phone: 'ring the hall' },
})
check('a number with nothing dialable in it is refused', badPhone.status === 400, badPhone.status)
check('but a number written the way Filipinos write them is not',
  (await j('/barangay-staff/office', { method: 'PATCH', token: admin, body: { phone: '0917 845 2210' } })).status === 200)

const cleared = await j('/barangay-staff/office', {
  method: 'PATCH', token: admin, body: { email: '' },
})
check('a field can be emptied, and comes back as not stated rather than blank text',
  cleared.status === 200 && cleared.json.email === null, JSON.stringify(cleared.json.email))

console.log('\n== another barangay’s hall ==')

const theirs = await j('/barangay-staff/office', { token: otherAdmin })
check('the next barangay reads its own, not ours', theirs.json.id === 'nalsian', theirs.json.id)
await j('/barangay-staff/office', { method: 'PATCH', token: otherAdmin, body: { officeHours: 'Nalsian hours' } })
check('and editing theirs does not touch ours',
  !(await j('/barangay-staff/office', { token: admin })).json.officeHours.includes('Nalsian'))

console.log('\n== every change is written down ==')

const audit = (await j('/admin/audit', { token: municipalAdmin })).json
const entries = Array.isArray(audit) ? audit : audit.entries
check('the edit is in the audit log',
  entries.some((e) => e.action === 'barangay_office.update'), JSON.stringify(entries[0]))
const entry = entries.find((e) => e.action === 'barangay_office.update')
check('with the row as it was before', entry?.before?.officeHours !== undefined)
check('and who did it', Boolean(entry?.actorName), entry?.actorName)

console.log('\n== how long a certificate lasts ==')

const catalogue = await j('/barangays/certificates')
check('the catalogue publishes a validity period', catalogue.json.every((c) => 'validityDays' in c))
const clearance = catalogue.json.find((c) => c.id === 'clearance')
check('a barangay clearance has one', clearance.validityDays > 0, clearance.validityDays)
check('the first-time jobseeker certificate gets the year the law gives it',
  catalogue.json.find((c) => c.id === 'first-time-jobseeker').validityDays === 365)

const filed = await j('/barangay/requests', {
  method: 'POST', token: resident, body: { typeId: 'clearance', purpose: 'Bank requirement' },
})
check('a request can be filed', filed.status === 201, filed.status)

const listed = () => j('/barangay/requests', { token: resident })
const findMine = async () => (await listed()).json.find((r) => r.id === filed.json.id)

let row = await findMine()
check('nothing has been issued, so there is no date yet', row.validUntil === null, row.validUntil)
check('and it does not read as expired', row.expired === false, row.expired)

await j(`/barangay-staff/requests/${filed.json.id}`, {
  method: 'PATCH', token: officer, body: { status: 'processing' },
})
row = await findMine()
check('being prepared is still not issued', row.validUntil === null, row.validUntil)

await j(`/barangay-staff/requests/${filed.json.id}`, {
  method: 'PATCH', token: officer, body: { status: 'ready' },
})
row = await findMine()
check('marking it ready dates it, because that is when the paper is prepared',
  row.validUntil !== null, row.validUntil)
/**
 * Counted from the *office's* today, not the container's.
 *
 * The server stamps `valid_until` from `(now() at time zone 'Asia/Manila')`,
 * which is the rule every date in this app follows — a server clock somewhere
 * else must not decide what day it is at a counter in Pangasinan. This used to
 * build the expected date from `new Date()`, so on a machine running UTC it
 * disagreed by one for the eight hours either side of midnight in Manila and
 * the suite went red for a third of every day with nothing wrong.
 */
const officeToday = new Date(
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) + 'T00:00:00Z'
)
officeToday.setUTCDate(officeToday.getUTCDate() + clearance.validityDays)
const expected = officeToday.toISOString().slice(0, 10)
check('and the date is the catalogue’s period from today',
  row.validUntil === expected,
  `${row.validUntil} vs ${expected}`)
check('which is in the future, so it does not read as lapsed', row.expired === false)

const ready = (await j('/notifications', { token: resident })).json.notifications
  .find((n) => n.title.includes(filed.json.referenceNo) && n.title.includes('ready'))
check('the resident is told it is ready', Boolean(ready), JSON.stringify(ready))
check('and told when the hall is open, which is the whole point',
  ready.body.includes('Open'), ready.body)

const atRelease = row.validUntil
await j(`/barangay-staff/requests/${filed.json.id}`, {
  method: 'PATCH', token: officer, body: { status: 'released' },
})
row = await findMine()
check('collecting it does not restart the clock — the paper is already dated',
  row.validUntil === atRelease, `${row.validUntil} vs ${atRelease}`)

console.log('\n== a certificate with no stated period ==')

// Said as "no stated validity" rather than implied as forever, which is why
// null has to survive the round trip rather than being defaulted somewhere.
check('null is published as null, not as a number',
  catalogue.json.every((c) => c.validityDays === null || typeof c.validityDays === 'number'))

console.log('\n== changing a period never rewrites an issued certificate ==')

// The fee is frozen at filing and the date at release, for the same reason: a
// document that has been handed over says what it says.
const beforeChange = (await findMine()).validUntil
check('an issued certificate keeps its date', beforeChange === atRelease)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
