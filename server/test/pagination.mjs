// Queue pagination and search.
//
// Seeds enough requests that paging is real, then checks the property that
// matters: a page boundary must not drop or repeat a row, even when new
// requests arrive between pages.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'

const API_PORT = 4105
const API = `http://127.0.0.1:${API_PORT}/api`
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), SERVE_WEB: 'false', MAIL_TRANSPORT: 'console' },
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

const stamp = Date.now()
const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `page.${stamp}@example.com`, password: 'tamang-lakas-2026', fullName: `Paging Tester ${stamp}` } })).json.token
const health = (await j('/auth/login', { method: 'POST', body: { email: 'health@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token

// health-certificate lands in the Health Office queue; 12 of them, in order.
const created = []
for (let i = 0; i < 12; i++) {
  const r = await j('/requests', { method: 'POST', token: resident, body: {
    serviceId: 'health-certificate', formValues: formFor('health-certificate', { employer: `Shop ${i}` }) } })
  created.push(r.json.id)
}
// Scope every assertion to this run's resident so other tests' rows don't interfere.
const mine = `Paging Tester ${stamp}`

console.log('\n== a page is capped and reports the total ==')
const first = await j(`/staff/queue?q=${encodeURIComponent(mine)}&limit=5`, { token: health })
check('returns exactly the page size', first.json.items.length === 5, first.json.items?.length)
check('reports the full total, not the page', first.json.total === 12, first.json.total)
check('offers a cursor for the next page', typeof first.json.nextCursor === 'string')
check('oldest first', first.json.items[0].id === created[0], first.json.items[0]?.referenceNo)

console.log('\n== paging through covers everything exactly once ==')
let cursor = first.json.nextCursor
const seen = first.json.items.map((r) => r.id)
let pages = 1
while (cursor) {
  const next = await j(`/staff/queue?q=${encodeURIComponent(mine)}&limit=5&cursor=${encodeURIComponent(cursor)}`, { token: health })
  seen.push(...next.json.items.map((r) => r.id))
  cursor = next.json.nextCursor
  pages++
  if (pages > 10) break
}
check('three pages for twelve rows at five per page', pages === 3, pages)
check('every row was returned', seen.length === 12, seen.length)
check('no row was repeated', new Set(seen).size === seen.length, `${seen.length} returned, ${new Set(seen).size} distinct`)
check('in submission order', seen.every((id, i) => id === created[i]))

console.log('\n== a new arrival mid-paging does not disturb the cursor ==')
// This is why the cursor is keyset rather than an offset: with OFFSET, a row
// inserted before the next page shifts everything and page 2 repeats a row.
const page1 = await j(`/staff/queue?q=${encodeURIComponent(mine)}&limit=5`, { token: health })
await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'health-certificate', formValues: formFor('health-certificate', { natureOfWork: 'Food Handler', employer: 'Late arrival' }) } })
const page2 = await j(`/staff/queue?q=${encodeURIComponent(mine)}&limit=5&cursor=${encodeURIComponent(page1.json.nextCursor)}`, { token: health })
const overlap = page2.json.items.filter((r) => page1.json.items.some((p) => p.id === r.id))
check('page 2 repeats nothing from page 1', overlap.length === 0, JSON.stringify(overlap.map(r => r.referenceNo)))
check('page 2 continues where page 1 stopped', page2.json.items[0].id === created[5], page2.json.items[0]?.referenceNo)

console.log('\n== search ==')
const one = await j(`/staff/queue?q=${created.length ? (await j(`/requests/${created[3]}`, { token: resident })).json.referenceNo : ''}`, { token: health })
check('finds a single request by reference number', one.json.items.length === 1 && one.json.items[0].id === created[3], JSON.stringify(one.json.total))
check('a search with no matches returns an empty page', (await j('/staff/queue?q=zzz-no-such-thing', { token: health })).json.items.length === 0)
check('search is case-insensitive', (await j(`/staff/queue?q=${encodeURIComponent(mine.toLowerCase())}&limit=1`, { token: health })).json.total === 13)
check('search still respects department scope',
  (await j(`/staff/queue?q=${encodeURIComponent(mine)}`, { token: (await j('/auth/login', { method: 'POST', body: { email: 'lcr@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token })).json.items.length === 0)

console.log('\n== limits and bad input ==')
check('limit is capped', (await j('/staff/queue?limit=9999', { token: health })).json.items.length <= 100)
check('a nonsense limit falls back to the default', (await j('/staff/queue?limit=abc', { token: health })).status === 200)
check('a corrupt cursor is refused, not ignored', (await j('/staff/queue?cursor=not-a-cursor', { token: health })).status === 400)
check('and says what to do', /reload/i.test((await j('/staff/queue?cursor=not-a-cursor', { token: health })).json?.error ?? ''))

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
