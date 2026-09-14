// Sectoral registries and poverty-reduction programmes: issued by the social
// welfare office, readable by the resident they belong to, and never
// self-declared.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'

const API_PORT = 4111
const API = `http://127.0.0.1:${API_PORT}/api`
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), SERVE_WEB: 'false', MAIL_TRANSPORT: 'console', SMS_TRANSPORT: 'log' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
api.stderr.on('data', () => {})
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${API}/health`)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 250))
}
const formFor = await formFiller(API)
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const settle = () => new Promise((r) => setTimeout(r, 500))
const stamp = Date.now()

const email = `prog.${stamp}@example.com`
const resident = (await j('/auth/register', { method: 'POST', body: { email, password: 'programa-2026-ok', fullName: 'Lourdes B. Aquino', philSysId: `1234-${stamp % 100000}`, barangay: 'Poblacion' } })).json.token
const cswdo = (await j('/auth/login', { method: 'POST', body: { email: 'cswdo@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token

console.log('\n== the catalogue describes every programme ==')
const cat = (await j('/catalogue')).json
check('published without signing in', Array.isArray(cat.programs) && cat.programs.length === 8, `${cat.programs?.length}`)
const codes = cat.programs.map((p) => p.code)
for (const code of ['4ps', 'indigent', 'slp', 'senior', 'pwd', 'solo_parent', 'farmer', 'ip']) {
  check(`includes ${code}`, codes.includes(code))
}
const senior = cat.programs.find((p) => p.code === 'senior')
check('carries the issuing office', senior.issuingOffice.includes('Senior Citizens'), senior.issuingOffice)
check('carries the number it issues', senior.idLabel === 'OSCA ID No.', senior.idLabel)
check('says what it entitles you to', /20%/.test(senior.benefit), senior.benefit)
const soloParent = cat.programs.find((p) => p.code === 'solo_parent')
check('solo parent records expire', soloParent.expires === true)
check('4Ps records do not', cat.programs.find((p) => p.code === '4ps').expires === false)
check('poverty programmes are grouped first', cat.programs[0].kind === 'poverty_reduction')

console.log('\n== a resident starts on nothing ==')
const me0 = (await j('/auth/me', { token: resident })).json
check('profile carries an empty list', Array.isArray(me0.profile.programs) && me0.profile.programs.length === 0, JSON.stringify(me0.profile.programs))

// The resident files something with the social welfare office.
const reqId = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'solo-parent-id', formValues: formFor('solo-parent-id') } })).json?.id
check('a CSWDO request was filed', typeof reqId === 'string', JSON.stringify(reqId))

console.log('\n== only the registering office may enrol ==')
check('a resident cannot enrol themselves', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: resident, body: { code: 'senior' } })).status === 403)
check('anonymous cannot', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', body: { code: 'senior' } })).status === 401)
const byTreasury = await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: treasury, body: { code: 'senior' } })
check('another office cannot', byTreasury.status === 403, `${byTreasury.status}`)
check('and is told why', /social welfare/i.test(byTreasury.json?.error ?? ''), byTreasury.json?.error)

console.log('\n== the social welfare office enrols ==')
const granted = await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'solo_parent', referenceNo: 'SP-2026-0417', validUntil: '2027-09-04' } })
check('accepted', granted.status === 200, JSON.stringify(granted.json))
check('returns the new list', granted.json.programs.length === 1)
check('keeps the ID number', granted.json.programs[0].referenceNo === 'SP-2026-0417')
check('keeps the expiry', granted.json.programs[0].validUntil === '2027-09-04')
check('not expired today', granted.json.programs[0].expired === false)

console.log('\n== it reaches the resident\'s ID ==')
const me1 = (await j('/auth/me', { token: resident })).json
check('shows on the profile', me1.profile.programs.length === 1 && me1.profile.programs[0].code === 'solo_parent')
await settle()
const notes = (await j('/notifications', { token: resident })).json
check('the resident was told', notes.notifications.some((n) => n.kind === 'program_granted'), JSON.stringify(notes.notifications.map((n) => n.kind)))
check('the notice names the programme', notes.notifications.some((n) => /Solo Parent/.test(n.title)))
check('and is not tied to a request', notes.notifications.find((n) => n.kind === 'program_granted').requestId === null)

console.log('\n== an expired record reads as expired, not missing ==')
await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'pwd', referenceNo: 'PWD-0099', validUntil: '2020-01-01' } })
const me2 = (await j('/auth/me', { token: resident })).json
const pwd = me2.profile.programs.find((p) => p.code === 'pwd')
check('still listed', Boolean(pwd))
check('flagged expired', pwd.expired === true)

console.log('\n== records that do not lapse refuse an expiry ==')
const bad4ps = await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: '4ps', validUntil: '2030-01-01' } })
check('refused', bad4ps.status === 400, `${bad4ps.status}`)
check('and says so plainly', /do not expire/i.test(bad4ps.json?.error ?? ''), bad4ps.json?.error)
check('4Ps without an expiry is fine', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: '4ps', referenceNo: 'HH-77123' } })).status === 200)

console.log('\n== correcting a record does not need a revoke first ==')
const fixed = await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'solo_parent', referenceNo: 'SP-2026-0418', validUntil: '2027-09-04' } })
check('upserts rather than duplicating', fixed.json.programs.filter((p) => p.code === 'solo_parent').length === 1)
check('the number was corrected', fixed.json.programs.find((p) => p.code === 'solo_parent').referenceNo === 'SP-2026-0418')

console.log('\n== unknown programmes are refused ==')
check('made-up code', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'free-money' } })).status === 404)
check('missing code', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: {} })).status === 400)
check('over-long reference', (await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'ip', referenceNo: 'x'.repeat(200) } })).status === 400)

console.log('\n== reading is open to the office holding the request ==')
const read = await j(`/staff/requests/${reqId}/programs`, { token: cswdo })
check('CSWDO reads them', read.status === 200 && read.json.programs.length === 3, JSON.stringify(read.json?.programs?.length))
check('and is told it may edit', read.json.mayEdit === true)
check('names the resident', read.json.residentName === 'Lourdes B. Aquino', read.json.residentName)
const otherOffice = await j(`/staff/requests/${reqId}/programs`, { token: treasury })
check('another office cannot even find the request', otherOffice.status === 404, `${otherOffice.status}`)
const adminRead = await j(`/staff/requests/${reqId}/programs`, { token: admin })
check('an admin reads it', adminRead.status === 200)
check('and may edit', adminRead.json.mayEdit === true)

console.log('\n== revoking ==')
check('another office cannot revoke', (await j(`/staff/requests/${reqId}/programs/4ps`, { method: 'DELETE', token: treasury })).status === 403)
const revoked = await j(`/staff/requests/${reqId}/programs/4ps`, { method: 'DELETE', token: cswdo })
check('CSWDO can', revoked.status === 200, `${revoked.status}`)
check('the list shrinks', revoked.json.programs.length === 2)
check('revoking twice is a 404, not a silent success', (await j(`/staff/requests/${reqId}/programs/4ps`, { method: 'DELETE', token: cswdo })).status === 404)
await settle()
check('the resident was told about the removal', (await j('/notifications', { token: resident })).json.notifications.some((n) => n.kind === 'program_revoked'))

console.log('\n== one resident\'s record is not another\'s ==')
const stranger = (await j('/auth/register', { method: 'POST', body: { email: `str.${stamp}@example.com`, password: 'ibang-tao-2026x', fullName: 'Iba Tao' } })).json.token
check('a stranger has none of them', (await j('/auth/me', { token: stranger })).json.profile.programs.length === 0)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
