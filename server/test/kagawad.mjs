// The Sangguniang Barangay member, and a barangay that issues its own accounts.
//
// Two things are being checked, and the first matters more: a kagawad is
// refused every route the clerk's console uses. That is a structural claim —
// the staff router's blanket gate names two roles and not this one — so the
// test walks the actual routes rather than trusting the gate, because the whole
// point of the design is what happens to a route somebody adds later.
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
const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const kagawad = await login('kagawad.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')

check('the seeded kagawad can sign in', Boolean(kagawad))

console.log('\n== what the council may read ==')

const me = await j('/barangay-kagawad/me', { token: kagawad })
check('a kagawad reads their own barangay', me.status === 200 && me.json.barangay.id === 'poblacion', me.status)

const summary = await j('/barangay-kagawad/summary', { token: kagawad })
check('and what the office has issued', summary.status === 200 && typeof summary.json.counts.released === 'number')
check('and what it has collected', typeof summary.json.collected === 'number', summary.json.collected)

const figures = await j('/barangay-kagawad/figures', { token: kagawad })
check('and the register as counts', figures.status === 200 && typeof figures.json.population === 'number')
check('with the age bands a council plans from',
  ['children', 'adults', 'seniors'].every((k) => typeof figures.json[k] === 'number'))
check('and the people missing a birth date reported, not hidden',
  typeof figures.json.withoutBirthDate === 'number', figures.json.withoutBirthDate)
check('broken down by purok', Array.isArray(figures.json.byPurok))

// The figures are counts, and the check says exactly that rather than hunting
// for field names — `withoutBirthDate` is a count whose *name* contains a field
// name, so a substring search gets this wrong in the direction that matters
// least. Every value here is a number except the barangay's own name and the
// purok breakdown, and each purok row is three numbers and a label.
const shape = Object.entries(figures.json).every(([key, value]) =>
  key === 'barangay' ? typeof value === 'string'
  : key === 'byPurok' ? Array.isArray(value)
  : typeof value === 'number'
)
check('and it is counts, never people', shape, JSON.stringify(figures.json).slice(0, 200))
check('right down to each purok row',
  figures.json.byPurok.every((row) =>
    Object.keys(row).sort().join() === 'households,population,purok' &&
    typeof row.households === 'number' && typeof row.population === 'number'),
  JSON.stringify(figures.json.byPurok[0]))

const board = await j('/barangay-kagawad/announcements', { token: kagawad })
check('a kagawad reads the board the barangay published', board.status === 200 && Array.isArray(board.json))

console.log('\n== what the council may not reach ==')

// Every route the clerk's console uses. A kagawad is not on that router's gate,
// so all of these are 403 — including any added after this test was written.
for (const [label, path] of [
  ['the certificate queue', '/barangay-staff/requests'],
  ['the blotter', '/barangay-staff/blotter'],
  ['the register of inhabitants', '/barangay-staff/households'],
  ['even the register as the clerk sees it', '/barangay-staff/households/figures/summary'],
  ['the notice board as an editor', '/barangay-staff/announcements'],
  ['the hall’s own details', '/barangay-staff/office'],
  ['the fees', '/barangay-staff/fees'],
  ['the roster', '/barangay-staff/officers'],
  ['the administrator’s summary', '/barangay-staff/summary'],
]) {
  check(`a kagawad is refused ${label}`,
    (await j(path, { token: kagawad })).status === 403)
}

check('a kagawad cannot post a notice', (await j('/barangay-staff/announcements', {
  method: 'POST', token: kagawad, body: { title: 'From the council', body: 'Vote for me in May, neighbours.' },
})).status === 403)
check('nor write the blotter', (await j('/barangay-staff/blotter', {
  method: 'POST', token: kagawad,
  body: { complainant: 'A', respondent: 'B', narrative: 'Something a councillor should not be filing.' },
})).status === 403)

console.log('\n== and the council’s own routes are only the council’s ==')

check('a clerk does not read the kagawad view',
  (await j('/barangay-kagawad/figures', { token: officer })).status === 403)
check('nor does the barangay administrator',
  (await j('/barangay-kagawad/figures', { token: admin })).status === 403)
check('nor the municipal administrator',
  (await j('/barangay-kagawad/figures', { token: municipalAdmin })).status === 403)
check('and a signed-out caller gets nothing',
  (await j('/barangay-kagawad/figures')).status === 401)

console.log('\n== the barangay issues its own accounts ==')

const issued = await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `kag.${stamp}@example.com`, fullName: `Hon. Test Kagawad ${stamp}`, role: 'barangay_kagawad' },
})
check('the administrator can issue a kagawad', issued.status === 201, JSON.stringify(issued.json))
check('and is told whether the invitation actually sent',
  typeof issued.json.invited === 'boolean', issued.json.invited)
check('no password is ever in the response',
  !/password/i.test(JSON.stringify(issued.json)))

const clerk = await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `clk.${stamp}@example.com`, fullName: `Test Clerk ${stamp}`, role: 'barangay_officer' },
})
check('and a clerk', clerk.status === 201, clerk.status)

const roster = await j('/barangay-staff/officers', { token: admin })
check('both appear on the roster', roster.json.some((r) => r.id === issued.json.id) &&
  roster.json.some((r) => r.id === clerk.json.id))

// A new account cannot sign in until its holder sets a password, so the
// placeholder really is unusable rather than merely unknown.
check('a new account cannot be signed into yet',
  (await j('/auth/login', { method: 'POST', body: { email: `kag.${stamp}@example.com`, password: SEED } })).status >= 400)

console.log('\n== the escalation line ==')

const escalate = await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `boss.${stamp}@example.com`, fullName: 'Hon. New Captain', role: 'barangay_admin' },
})
check('a barangay cannot issue itself an administrator', escalate.status === 400, escalate.status)
check('nor a municipal role', (await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `mun.${stamp}@example.com`, fullName: 'Not A Clerk', role: 'admin' },
})).status === 400)
check('nor a resident', (await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `res.${stamp}@example.com`, fullName: 'Not A Resident', role: 'resident' },
})).status === 400)

check('an officer cannot issue anybody', (await j('/barangay-staff/officers', {
  method: 'POST', token: officer,
  body: { email: `no.${stamp}@example.com`, fullName: 'Nope', role: 'barangay_kagawad' },
})).status === 403)
check('and neither can a kagawad', (await j('/barangay-staff/officers', {
  method: 'POST', token: kagawad,
  body: { email: `no2.${stamp}@example.com`, fullName: 'Nope', role: 'barangay_kagawad' },
})).status === 403)

check('an address that already has an account is refused', (await j('/barangay-staff/officers', {
  method: 'POST', token: admin,
  body: { email: `kag.${stamp}@example.com`, fullName: 'Duplicate', role: 'barangay_kagawad' },
})).status === 409)

console.log('\n== revoking ==')

check('the administrator can revoke one they issued',
  (await j(`/barangay-staff/officers/${issued.json.id}/deactivate`, { method: 'POST', token: admin })).status === 204)
check('it shows as revoked',
  (await j('/barangay-staff/officers', { token: admin }))
    .json.find((r) => r.id === issued.json.id)?.active === false)
check('and cannot be revoked twice',
  (await j(`/barangay-staff/officers/${issued.json.id}/deactivate`, { method: 'POST', token: admin })).status === 404)
check('and can be restored',
  (await j(`/barangay-staff/officers/${issued.json.id}/reactivate`, { method: 'POST', token: admin })).status === 204)

// A revoked kagawad is out: the role check reads the live row, so an account
// that was signed in before being revoked does not keep working.
const liveKagawadRow = (await j('/barangay-staff/officers', { token: admin }))
  .json.find((r) => r.email === 'kagawad.poblacion@malasiqui.gov.ph')
check('the seeded kagawad is on the roster as a kagawad',
  liveKagawadRow?.role === 'barangay_kagawad', liveKagawadRow?.role)

const adminRow = (await j('/barangay-staff/officers', { token: admin }))
  .json.find((r) => r.role === 'barangay_admin')

// This barangay has one administrator and it is the caller, so revoking that
// row trips the self-check first — which is the right refusal and a different
// one from the role filter.
const self = await j(`/barangay-staff/officers/${adminRow.id}/deactivate`, { method: 'POST', token: admin })
check('an administrator cannot revoke their own account', self.status === 409, self.status)
check('and is told why', /your own/i.test(self.json?.error ?? ''), self.json?.error)

// `send-reset` has no self-check, so it isolates the role filter: an
// administrator's row is not reachable through these routes at all, which is
// what stops a captain and a secretary from revoking each other.
const atAdmin = await j(`/barangay-staff/officers/${adminRow.id}/send-reset`, { method: 'POST', token: admin })
check('and an administrator row is not reachable from these routes at all',
  atAdmin.status === 404, atAdmin.status)

console.log('\n== another barangay ==')

check('the next barangay does not see our new accounts',
  (await j('/barangay-staff/officers', { token: otherAdmin }))
    .json.every((r) => !r.email.includes(String(stamp))))
check('and cannot revoke one', (await j(`/barangay-staff/officers/${clerk.json.id}/deactivate`, {
  method: 'POST', token: otherAdmin,
})).status === 404)
check('nor send it a fresh link', (await j(`/barangay-staff/officers/${clerk.json.id}/send-reset`, {
  method: 'POST', token: otherAdmin,
})).status === 404)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
