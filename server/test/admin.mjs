// Staff account administration. Access control matters most here: this is the
// endpoint that can mint accounts able to read residents' requests.
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'

const API_PORT = 4103
const API = `http://127.0.0.1:${API_PORT}/api`
const OUTBOX = '/tmp/elgu-admin-outbox.jsonl'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

await rm(OUTBOX, { force: true })
const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), SERVE_WEB: 'false', MAIL_TRANSPORT: 'file', MAIL_OUTBOX: OUTBOX, PUBLIC_URL: 'https://portal.example.ph' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
api.stderr.on('data', () => {})
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${API}/health`)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 250))
}
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const linkFor = async (email) => {
  const lines = (await readFile(OUTBOX, 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
  return [...lines].reverse().find((m) => m.to === email)?.text.match(/https?:\/\/\S+/)?.[0]
}

const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const staff = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const resident = (await j('/auth/register', { method: 'POST', body: { email: `res.${Date.now()}@example.com`, password: 'tamang-lakas-2026', fullName: 'A Resident' } })).json.token

console.log('\n== only administrators reach this at all ==')
check('admin can list accounts', (await j('/admin/staff', { token: admin })).status === 200)
check('ordinary staff cannot', (await j('/admin/staff', { token: staff })).status === 403)
check('a resident cannot', (await j('/admin/staff', { token: resident })).status === 403)
check('anonymous cannot', (await j('/admin/staff')).status === 401)
check('staff cannot create an account', (await j('/admin/staff', { method: 'POST', token: staff, body: { email: 'x@y.ph', fullName: 'X Y', departments: ['lcr'] } })).status === 403)

console.log('\n== creating a clerk ==')
const email = `clerk.${Date.now()}@sanfernando.gov.ph`
const created = await j('/admin/staff', { method: 'POST', token: admin, body: {
  email, fullName: 'Nilo Bautista', departments: ['lcr'], position: 'Registration Officer' } })
check('created', created.status === 201, JSON.stringify(created.json))
check('assigned to the office', created.json?.departments?.includes('lcr'))
check('starts active', created.json?.active === true)
check('an invitation was sent', created.json?.invited === true)
check('the admin is not shown a password', !JSON.stringify(created.json).toLowerCase().includes('password'))
const newId = created.json.id

check('duplicate email refused', (await j('/admin/staff', { method: 'POST', token: admin, body: { email, fullName: 'Someone Else', departments: ['lcr'] } })).status === 409)
check('staff with no office refused', (await j('/admin/staff', { method: 'POST', token: admin, body: { email: `n.${Date.now()}@x.ph`, fullName: 'No Office', departments: [] } })).status === 400)
check('unknown office refused', (await j('/admin/staff', { method: 'POST', token: admin, body: { email: `u.${Date.now()}@x.ph`, fullName: 'Bad Office', departments: ['nope'] } })).status === 400)

console.log('\n== the invitation is how they get in ==')
check('cannot sign in before setting a password',
  (await j('/auth/login', { method: 'POST', body: { email, password: 'elgu-demo-2026' } })).status === 401)
const link = await linkFor(email)
check('an invitation link was mailed', !!link, link)
const token = new URL(link).searchParams.get('reset')
check('setting a password works', (await j('/auth/reset', { method: 'POST', body: { token, password: 'bagong-clerk-2026' } })).status === 204)
const clerk = await j('/auth/login', { method: 'POST', body: { email, password: 'bagong-clerk-2026' } })
check('the clerk can now sign in', clerk.status === 200, clerk.status)
check('and sees only their own office queue',
  (await j('/staff/queue?departmentId=treasury', { token: clerk.json.token })).status === 403)
check('but does reach their own', (await j('/staff/queue?departmentId=lcr', { token: clerk.json.token })).status === 200)

console.log('\n== reassigning offices ==')
const moved = await j(`/admin/staff/${newId}`, { method: 'PATCH', token: admin, body: { departments: ['lcr', 'health'] } })
check('now serves two offices', moved.json?.departments?.length === 2, JSON.stringify(moved.json?.departments))
check('the change takes effect on the existing session',
  (await j('/staff/queue?departmentId=health', { token: clerk.json.token })).status === 200)
check('stripping to no office is refused', (await j(`/admin/staff/${newId}`, { method: 'PATCH', token: admin, body: { departments: [] } })).status === 400)

console.log('\n== revoking access ==')
check('cannot deactivate yourself', (await j(`/admin/staff/${(await j('/admin/staff', { token: admin })).json.find(u => u.role === 'admin').id}/deactivate`, { method: 'POST', token: admin })).status === 409)
check('deactivate succeeds', (await j(`/admin/staff/${newId}/deactivate`, { method: 'POST', token: admin })).status === 204)
check('their existing session stops working', (await j('/staff/queue', { token: clerk.json.token })).status === 401)
check('and they cannot sign in again', (await j('/auth/login', { method: 'POST', body: { email, password: 'bagong-clerk-2026' } })).status === 401)
check('they still appear in the list, marked inactive',
  (await j('/admin/staff', { token: admin })).json.find(u => u.id === newId)?.active === false)
check('reactivate restores access', (await j(`/admin/staff/${newId}/reactivate`, { method: 'POST', token: admin })).status === 204)
check('and they can sign in again', (await j('/auth/login', { method: 'POST', body: { email, password: 'bagong-clerk-2026' } })).status === 200)

console.log('\n== a deactivation spends outstanding links ==')
await j(`/admin/staff/${newId}/send-reset`, { method: 'POST', token: admin })
const pending = new URL(await linkFor(email)).searchParams.get('reset')
await j(`/admin/staff/${newId}/deactivate`, { method: 'POST', token: admin })
check('the pending link cannot be used to walk back in',
  (await j('/auth/reset', { method: 'POST', body: { token: pending, password: 'sneaky-password-2026' } })).status === 400)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
