// The ops status endpoint: what a deployment tells the firm that sells it.
//
// The load-bearing claim is a negative one — **nothing in this response
// identifies a resident.** The owner portal's whole safety argument rests on
// it, because the alternative design (a control plane holding every
// DATABASE_URL) is the one thing the portal's isolation model exists to make
// impossible. A field added here next year that happens to carry a name would
// undo that silently, so the test walks the entire response rather than
// checking a list of keys somebody has to remember to update.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import 'dotenv/config'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PORT = 4331
const BASE = `http://127.0.0.1:${PORT}`
const TOKEN = randomBytes(32).toString('hex')

let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
const section = (n) => console.log(`\n== ${n} ==`)

function start(env) {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'],
    { cwd: root, env: { ...process.env, PORT: String(PORT), SERVE_WEB: 'false', ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

async function waitUp(path = '/api/health') {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + path)
      if (res.status < 500) return true
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

const stop = (child) => new Promise((r) => { child.once('exit', r); child.kill('SIGTERM'); setTimeout(() => { child.kill('SIGKILL'); r() }, 4000) })

// ---------------------------------------------------------------------------
section('with no OPS_TOKEN, there is no ops route at all')

let server = start({})
if (!(await waitUp())) { console.log('server did not start'); process.exit(1) }

{
  const res = await fetch(`${BASE}/api/ops/status`, { headers: { authorization: `Bearer ${TOKEN}` } })
  check('the route is not mounted', res.status === 404, `got ${res.status}`)
  // The self-check: a route that *is* mounted does not read as absent, so a
  // 404 above means something rather than everything being 404.
  const health = await fetch(`${BASE}/api/health`)
  check('and a mounted route still answers', health.status === 200, `got ${health.status}`)
}
await stop(server)

// ---------------------------------------------------------------------------
section('with a token, it answers only to that token')

server = start({ OPS_TOKEN: TOKEN })
if (!(await waitUp())) { console.log('server did not start'); process.exit(1) }

{
  check('no header is 401', (await fetch(`${BASE}/api/ops/status`)).status === 401)
  check('a wrong token is 401', (await fetch(`${BASE}/api/ops/status`, { headers: { authorization: 'Bearer nope' } })).status === 401)
  check('a token of the right length but wrong value is 401',
    (await fetch(`${BASE}/api/ops/status`, { headers: { authorization: `Bearer ${randomBytes(32).toString('hex')}` } })).status === 401)
  check('a bare token without Bearer is 401',
    (await fetch(`${BASE}/api/ops/status`, { headers: { authorization: TOKEN } })).status === 401)
}

const res = await fetch(`${BASE}/api/ops/status`, { headers: { authorization: `Bearer ${TOKEN}` } })
const body = await res.json()
check('the right token is 200', res.status === 200, `got ${res.status}`)

// ---------------------------------------------------------------------------
section('it reports identity, so a wrong database is visible')

check('names the tier', body.tier === 'municipal' || body.tier === 'barangay', String(body.tier))
check('names the product', typeof body.productName === 'string' && body.productName.length > 0)
check('names the municipality it serves', typeof body.municipality?.code === 'string')
check('says where that came from', ['environment', 'sample'].includes(body.configuredFrom), String(body.configuredFrom))
check('reports how many migrations are applied', Number.isInteger(body.migrations) && body.migrations > 0)
check('reports when the process came up', !Number.isNaN(Date.parse(body.startedAt)))

// ---------------------------------------------------------------------------
section('it reports the things a live LGU must have turned on')

check('mail transport', typeof body.mail === 'string')
check('sms transport', typeof body.sms === 'string')
check('push', typeof body.push === 'boolean')
check('virus scanning', typeof body.virusScanning === 'boolean')
check('payment provider', typeof body.paymentProvider === 'string')

// ---------------------------------------------------------------------------
section('the counts are counts')

const counts = body.counts ?? {}
check('there are counts', Object.keys(counts).length > 10, String(Object.keys(counts).length))
check('every one of them is a whole number',
  Object.values(counts).every((v) => Number.isInteger(v)),
  JSON.stringify(Object.entries(counts).filter(([, v]) => !Number.isInteger(v))))
check('residents are counted', Number.isInteger(counts.residents))
check('open work is counted', Number.isInteger(counts.requestsOpen) && Number.isInteger(counts.certificateRequestsOpen))

// ---------------------------------------------------------------------------
section('and nothing in the whole response identifies anybody')

/**
 * Walk every string in the response and refuse anything that looks like a
 * person or a document. This is deliberately a scan rather than a key list:
 * the risk is a field somebody adds later, and a list of known-bad keys only
 * catches the fields we already thought about.
 */
function strings(value, path = '$', out = []) {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  return out
}

const found = strings(body)
// What is legitimately a string here: the tier, the product name, the
// municipality and barangay the deployment serves, its own public URL, the
// transports, and two timestamps. Everything else is a number.
const ALLOWED_PATHS = new Set([
  '$.tier', '$.productName', '$.configuredFrom', '$.startedAt', '$.serverTime',
  '$.publicUrl', '$.mail', '$.sms', '$.paymentProvider', '$.lastActivity',
  '$.municipality.code', '$.municipality.name', '$.municipality.province',
  '$.barangay.id', '$.barangay.name',
])
const unexpected = found.filter(([p]) => !ALLOWED_PATHS.has(p))
check('no string field beyond the known set', unexpected.length === 0,
  JSON.stringify(unexpected.slice(0, 4)))

const emailish = found.filter(([, v]) => /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(v))
check('no email address anywhere', emailish.length === 0, JSON.stringify(emailish.slice(0, 3)))

// Reference numbers are the other shape that identifies a transaction.
const referenceish = found.filter(([, v]) => /\b[A-Z]{2,5}-\d{4}-\d{4,}\b/.test(v))
check('no reference number anywhere', referenceish.length === 0, JSON.stringify(referenceish.slice(0, 3)))

check('no resident array of any kind',
  !Object.keys(body).some((k) => Array.isArray(body[k])),
  JSON.stringify(Object.keys(body).filter((k) => Array.isArray(body[k]))))

// The self-check for the scan itself: it has to be able to go off. A field
// carrying an address would be caught, so prove the detector works.
const fakeEmails = strings({ counts: { x: 1 }, leaked: 'juan.santos@example.com' })
  .filter(([, v]) => /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(v))
check('the scan can fail (self-check)', fakeEmails.length === 1)

await stop(server)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
