// Field rules: the browser checks them first, but nothing stops a caller
// POSTing straight past the form, so the server is what makes them true.
import { spawn } from 'node:child_process'

const API_PORT = 4114
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
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const stamp = Date.now()
const token = (await j('/auth/register', { method: 'POST', body: { email: `fr.${stamp}@example.com`, password: 'kumpleto-ang-form-2026', fullName: 'Nena B. Cortez' } })).json.token

const BOSS = {
  businessName: 'Cortez Hardware',
  businessType: 'New Business',
  lineOfBusiness: 'Retail / Sari-Sari Store',
  capitalization: '150000',
  businessAddress: '12 Rizal St, Poblacion',
}
const BIRTH = {
  registrantName: 'Nena B. Cortez',
  dateOfBirth: '1990-04-17',
  placeOfBirth: 'San Fernando, Pampanga',
  copies: '2',
}
const post = (serviceId, formValues) => j('/requests', { method: 'POST', token, body: { serviceId, formValues } })
const without = (base, key) => Object.fromEntries(Object.entries(base).filter(([k]) => k !== key))

console.log('\n== a complete application is accepted ==')
const ok = await post('boss-application', BOSS)
check('accepted', ok.status === 201, JSON.stringify(ok.json)?.slice(0, 120))
check('and stored what was sent', ok.json.formValues.businessName === 'Cortez Hardware')

console.log('\n== every required field is required ==')
for (const key of Object.keys(BOSS)) {
  const res = await post('boss-application', without(BOSS, key))
  check(`missing ${key} is refused`, res.status === 400, `${res.status}`)
}
const blank = await post('boss-application', { ...BOSS, businessAddress: '   ' })
check('whitespace does not count as filled in', blank.status === 400, `${blank.status}`)
check('an empty form is refused', (await post('boss-application', {})).status === 400)

console.log('\n== the message names the field the way the form did ==')
const named = await post('boss-application', without(BOSS, 'businessAddress'))
check('uses the label, not the id', named.json.error === 'Business address is required.', named.json.error)
const namedTwo = await post('birth-certificate', without(BIRTH, 'dateOfBirth'))
check('and for another service', namedTwo.json.error === 'Date of birth is required.', namedTwo.json.error)

console.log('\n== a select only takes its own options ==')
const badSelect = await post('boss-application', { ...BOSS, businessType: 'Something Else' })
check('an unlisted choice is refused', badSelect.status === 400, `${badSelect.status}`)
check('and says so', /must be one of the listed choices/.test(badSelect.json.error), badSelect.json.error)
check('a listed choice is fine', (await post('boss-application', { ...BOSS, businessType: 'Renewal' })).status === 201)

console.log('\n== a number field takes numbers ==')
check('letters are refused', (await post('boss-application', { ...BOSS, capitalization: 'a lot' })).status === 400)
const numErr = await post('boss-application', { ...BOSS, capitalization: '12,000' })
check('a thousands separator is refused', numErr.status === 400, `${numErr.status}`)
check('and says so', /must be a number/.test(numErr.json.error ?? ''), numErr.json.error)
check('a plain number is fine', (await post('boss-application', { ...BOSS, capitalization: '150000' })).status === 201)
check('a decimal is fine', (await post('boss-application', { ...BOSS, capitalization: '150000.50' })).status === 201)

console.log('\n== a date field takes real days ==')
check('nonsense is refused', (await post('birth-certificate', { ...BIRTH, dateOfBirth: 'yesterday' })).status === 400)
check('the wrong shape is refused', (await post('birth-certificate', { ...BIRTH, dateOfBirth: '17/04/1990' })).status === 400)
const impossible = await post('birth-certificate', { ...BIRTH, dateOfBirth: '2026-02-31' })
check('a day that does not exist is refused', impossible.status === 400, `${impossible.status}`)
check('and says so', /must be a valid date/.test(impossible.json.error ?? ''), impossible.json.error)
check('a leap day in a leap year is fine', (await post('birth-certificate', { ...BIRTH, dateOfBirth: '2024-02-29' })).status === 201)
check('but not in a common year', (await post('birth-certificate', { ...BIRTH, dateOfBirth: '2025-02-29' })).status === 400)

console.log('\n== the older rules still hold ==')
check('an undeclared field is refused', (await post('boss-application', { ...BOSS, smuggled: 'x' })).status === 400)
const long = await post('boss-application', { ...BOSS, businessAddress: 'x'.repeat(2001) })
check('an oversized value is refused', long.status === 400)
check('and names the field by label', /^Business address is too long/.test(long.json.error ?? ''), long.json.error)

console.log('\n== drafts stay exempt, because a draft is unfinished by definition ==')
check('an empty draft is fine', (await j('/requests/drafts/boss-application', { method: 'PUT', token, body: { formValues: {} } })).status === 200)
check('a draft missing required fields is fine', (await j('/requests/drafts/boss-application', { method: 'PUT', token, body: { formValues: { businessName: 'Half typed' } } })).status === 200)
check('a half-typed date is fine in a draft', (await j('/requests/drafts/birth-certificate', { method: 'PUT', token, body: { formValues: { dateOfBirth: '199' } } })).status === 200)
check('a half-typed select is fine in a draft', (await j('/requests/drafts/boss-application', { method: 'PUT', token, body: { formValues: { businessType: 'New' } } })).status === 200)
check('but a draft still cannot smuggle a field', (await j('/requests/drafts/boss-application', { method: 'PUT', token, body: { formValues: { smuggled: 'x' } } })).status === 400)

console.log('\n== nothing incomplete reached the queue ==')
const bpls = (await j('/auth/login', { method: 'POST', body: { email: 'bpls@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const mine = (await j('/requests', { token })).json
check('only the accepted submissions exist', mine.length === 5, `${mine.length}`)
check('each has every required field', mine.every((r) => Object.keys(BOSS).every((k) => r.formValues[k] ?? r.serviceId !== 'boss-application')))
const queue = (await j('/staff/queue', { token: bpls })).json
const mineInQueue = queue.items.filter((i) => i.formValues?.businessName === 'Cortez Hardware')
check('and the office sees them complete', mineInQueue.every((i) => (i.formValues.businessAddress ?? '').trim() !== ''), `${mineInQueue.length} in queue`)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
