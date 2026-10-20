// The certificate catalogue, who owns which half of it, and the fee trail the
// treasury reconciles against.
//
// The load-bearing claim is the split: shared documents are the municipality's,
// a barangay's own are its own, and neither side can reach the other's — nor
// can one barangay see another's. That last one is the leak worth testing for,
// because the column that makes a certificate private is new.
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

const municipalAdmin = await login('admin@malasiqui.gov.ph')
const treasury = await login('treasury@malasiqui.gov.ph')
const bpls = await login('bpls@malasiqui.gov.ph')
const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const kagawad = await login('kagawad.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian-norte@malasiqui.gov.ph')

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `cert.${stamp}@example.com`, password: 'katibayan-2026',
  fullName: `Taga Poblacion ${stamp}`, birthDate: '1990-02-02',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token
await j('/barangay/me', { method: 'PUT', token: resident, body: { barangayId: 'poblacion' } })

console.log('\n== the shared catalogue is the municipality’s ==')

const shared = await j('/admin/certificates', {
  method: 'POST', token: municipalAdmin,
  body: {
    name: `Barangay Certification ${stamp}`,
    description: 'A shared document added by the hall for every barangay to issue.',
    fee: 60, validityDays: 180,
  },
})
check('the municipal administrator can add one', shared.status === 201, JSON.stringify(shared.json))
check('and it lands in the shared catalogue', shared.json.barangayId === null, shared.json.barangayId)

check('a barangay administrator cannot add to the shared catalogue',
  (await j('/admin/certificates', { method: 'POST', token: admin, body: {
    name: 'Sneaky', description: 'Trying to add to everyone’s list.', fee: 0,
  } })).status === 403)
check('nor can an office', (await j('/admin/certificates', { token: bpls })).status === 403)

check('every barangay sees the new shared one',
  (await j('/barangay-staff/certificates', { token: otherAdmin }))
    .json.some((c) => c.id === shared.json.id))
check('and it is read-only to them',
  (await j('/barangay-staff/certificates', { token: admin }))
    .json.find((c) => c.id === shared.json.id)?.own === false)
check('so a barangay cannot edit it', (await j(`/barangay-staff/certificates/${shared.json.id}`, {
  method: 'PATCH', token: admin, body: { name: 'Renamed by Poblacion' },
})).status === 404)
check('nor withdraw it', (await j(`/barangay-staff/certificates/${shared.json.id}`, {
  method: 'DELETE', token: admin,
})).status === 404)

console.log('\n== a barangay’s own certificate ==')

const own = await j('/barangay-staff/certificates', {
  method: 'POST', token: admin,
  body: {
    name: `Tricycle Sticker ${stamp}`,
    description: 'Something only this barangay issues, for its own tricycle operators.',
    fee: 120,
  },
})
check('a barangay administrator can add one', own.status === 201, JSON.stringify(own.json))
check('scoped to their own barangay', own.json.barangayId === 'poblacion', own.json.barangayId)

check('an officer cannot add one', (await j('/barangay-staff/certificates', {
  method: 'POST', token: officer, body: { name: 'Nope', description: 'Not the clerk’s to decide.', fee: 0 },
})).status === 403)
check('and neither can a kagawad', (await j('/barangay-staff/certificates', {
  method: 'POST', token: kagawad, body: { name: 'Nope', description: 'Not the council’s to decide.', fee: 0 },
})).status === 403)

console.log('\n== and no other barangay can see it ==')

const theirs = await j('/barangay-staff/certificates', { token: otherAdmin })
check('the next barangay does not list it', theirs.json.every((c) => c.id !== own.json.id))
check('cannot edit it', (await j(`/barangay-staff/certificates/${own.json.id}`, {
  method: 'PATCH', token: otherAdmin, body: { name: 'Taken over' },
})).status === 404)
check('cannot withdraw it', (await j(`/barangay-staff/certificates/${own.json.id}`, {
  method: 'DELETE', token: otherAdmin,
})).status === 404)
check('and cannot price it', (await j(`/barangay-staff/fees/${own.json.id}`, {
  method: 'PUT', token: otherAdmin, body: { fee: 1 },
})).status === 404)

// The public catalogue is read before anybody has an account, so it must carry
// the shared documents and none of anybody's private ones.
const publicList = await j('/barangays/certificates')
check('the public catalogue carries the shared one',
  publicList.json.some((c) => c.id === shared.json.id))
check('and no barangay’s own', publicList.json.every((c) => c.id !== own.json.id))

console.log('\n== what the resident is offered ==')

const mine = await j('/barangay/me', { token: resident })
check('a resident of this barangay is offered its own certificate',
  mine.json.certificates.some((c) => c.id === own.json.id))
check('and the shared one', mine.json.certificates.some((c) => c.id === shared.json.id))

const filed = await j('/barangay/requests', {
  method: 'POST', token: resident, body: { typeId: own.json.id, purpose: 'Tricycle operation' },
})
check('and can actually file for it', filed.status === 201, filed.status)

console.log('\n== editing and withdrawing ==')

const edited = await j(`/barangay-staff/certificates/${own.json.id}`, {
  method: 'PATCH', token: admin, body: { fee: 150, validityDays: 365 },
})
check('a barangay can re-price its own', edited.status === 200 && edited.json.fee === 150, edited.json?.fee)
check('and change its validity', edited.json.validityDays === 365)

check('a request already filed keeps the fee it was quoted',
  (await j('/barangay/requests', { token: resident }))
    .json.find((r) => r.id === filed.json.id)?.fee === 120)

const withdrawn = await j(`/barangay-staff/certificates/${own.json.id}`, {
  method: 'DELETE', token: admin,
})
check('it can be withdrawn', withdrawn.status === 200 && withdrawn.json.active === false)
check('residents are no longer offered it',
  (await j('/barangay/me', { token: resident })).json.certificates.every((c) => c.id !== own.json.id))
check('and cannot file for it', (await j('/barangay/requests', {
  method: 'POST', token: resident, body: { typeId: own.json.id, purpose: 'Too late' },
})).status === 404)
check('but the request already filed still reads its name',
  (await j('/barangay/requests', { token: resident }))
    .json.find((r) => r.id === filed.json.id)?.typeName.includes('Tricycle Sticker'))
check('and it can be restored', (await j(`/barangay-staff/certificates/${own.json.id}?restore=true`, {
  method: 'DELETE', token: admin,
})).json.active === true)

console.log('\n== the treasury sees what it has to reconcile ==')

await j(`/barangay-staff/fees/${shared.json.id}`, {
  method: 'PUT', token: admin, body: { fee: 85 },
})

const feed = await j('/staff/fee-changes', { token: treasury })
check('the treasury can read the fee trail', feed.status === 200, feed.status)
check('a new certificate is in it', feed.json.some((e) => e.action === 'certificate.create'))
check('an edit is in it, with the old figure',
  feed.json.some((e) => e.action === 'certificate.update' && e.before?.fee !== undefined))
check('a barangay’s own override is in it too',
  feed.json.some((e) => e.action === 'barangay_fee.update'))
check('and it says who did it', feed.json.every((e) => Boolean(e.actorName)))

check('the municipal administrator sees it too',
  (await j('/staff/fee-changes', { token: municipalAdmin })).status === 200)
check('another office does not', (await j('/staff/fee-changes', { token: bpls })).status === 403)
check('and no barangay account does',
  (await j('/staff/fee-changes', { token: admin })).status === 403)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
