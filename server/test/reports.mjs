// Office reports: working-day arithmetic, the two turnaround clocks, and who
// is allowed to read whose numbers.
import { spawn } from 'node:child_process'
import { workingDaysBetween } from '../src/schedule.ts'
import { buildReport, toCsv } from '../src/reports.ts'
import { query, pool } from '../src/db.ts'

const API_PORT = 4116
const API = `http://127.0.0.1:${API_PORT}/api`
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
const D = (s) => new Date(`${s}T00:00:00Z`)

console.log('\n== counting working days between two dates ==')
const none = new Set()
check('same day is zero', workingDaysBetween(D('2026-09-07'), D('2026-09-07'), none) === 0)
check('Monday to Tuesday is one', workingDaysBetween(D('2026-09-07'), D('2026-09-08'), none) === 1)
check('Friday to Monday is one', workingDaysBetween(D('2026-09-11'), D('2026-09-14'), none) === 1)
check('Monday to the next Monday is five', workingDaysBetween(D('2026-09-07'), D('2026-09-14'), none) === 5)
check('a holiday in between does not count', workingDaysBetween(D('2026-09-07'), D('2026-09-10'), new Set(['2026-09-09'])) === 2)
check('backwards is not a negative turnaround', workingDaysBetween(D('2026-09-10'), D('2026-09-07'), none) === null)

console.log('\n== the two clocks, on crafted history ==')
// A window nothing else in the suite touches, so these rows stand alone.
const FROM = '2025-03-03', TO = '2025-03-31'
const stamp = Date.now()
const resident = (await query(
  `insert into users (email, password_hash, role, full_name)
   values ($1, 'x', 'resident', 'Reports Fixture') returning id`,
  [`rep.${stamp}@example.com`]
))[0].id

/**
 * submitted -> (optionally paid) -> released, at dates we choose, so the
 * medians below are arithmetic we can check by hand rather than whatever the
 * clock happened to say.
 */
async function seedRequest({ service, dept, submitted, paid, released, status = 'completed' }) {
  const [r] = await query(
    `insert into requests (reference_no, resident_id, service_id, department_id, status,
                           current_step_index, fee_centavos, paid, form_values, submitted_at, paid_at)
     values ($1, $2, $3, $4, $5, 3, 0, $6, '{}'::jsonb, $7::timestamptz, $8::timestamptz)
     returning id`,
    [`RPT-${stamp}-${Math.random().toString(36).slice(2, 8)}`, resident, service, dept,
     status, Boolean(paid), submitted, paid ?? null]
  )
  if (released) {
    await query(
      `insert into request_events (request_id, event_type, created_at)
       values ($1, 'released', $2::timestamptz)`,
      [r.id, released]
    )
  }
  return r.id
}

// Cedula (treasury, promised 0 working days — same day).
// Filed Mon 3rd, paid Mon 3rd, released Wed 5th -> office 2 days, resident 2.
await seedRequest({ service: 'cedula', dept: 'treasury', submitted: '2025-03-03', paid: '2025-03-03', released: '2025-03-05' })
// Filed Mon 3rd, paid Fri 7th, released Mon 10th -> office 1 day, resident 5.
await seedRequest({ service: 'cedula', dept: 'treasury', submitted: '2025-03-03', paid: '2025-03-07', released: '2025-03-10' })
// Filed Tue 4th, paid Tue 4th, released Tue 4th -> office 0, resident 0.
await seedRequest({ service: 'cedula', dept: 'treasury', submitted: '2025-03-04', paid: '2025-03-04', released: '2025-03-04' })
// One still open, and one rejected: counted, but never a turnaround.
await seedRequest({ service: 'cedula', dept: 'treasury', submitted: '2025-03-05', status: 'for_payment' })
await seedRequest({ service: 'cedula', dept: 'treasury', submitted: '2025-03-06', status: 'rejected' })

const report = await buildReport({ from: FROM, to: TO, departments: ['treasury'], all: false })
const cedula = report.rows.find((r) => r.serviceId === 'cedula')

check('every request in the window is counted', cedula.submitted === 5, `${cedula.submitted}`)
check('completed counted', cedula.completed === 3, `${cedula.completed}`)
check('rejected counted apart', cedula.rejected === 1, `${cedula.rejected}`)
check('awaiting payment counted apart', cedula.awaitingPayment === 1, `${cedula.awaitingPayment}`)
check('office median is 1 of {2,1,0}', cedula.medianOfficeDays === 1, `${cedula.medianOfficeDays}`)
check('resident median is 2 of {2,5,0}', cedula.medianResidentDays === 2, `${cedula.medianResidentDays}`)
check('the two clocks differ, which is the point', cedula.medianOfficeDays !== cedula.medianResidentDays)
check('the slowest tenth is the worst office figure', cedula.p90OfficeDays === 2, `${cedula.p90OfficeDays}`)

console.log('\n== met versus missed, against what the catalogue promised ==')
// Cedula promises same day (0 working days), so only the 0-day one met it.
check('one met the target', cedula.metTarget === 1, `${cedula.metTarget}`)
check('two missed it', cedula.missedTarget === 2, `${cedula.missedTarget}`)
check('open and rejected are judged neither way', cedula.metTarget + cedula.missedTarget === 3)
check('the summary rate is met/judged', report.onTimeRate === 33, `${report.onTimeRate}`)

console.log('\n== a request still open has no turnaround ==')
check('it does not drag the median toward today', cedula.medianOfficeDays === 1)
check('summary open count is right', report.stillOpen === 1, `${report.stillOpen}`)

console.log('\n== nothing to judge reports nothing, not zero ==')
const empty = await buildReport({ from: '2024-01-01', to: '2024-01-31', departments: ['treasury'], all: false })
check('no rows', empty.rows.length === 0)
check('median is null, not 0', empty.medianOfficeDays === null)
check('on-time rate is null, not 0%', empty.onTimeRate === null)

console.log('\n== CSV ==')
const csv = toCsv(report)
const lines = csv.split('\r\n')
check('has a header', lines[0].startsWith('"Office","Service"'), lines[0])
check('one line per service row', lines.length === report.rows.length + 1, `${lines.length}`)
check('every field is quoted', lines[1].split('","').length === 12, lines[1])
check('a null median is empty, not the word null', !csv.includes('null'))

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
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { headers: o.token ? { Authorization: `Bearer ${o.token}` } : {} })
  const text = await res.text()
  return { status: res.status, headers: res.headers, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
}
const login = async (email) => (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'elgu-demo-2026' }) })).json()).token
const treasury = await login('treasury@sanfernando.gov.ph')
const lcr = await login('lcr@sanfernando.gov.ph')
const admin = await login('admin@sanfernando.gov.ph')
const period = `from=${FROM}&to=${TO}`

const mine = await j(`/staff/reports?${period}`, { token: treasury })
check('a clerk gets their own office', mine.status === 200 && mine.json.rows.every((r) => r.departmentId === 'treasury'), JSON.stringify(mine.json?.rows?.map((r) => r.departmentId)))
check('and sees the fixture rows', mine.json.submitted >= 5)
const others = await j(`/staff/reports?${period}`, { token: lcr })
check('another office sees none of them', !others.json.rows.some((r) => r.departmentId === 'treasury'))
check('and cannot ask for them', (await j(`/staff/reports?${period}&departmentId=treasury`, { token: lcr })).status === 403)
const everything = await j(`/staff/reports?${period}`, { token: admin })
check('an admin sees every office', everything.status === 200)
check('including treasury', everything.json.rows.some((r) => r.departmentId === 'treasury'))
check('and may scope to one', (await j(`/staff/reports?${period}&departmentId=treasury`, { token: admin })).json.rows.every((r) => r.departmentId === 'treasury'))

console.log('\n== the period is validated ==')
check('missing dates refused', (await j('/staff/reports', { token: treasury })).status === 400)
check('a malformed date refused', (await j('/staff/reports?from=March&to=2025-03-31', { token: treasury })).status === 400)
check('end before start refused', (await j('/staff/reports?from=2025-03-31&to=2025-03-01', { token: treasury })).status === 400)
check('over a year refused', (await j('/staff/reports?from=2024-01-01&to=2025-06-01', { token: treasury })).status === 400)
check('exactly a year is fine', (await j('/staff/reports?from=2025-01-01&to=2025-12-31', { token: treasury })).status === 200)

console.log('\n== CSV over the wire ==')
const download = await j(`/staff/reports?${period}&format=csv`, { token: treasury })
check('served as CSV', /text\/csv/.test(download.headers.get('content-type') ?? ''), download.headers.get('content-type'))
check('as a named download', /attachment; filename=.*\.csv/.test(download.headers.get('content-disposition') ?? ''), download.headers.get('content-disposition'))
check('with nosniff', download.headers.get('x-content-type-options') === 'nosniff')
check('and real rows', download.text.split('\r\n').length >= 2)

console.log('\n== residents have no reports ==')
const who = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `repres.${stamp}@example.com`, password: 'ulat-lang-2026', fullName: 'Iba Tao' }) })
const residentToken = (await who.json()).token
check('a resident is refused', (await j(`/staff/reports?${period}`, { token: residentToken })).status === 403)
check('anonymous is refused', (await j(`/staff/reports?${period}`)).status === 401)

await query(`delete from users where id = $1`, [resident])
await pool.end()
api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
