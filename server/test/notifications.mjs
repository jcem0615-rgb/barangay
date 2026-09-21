// Resident notifications: recorded with the change they describe, delivered
// outward afterwards, and readable only by the person they belong to.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'
import { readFile, rm } from 'node:fs/promises'

const API_PORT = 4104
const API = `http://127.0.0.1:${API_PORT}/api`
const OUTBOX = '/tmp/elgu-notify-outbox.jsonl'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

await rm(OUTBOX, { force: true })
const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), SERVE_WEB: 'false', MAIL_TRANSPORT: 'file', MAIL_OUTBOX: OUTBOX, PUBLIC_URL: 'https://portal.example.ph', SMS_TRANSPORT: 'log' },
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
const mailsTo = async (email) => {
  try {
    return (await readFile(OUTBOX, 'utf8')).trim().split('\n').map((l) => JSON.parse(l)).filter((m) => m.to === email)
  } catch { return [] }
}
const settle = () => new Promise((r) => setTimeout(r, 700))

const email = `notify.${Date.now()}@example.com`
const resident = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email, password: 'tamang-lakas-2026', fullName: 'Divina Ocampo' } })).json.token
const mto = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const id = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })).json.id

console.log('\n== nothing before the office acts ==')
const initial = await j('/notifications', { token: resident })
check('starts empty', initial.json.notifications.length === 0 && initial.json.unread === 0)

console.log('\n== an assessment tells the resident what they owe ==')
await j(`/staff/requests/${id}/assess`, { method: 'POST', token: mto, body: { fee: 1234.5 } })
await settle()
const afterAssess = await j('/notifications', { token: resident })
check('one notification recorded', afterAssess.json.notifications.length === 1, JSON.stringify(afterAssess.json))
check('counted as unread', afterAssess.json.unread === 1)
const first = afterAssess.json.notifications[0]
check('names the service', /cedula/i.test(first.title), first.title)
check('states the amount', first.body.includes('1,234.50'), first.body)
check('links to the request', first.requestId === id)
const mails = await mailsTo(email)
check('an email went out', mails.length === 1, `${mails.length} mails`)
check('the email carries the same wording', mails[0]?.text.includes('1,234.50'))

console.log('\n== the rest of the workflow reports too ==')
await j(`/requests/${id}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
await j(`/staff/requests/${id}/advance`, { method: 'POST', token: mto })
await settle()
const afterRelease = await j('/notifications', { token: resident })
check('release notified', afterRelease.json.notifications.some(n => n.kind === 'released'), JSON.stringify(afterRelease.json.notifications.map(n => n.kind)))
check('and says it can be downloaded', afterRelease.json.notifications.find(n => n.kind === 'released')?.body.includes('download'))
check('unread now two', afterRelease.json.unread === 2)

console.log('\n== rejection explains itself ==')
const other = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })).json.id
await j(`/staff/requests/${other}/reject`, { method: 'POST', token: mto, body: { reason: 'Declared income does not match the payslip.' } })
await settle()
const afterReject = (await j('/notifications', { token: resident })).json.notifications.find(n => n.kind === 'rejected')
check('rejection notified', !!afterReject)
check('carries the reason', afterReject?.body.includes('payslip'), afterReject?.body)

console.log('\n== marking as read ==')
const one = afterAssess.json.notifications[0].id
check('mark one read', (await j(`/notifications/${one}/read`, { method: 'POST', token: resident })).status === 204)
check('unread drops', (await j('/notifications', { token: resident })).json.unread === 2)
check('mark all read', (await j('/notifications/read-all', { method: 'POST', token: resident })).status === 204)
check('none unread', (await j('/notifications', { token: resident })).json.unread === 0)

console.log('\n== they belong to one resident only ==')
const stranger = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `str.${Date.now()}@example.com`, password: 'ibang-tao-2026', fullName: 'Iba Tao' } })).json.token
check('a stranger sees none of them', (await j('/notifications', { token: stranger })).json.notifications.length === 0)
check('and cannot mark one read', (await j(`/notifications/${one}/read`, { method: 'POST', token: stranger })).status === 404)
check('staff have no resident inbox', (await j('/notifications', { token: mto })).status === 403)
check('anonymous cannot read', (await j('/notifications')).status === 401)

console.log('\n== preferences ==')
check('email on by default, sms off', JSON.stringify((await j('/notifications/preferences', { token: resident })).json) === JSON.stringify({ notifyEmail: true, notifySms: false, phone: null }))
check('a bad mobile number is refused', (await j('/notifications/preferences', { method: 'PATCH', token: resident, body: { phone: '12345' } })).status === 400)
const prefs = await j('/notifications/preferences', { method: 'PATCH', token: resident, body: { phone: '09171234567', notifySms: true, notifyEmail: false } })
check('a valid one is accepted', prefs.json?.phone === '09171234567' && prefs.json?.notifySms === true, JSON.stringify(prefs.json))

const before = (await mailsTo(email)).length
// A fresh request: `other` was rejected above, and the API rightly refuses to
// assess a closed one.
const third = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })).json.id
await j(`/staff/requests/${third}/assess`, { method: 'POST', token: mto, body: { fee: 55 } })
await settle()
check('opting out of email stops the email', (await mailsTo(email)).length === before, `${(await mailsTo(email)).length} vs ${before}`)
check('but it is still recorded in the app', (await j('/notifications', { token: resident })).json.unread >= 1)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
