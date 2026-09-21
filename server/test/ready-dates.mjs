// Expected ready dates: working-day arithmetic that skips weekends and
// holidays, and a clock that stops while a request waits on the resident.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'
import { addWorkingDays } from '../src/schedule.ts'

const API_PORT = 4113
const API = `http://127.0.0.1:${API_PORT}/api`
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

console.log('\n== counting working days ==')
// 2026-09-07 is a Monday. No holidays in this stretch.
const none = new Set()
const D = (s) => new Date(`${s}T00:00:00Z`)
check('same day means that day', addWorkingDays(D('2026-09-07'), 0, none) === '2026-09-07')
check('one day on', addWorkingDays(D('2026-09-07'), 1, none) === '2026-09-08')
check('Thursday + 1 is Friday', addWorkingDays(D('2026-09-10'), 1, none) === '2026-09-11')
check('Friday + 1 skips the weekend', addWorkingDays(D('2026-09-11'), 1, none) === '2026-09-14')
check('Monday + 5 is the next Monday', addWorkingDays(D('2026-09-07'), 5, none) === '2026-09-14')
check('a Saturday filing starts on Monday', addWorkingDays(D('2026-09-12'), 0, none) === '2026-09-14')
check('a Sunday filing starts on Monday', addWorkingDays(D('2026-09-13'), 0, none) === '2026-09-14')
check('10 days spans two weekends', addWorkingDays(D('2026-09-07'), 10, none) === '2026-09-21')

console.log('\n== holidays are skipped too ==')
// 2026-09-09 is a Wednesday; make it a holiday.
const one = new Set(['2026-09-09'])
check('a mid-week holiday pushes the date', addWorkingDays(D('2026-09-07'), 2, one) === '2026-09-10')
check('filing on a holiday starts the next day', addWorkingDays(D('2026-09-09'), 0, one) === '2026-09-10')
const bridge = new Set(['2026-09-11', '2026-09-14'])
check('a holiday either side of a weekend', addWorkingDays(D('2026-09-10'), 1, bridge) === '2026-09-15')
const seeded = new Set(['2026-12-25', '2026-12-30', '2026-12-31', '2026-01-01'])
check('Christmas week', addWorkingDays(D('2026-12-24'), 1, seeded) === '2026-12-28')

console.log('\n== through the API ==')
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
const resident = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `ready.${stamp}@example.com`, password: 'kailan-handa-2026', fullName: 'Perla D. Aguilar' } })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token

const cat = (await j('/catalogue')).json
check('the catalogue publishes day ranges', cat.services.every((s) => typeof s.processingDaysMin === 'number'))
const boss = cat.services.find((s) => s.id === 'boss-application')
check('and they match the prose', boss.processingDaysMin === 3 && boss.processingDaysMax === 5, `${boss.processingDaysMin}-${boss.processingDaysMax}`)
check('the holiday calendar is published', Array.isArray(cat.holidays) && cat.holidays.length > 0)
check('including the local ones', cat.holidays.some((h) => h.isLocal === true))

console.log('\n== a free service is estimated from submission ==')
// Birth certificate: 3-5 days, no fee up front in this catalogue? Use whichever is free.
const free = cat.services.find((s) => !s.requiresPayment)
const freeReq = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: free.id, formValues: formFor(free.id) } })).json
check('an estimate comes back', Boolean(freeReq.expectedReady), JSON.stringify(freeReq.expectedReady))
check('it is a range', freeReq.expectedReady.from <= freeReq.expectedReady.to)
check('not waiting on the resident', freeReq.awaitingResident === false)
check('never a weekend', ![0, 6].includes(new Date(`${freeReq.expectedReady.to}T00:00:00Z`).getUTCDay()), freeReq.expectedReady.to)
const holidaySet = new Set(cat.holidays.map((h) => h.date))
check('never a holiday', !holidaySet.has(freeReq.expectedReady.from) && !holidaySet.has(freeReq.expectedReady.to))

console.log('\n== a payable service quotes no date until it is paid ==')
const payable = cat.services.find((s) => s.requiresPayment && s.id === 'cedula') ?? cat.services.find((s) => s.requiresPayment)
const pid = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: payable.id, formValues: formFor(payable.id) } })).json.id
await j(`/staff/requests/${pid}/assess`, { method: 'POST', token: treasury, body: { fee: 130 } })
const assessed = (await j(`/requests/${pid}`, { token: resident })).json
check('no date while the fee is unpaid', assessed.expectedReady === null, JSON.stringify(assessed.expectedReady))
check('and it says why', assessed.awaitingResident === true)

const paid = (await j(`/requests/${pid}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })).json
check('paying produces a date', Boolean(paid.expectedReady), JSON.stringify(paid.expectedReady))
check('and clears the waiting flag', paid.awaitingResident === false)

console.log('\n== a closed request has no estimate ==')
await j(`/staff/requests/${pid}/advance`, { method: 'POST', token: treasury })
const done = (await j(`/requests/${pid}`, { token: resident })).json
check('completed', done.status === 'completed', done.status)
check('no date once it is finished', done.expectedReady === null)
check('not waiting on anyone', done.awaitingResident === false)

console.log('\n== the office sees the same estimate ==')
const staffView = (await j(`/staff/requests/${pid}`, { token: treasury })).json
check('staff get the same fields', staffView.expectedReady === null && staffView.awaitingResident === false)
const queue = (await j('/staff/queue', { token: treasury })).json
check('and the queue carries them', queue.items.every((i) => 'expectedReady' in i))

console.log('\n== rejected requests too ==')
const rid = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: payable.id, formValues: formFor(payable.id) } })).json.id
await j(`/staff/requests/${rid}/reject`, { method: 'POST', token: treasury, body: { reason: 'Incomplete requirements' } })
const rejected = (await j(`/requests/${rid}`, { token: resident })).json
check('no date on a rejected request', rejected.expectedReady === null && rejected.awaitingResident === false)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
