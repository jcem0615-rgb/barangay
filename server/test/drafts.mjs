// Drafts: the resident's own scratch space. Never visible to an office, never
// consuming a reference number, and cleared the moment it becomes a request.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'

const API_PORT = 4112
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
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const stamp = Date.now()
const MARKER = `Mercado Hardware ${stamp}`

const email = `draft.${stamp}@example.com`
const resident = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email, password: 'draft-mo-muna-2026', fullName: 'Teodoro V. Mercado' } })).json.token
const other = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `d2.${stamp}@example.com`, password: 'draft-mo-muna-2026', fullName: 'Iba Tao' } })).json.token
const bpls = (await j('/auth/login', { method: 'POST', body: { email: 'bpls@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token

console.log('\n== a resident starts with none ==')
check('empty list', (await j('/requests/drafts', { token: resident })).json.length === 0)

console.log('\n== saving a half-filled form ==')
const first = await j('/requests/drafts/boss-application', { method: 'PUT', token: resident, body: { formValues: { businessName: MARKER } } })
check('accepted', first.status === 200, JSON.stringify(first.json))
check('keeps what was typed', first.json.formValues.businessName === MARKER)
check('has an id', typeof first.json.id === 'string')
const draftId = first.json.id

console.log('\n== typing more overwrites rather than piling up ==')
await j('/requests/drafts/boss-application', { method: 'PUT', token: resident, body: { formValues: { businessName: `${MARKER} & Supply`, businessType: 'New Business' } } })
const list = (await j('/requests/drafts', { token: resident })).json
check('still one draft', list.length === 1, `${list.length}`)
check('same id', list[0].id === draftId)
check('latest values', list[0].formValues.businessName === `${MARKER} & Supply`)
check('carries the service name', list[0].serviceName?.length > 0, list[0].serviceName)
check('carries the office', list[0].categoryId === 'bpls', list[0].categoryId)

console.log('\n== a second service gets its own draft ==')
await j('/requests/drafts/cedula', { method: 'PUT', token: resident, body: { formValues: { purpose: 'Employment' } } })
check('two drafts now', (await j('/requests/drafts', { token: resident })).json.length === 2)

console.log('\n== no office can see a draft ==')
const queue = await j('/staff/queue', { token: bpls })
check('not in the department queue', !JSON.stringify(queue.json.items).includes(MARKER), `${queue.json.items?.length} items`)
const adminQueue = await j('/staff/queue', { token: admin })
check('not in the admin queue either', !JSON.stringify(adminQueue.json.items).includes(MARKER))
const summary = await j('/staff/summary', { token: admin })
check('not counted in the summary', !JSON.stringify(summary.json).includes('draft'), JSON.stringify(summary.json))
check('staff cannot list drafts at all', (await j('/requests/drafts', { token: bpls })).status === 403)
check('a draft is not a request', (await j(`/requests/${draftId}`, { token: resident })).status === 404)

console.log("\n== one resident's draft is not another's ==")
check('a stranger sees none', (await j('/requests/drafts', { token: other })).json.length === 0)
check('and cannot delete one', (await j(`/requests/drafts/${draftId}`, { method: 'DELETE', token: other })).status === 404)
check('it survived that', (await j('/requests/drafts', { token: resident })).json.length === 2)
check('anonymous cannot read', (await j('/requests/drafts')).status === 401)

console.log('\n== a draft is held to the same rules as a submission ==')
check('undeclared field refused', (await j('/requests/drafts/cedula', { method: 'PUT', token: resident, body: { formValues: { smuggled: 'x' } } })).status === 400)
check('over-long value refused', (await j('/requests/drafts/cedula', { method: 'PUT', token: resident, body: { formValues: { purpose: 'x'.repeat(2001) } } })).status === 400)
check('unknown service refused', (await j('/requests/drafts/no-such-service', { method: 'PUT', token: resident, body: { formValues: {} } })).status === 404)
check('a malformed id is a 404, not a crash', (await j('/requests/drafts/not-a-uuid', { method: 'DELETE', token: resident })).status === 404)

console.log('\n== drafts take no reference number ==')
const before = (await j('/requests', { token: resident })).json.length
check('no request was created by drafting', before === 0, `${before}`)

console.log('\n== submitting consumes the draft ==')
const submitted = await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'boss-application', formValues: formFor('boss-application', { businessName: `${MARKER} & Supply` }), draftId } })
check('the request was filed', submitted.status === 201, JSON.stringify(submitted.json)?.slice(0, 120))
check('and got a real reference number', /^BOSS-\d{4}-\d{5}$/.test(submitted.json.referenceNo), submitted.json.referenceNo)
const after = (await j('/requests/drafts', { token: resident })).json
check('the draft is gone', !after.some((d) => d.id === draftId), JSON.stringify(after.map((d) => d.serviceId)))
check('the other draft is untouched', after.length === 1 && after[0].serviceId === 'cedula')
// Searched rather than scanned: the queue is paged oldest-first, so a request
// filed just now sits past the first page on any long-lived database.
const found = await j(`/staff/queue?q=${encodeURIComponent(submitted.json.referenceNo)}`, { token: bpls })
check('now it shows in the office queue', found.json.items.some((i) => i.referenceNo === submitted.json.referenceNo), JSON.stringify(found.json.items?.length))

console.log('\n== submitting without naming the draft still clears it ==')
await j('/requests/drafts/cedula', { method: 'PUT', token: resident, body: { formValues: { purpose: 'Employment' } } })
await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })
check('matched on the service instead', (await j('/requests/drafts', { token: resident })).json.length === 0)

console.log('\n== discarding ==')
const kept = (await j('/requests/drafts/cedula', { method: 'PUT', token: resident, body: { formValues: { purpose: 'Scholarship' } } })).json
check('discard returns 204', (await j(`/requests/drafts/${kept.id}`, { method: 'DELETE', token: resident })).status === 204)
check('and it is gone', (await j('/requests/drafts', { token: resident })).json.length === 0)
check('discarding twice is a 404', (await j(`/requests/drafts/${kept.id}`, { method: 'DELETE', token: resident })).status === 404)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
