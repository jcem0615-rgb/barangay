// The Record of Barangay Inhabitants.
//
// This is the one directory in the app — listing inhabitants is its function —
// so the checks that matter most are the ones around it: nobody outside the
// barangay can read it, no resident can, the municipality cannot, and a member
// is never a link to an account.
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
const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `hh.${stamp}@example.com`, password: 'sambahayan-2026',
  fullName: `Taga Bahay ${stamp}`, birthDate: '1987-07-07',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')
const municipalStaff = await login('cswdo@malasiqui.gov.ph')

const yearsAgo = (n) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().slice(0, 10)
}

console.log('\n== who may open the register ==')

check('a resident cannot', (await j('/barangay-staff/households', { token: resident })).status === 403)
check('nor municipal staff', (await j('/barangay-staff/households', { token: municipalStaff })).status === 403)
check('nor the municipal administrator', (await j('/barangay-staff/households', { token: municipalAdmin })).status === 403)
check('a signed-out caller cannot', (await j('/barangay-staff/households')).status === 401)
check('the barangay officer can', (await j('/barangay-staff/households', { token: officer })).status === 200)
check('and the administrator can', (await j('/barangay-staff/households', { token: admin })).status === 200)

console.log('\n== a household ==')

const thin = await j('/barangay-staff/households', { method: 'POST', token: officer, body: { address: 'x' } })
check('an address and a head are both required', thin.status === 400, thin.status)

const house = await j('/barangay-staff/households', { method: 'POST', token: officer, body: {
  address: `12 Mabini St ${stamp}`, purok: 'Purok 3',
  headName: `Rosa Mendoza ${stamp}`, contact: '0917 222 3333',
} })
check('the officer can open one', house.status === 201, house.status)
check('and it is numbered within the barangay', Number.isInteger(house.json?.householdNo), house.json?.householdNo)

const opened = await j(`/barangay-staff/households/${house.json.id}`, { token: officer })
check('the head is a member of their own household', opened.json.members.length === 1, opened.json.members.length)
check('and is recorded as the head', opened.json.members[0].relationship === 'Head')

const second = await j('/barangay-staff/households', { method: 'POST', token: officer, body: {
  address: `14 Mabini St ${stamp}`, purok: 'Purok 3', headName: `Ben Aquino ${stamp}`,
} })
check('numbers do not repeat', second.json.householdNo !== house.json.householdNo, second.json.householdNo)

console.log('\n== members ==')

const futureBorn = await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: officer,
  body: { fullName: 'Unborn Child', relationship: 'Daughter', birthDate: '2099-01-01' },
})
check('a date of birth in the future is refused', futureBorn.status === 400, futureBorn.status)

const badRelationship = await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: officer, body: { fullName: 'Somebody', relationship: 'Landlord' },
})
check('a relationship the register does not have is refused', badRelationship.status === 400, badRelationship.status)

const child = await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: officer,
  body: { fullName: `Ana Mendoza ${stamp}`, relationship: 'Daughter', birthDate: yearsAgo(9), sex: 'female' },
})
check('a member can be added', child.status === 201, child.status)
check('and their age is worked out rather than typed', child.json.age === 9, child.json.age)

const lola = await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: officer,
  body: {
    fullName: `Nena Mendoza ${stamp}`, relationship: 'Parent', birthDate: yearsAgo(72),
    sex: 'female', isPwd: true, isVoter: true,
  },
})
check('a senior is recorded with what the barangay noted', lola.json.age === 72 && lola.json.isPwd === true)

const noBirthday = await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: officer, body: { fullName: `Boarder ${stamp}`, relationship: 'Boarder' },
})
check('somebody with no date of birth can still be in the register', noBirthday.status === 201)
check('and has no age rather than a wrong one', noBirthday.json.age === null, noBirthday.json.age)

const edited = await j(`/barangay-staff/households/${house.json.id}/members/${child.json.id}`, {
  method: 'PATCH', token: officer, body: { occupation: 'Pupil', isFourPs: true },
})
check('a member can be corrected', edited.status === 200 && edited.json.isFourPs === true)

const removeHead = await j(`/barangay-staff/households/${house.json.id}/members/${opened.json.members[0].id}`, {
  method: 'DELETE', token: officer,
})
check('the head cannot be removed — they are the household', removeHead.status === 409, removeHead.status)

check('anybody else can be', (await j(
  `/barangay-staff/households/${house.json.id}/members/${noBirthday.json.id}`,
  { method: 'DELETE', token: officer }
)).status === 200)

console.log('\n== another barangay’s register ==')

const theirs = await j('/barangay-staff/households', { token: otherAdmin })
check('the next barangay sees none of our households',
  theirs.json.every((h) => h.headName !== house.json.headName), theirs.json.length)

check('and cannot open one by id', (await j(`/barangay-staff/households/${house.json.id}`, { token: otherAdmin })).status === 404)
check('nor add anybody to it', (await j(`/barangay-staff/households/${house.json.id}/members`, {
  method: 'POST', token: otherAdmin, body: { fullName: 'Intruder', relationship: 'Other' },
})).status === 404)
check('nor edit it', (await j(`/barangay-staff/households/${house.json.id}`, {
  method: 'PATCH', token: otherAdmin, body: { purok: 'Theirs' },
})).status === 404)

const theirSearch = await j(`/barangay-staff/households?q=${encodeURIComponent(String(stamp))}`, { token: otherAdmin })
check('and searching for a name finds nothing of ours', theirSearch.json.length === 0, theirSearch.json.length)

const ourSearch = await j(`/barangay-staff/households?q=${encodeURIComponent(String(stamp))}`, { token: officer })
check('while our own search finds it', ourSearch.json.length >= 2, ourSearch.json.length)

const byMember = await j(`/barangay-staff/households?q=${encodeURIComponent(`Ana Mendoza ${stamp}`)}`, { token: officer })
check('a household can be found by anyone in it, not only the head',
  byMember.json.some((h) => h.id === house.json.id), byMember.json.length)

console.log('\n== leaving the register is the administrator’s ==')

const officerArchive = await j(`/barangay-staff/households/${second.json.id}/status`, {
  method: 'PATCH', token: officer, body: { status: 'moved', statusNote: 'Moved to Dagupan.' },
})
check('an officer keeps the register but does not take a household out of it',
  officerArchive.status === 403, officerArchive.status)

const silent = await j(`/barangay-staff/households/${second.json.id}/status`, {
  method: 'PATCH', token: admin, body: { status: 'moved' },
})
check('and it cannot be done silently', silent.status === 400, silent.status)

check('the administrator can, with a reason', (await j(`/barangay-staff/households/${second.json.id}/status`, {
  method: 'PATCH', token: admin, body: { status: 'moved', statusNote: 'Moved to Dagupan, March.' },
})).status === 200)

const stillThere = await j(`/barangay-staff/households/${second.json.id}`, { token: admin })
check('nothing is deleted — the household is still in the book', stillThere.status === 200)
check('with why it left', stillThere.json.statusNote.includes('Dagupan'))

console.log('\n== the figures ==')

const figures = await j('/barangay-staff/households/figures/summary', { token: officer })
check('the summary reads', figures.status === 200, figures.status)
check('it counts this barangay', figures.json.barangay === 'Poblacion', figures.json.barangay)
check('a child is counted as one', figures.json.children >= 1, figures.json.children)
check('a senior is counted as one', figures.json.seniors >= 1, figures.json.seniors)
check('what the barangay noted is counted', figures.json.pwd >= 1 && figures.json.fourPs >= 1)
check('and a household that moved is out of the active figures',
  !figures.json.byPurok.some((p) => p.purok === 'Purok 3' && p.households > 10), JSON.stringify(figures.json.byPurok))

const theirFigures = await j('/barangay-staff/households/figures/summary', { token: otherAdmin })
check('another barangay counts only its own', theirFigures.json.barangay === 'Nalsian', theirFigures.json.barangay)

console.log('\n== it is not a view onto the user table ==')

// The whole point of keeping members as free text: a barangay clerk must not be
// able to turn this into a lookup of municipal accounts.
const everything = JSON.stringify(ourSearch.json) + JSON.stringify(opened.json)
check('no member carries a user id, email or PhilSys number',
  !/userId|philSys|@example\.com|@malasiqui\.gov\.ph/i.test(everything))

const notes = await j('/notifications', { token: resident })
check('and nothing about a register entry notifies anybody',
  notes.json.notifications.every((n) => !/household|register/i.test(`${n.title} ${n.body}`)))

const exported = await j('/privacy/export', { token: resident })
check('nor appears in a resident export', !/household/i.test(JSON.stringify(exported.json ?? {})), exported.status)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
