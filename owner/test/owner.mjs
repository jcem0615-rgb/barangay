// The owner portal: the registry, who may change it, and what it refuses.
//
// It provisions its own database so a run cannot disturb a real registry, and
// it drives the console over HTTP as a browser would — forms, cookies, CSRF —
// because every write here is a form post and testing the functions
// underneath would skip the half that can actually be got wrong.
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import 'dotenv/config'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PORT = 4521
const BASE = `http://127.0.0.1:${PORT}`
const DB_NAME = 'elgu_owner_check'
const TOKEN_KEY = randomBytes(32).toString('hex')

let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
const section = (n) => console.log(`\n== ${n} ==`)

// --------------------------------------------------------------- a fresh db
const adminUrl = process.env.OWNER_DATABASE_URL ?? process.env.DATABASE_URL
if (!adminUrl) { console.log('OWNER_DATABASE_URL or DATABASE_URL must be set'); process.exit(1) }
const url = new URL(adminUrl)
const DB_URL = `${url.protocol}//${url.username}:${url.password}@${url.host}/${DB_NAME}`
const psqlEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }
const psql = (args) => execFileSync('psql', ['-h', url.hostname, '-p', url.port || '5432', '-U', url.username, ...args],
  { env: psqlEnv, stdio: 'pipe' }).toString()

try {
  // Terminate anything still attached, or the drop blocks for ever.
  psql(['-d', 'postgres', '-c',
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}'`])
  psql(['-d', 'postgres', '-c', `drop database if exists ${DB_NAME}`])
  psql(['-d', 'postgres', '-c', `create database ${DB_NAME}`])
} catch (err) {
  console.log('could not provision the check database:', String(err.stderr ?? err).slice(0, 300))
  process.exit(1)
}

const childEnv = {
  ...process.env,
  OWNER_DATABASE_URL: DB_URL,
  OWNER_TOKEN_KEY: TOKEN_KEY,
  PORT: String(PORT),
  // Long enough that the background sweep never fires during the run; the
  // tests probe explicitly so the timing is theirs, not a timer's.
  OWNER_PROBE_INTERVAL_MS: String(60 * 60_000),
  OWNER_PROBE_TIMEOUT_MS: '2000',
  NODE_ENV: 'test',
}

const run = (script, env = {}) =>
  execFileSync(process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', `src/${script}.ts`],
    { cwd: root, env: { ...childEnv, ...env }, stdio: 'pipe' }).toString()

run('migrate')
const OWNER_PW = randomBytes(12).toString('base64url')
const VIEWER_PW = randomBytes(12).toString('base64url')
run('seed', { OWNER_EMAIL: 'director@example.test', OWNER_NAME: 'A Director', OWNER_PASSWORD: OWNER_PW })
run('seed', { OWNER_EMAIL: 'reader@example.test', OWNER_NAME: 'A Reader', OWNER_PASSWORD: VIEWER_PW, OWNER_ROLE: 'viewer' })

// ----------------------------------------------------------------- the app
const server = spawn(process.execPath,
  ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'],
  { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}
if (!(await waitUp())) { console.log('owner portal did not start'); server.kill('SIGKILL'); process.exit(1) }

/** A browser-shaped client: keeps the cookie, follows nothing automatically. */
function client() {
  let cookie = ''
  const jar = (res) => {
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) {
      const [pair] = c.split(';')
      if (pair?.startsWith('owner_session=')) cookie = pair
    }
  }
  return {
    get cookie() { return cookie },
    async get(path) {
      const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
      jar(res)
      return { status: res.status, location: res.headers.get('location'), body: await res.text() }
    },
    async post(path, fields) {
      const res = await fetch(BASE + path, {
        method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
        body: new URLSearchParams(fields).toString(),
      })
      jar(res)
      return { status: res.status, location: res.headers.get('location'), body: await res.text() }
    },
  }
}

/** The CSRF token for a session, read off a rendered form. */
const csrfOf = (html) => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1] ?? ''

// ---------------------------------------------------------------------------
section('nothing is readable without signing in')
{
  const anon = client()
  const root = await anon.get('/')
  check('the list redirects to sign-in', root.status === 302 && String(root.location).startsWith('/sign-in'), `${root.status} ${root.location}`)
  check('activity redirects too', (await anon.get('/activity')).status === 302)
  check('the add form redirects too', (await anon.get('/new')).status === 302)
  const bad = await anon.post('/sign-in', { email: 'director@example.test', password: 'wrong' })
  check('a wrong password is refused', bad.status === 401)
  check('and does not say whether the account exists', !/no such|unknown account/i.test(bad.body))
}

// ---------------------------------------------------------------------------
section('a director signs in and adds a deployment')
const owner = client()
{
  const res = await owner.post('/sign-in', { email: 'director@example.test', password: OWNER_PW })
  check('signed in', res.status === 302 && res.location === '/', `${res.status} ${res.location}`)
  check('a session cookie was set', owner.cookie.startsWith('owner_session='))
}

const form = await owner.get('/new')
const csrf = csrfOf(form.body)
check('the form carries a CSRF token', csrf.length > 10)

const MUNI = {
  _csrf: csrf, tier: 'municipal', slug: 'bugallon',
  municipalityCode: 'bugallon-pangasinan', municipalityName: 'Bugallon',
  municipalityProvince: 'Pangasinan', publicUrl: 'https://bugallon.example.test/',
  contactName: 'Office of the Mayor', contactEmail: 'admin@bugallon.example.test',
  contactPhone: '', notes: '',
}
let muniId = ''
{
  const res = await owner.post('/new', MUNI)
  check('it was added', res.status === 200 && /is on the registry/.test(res.body), String(res.status))
  check('the ops token is shown once', /OPS_TOKEN=[0-9a-f]{64}/.test(res.body))
  check('the download QR is there immediately', /<svg[^>]*role="img"/.test(res.body))
  check('the QR encodes the address with no trailing slash', /https:\/\/bugallon\.example\.test<\/code>/.test(res.body))
  muniId = (res.body.match(/\/d\/([0-9a-f-]{36})/) || [])[1] ?? ''
  check('it has an id', muniId.length === 36)
}

// ---------------------------------------------------------------------------
section('the shape rules are the database\'s, and the message is the form\'s')
{
  const f = csrfOf((await owner.get('/new')).body)
  const noBarangay = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'x-brgy', tier: 'barangay', municipalityCode: 'x-pangasinan' })
  check('a barangay deployment with no barangay is refused', noBarangay.status === 400 && /roster id/i.test(noBarangay.body))

  const strayBarangay = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'y-muni', municipalityCode: 'y-pangasinan', barangayId: 'poblacion' })
  check('a municipal deployment naming a barangay is refused', strayBarangay.status === 400 && /leave the barangay blank/i.test(strayBarangay.body))

  const badSlug = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'Not A Slug', municipalityCode: 'z-pangasinan' })
  check('a slug with spaces is refused', badSlug.status === 400)

  const badUrl = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'nourl', municipalityCode: 'n-pangasinan', publicUrl: 'bugallon.example.test' })
  check('an address with no scheme is refused', badUrl.status === 400 && /full address/i.test(badUrl.body))

  const dupe = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'bugallon-again' })
  check('a second deployment for the same place is refused', dupe.status === 400 && /already a deployment/i.test(dupe.body))
}

// ---------------------------------------------------------------------------
section('CSRF is required on every write')
{
  const f = csrfOf((await owner.get(`/d/${muniId}`)).body)
  check('the detail page carries one', f.length > 10)
  const noToken = await owner.post(`/d/${muniId}/status`, { status: 'live' })
  check('a post with no token is refused', noToken.status === 400 && /expired/i.test(noToken.body))
  const wrongToken = await owner.post(`/d/${muniId}/status`, { status: 'live', _csrf: 'nope' })
  check('a post with the wrong token is refused', wrongToken.status === 400)
  const ok = await owner.post(`/d/${muniId}/status`, { status: 'live', _csrf: f })
  check('and with the right one it goes through', ok.status === 302)
}

// ---------------------------------------------------------------------------
section('what is editable, and what is not')
{
  const page = await owner.get(`/d/${muniId}/edit`)
  const f = csrfOf(page.body)
  check('the edit form has no slug field', !/name="slug"/.test(page.body))
  check('and no municipality code field', !/name="municipalityCode"/.test(page.body))

  const res = await owner.post(`/d/${muniId}/edit`, {
    _csrf: f, municipalityName: 'Bugallon', municipalityProvince: 'Pangasinan',
    publicUrl: 'https://bugallon.gov.ph', contactName: 'Hon. Somebody',
    contactEmail: 'mayor@bugallon.example.test', contactPhone: '0917 000 0000', notes: 'Signed.',
  })
  check('an edit saves', res.status === 302)

  const after = await owner.get(`/d/${muniId}`)
  check('the new address is shown', /bugallon\.gov\.ph/.test(after.body))
  check('the QR follows the new address', /https:\/\/bugallon\.gov\.ph/.test(after.body))

  // Trying to rename the place it *is* rather than what it is called.
  const sneaky = await owner.post(`/d/${muniId}/edit`, {
    _csrf: csrfOf((await owner.get(`/d/${muniId}/edit`)).body),
    municipalityName: 'Bugallon', municipalityProvince: 'Pangasinan',
    publicUrl: 'https://bugallon.gov.ph', contactName: '', contactEmail: '', contactPhone: '', notes: '',
    municipalityCode: 'somewhere-else',
  })
  check('an unknown field refuses the whole request', sneaky.status === 400, String(sneaky.status))
  const unchanged = await owner.get(`/d/${muniId}`)
  check('and the code is untouched', /bugallon-pangasinan/.test(unchanged.body))
}

// ---------------------------------------------------------------------------
section('a reader can read and cannot write')
const viewer = client()
{
  await viewer.post('/sign-in', { email: 'reader@example.test', password: VIEWER_PW })
  const list = await viewer.get('/')
  check('the list renders', list.status === 200 && /Bugallon/.test(list.body))
  check('with no "Add a deployment" button', !/Add a deployment/.test(list.body))

  const detail = await viewer.get(`/d/${muniId}`)
  check('the detail page renders', detail.status === 200)
  check('with no lifecycle controls', !/Decommission/.test(detail.body))

  check('the poster is readable', (await viewer.get(`/d/${muniId}/poster`)).status === 200)
  check('the setup page is readable', (await viewer.get(`/d/${muniId}/setup`)).status === 200)

  check('the add form is refused', (await viewer.get('/new')).status === 403)
  const write = await viewer.post(`/d/${muniId}/status`, { status: 'suspended', _csrf: csrfOf(detail.body) })
  check('and a write is refused', write.status === 403, String(write.status))

  // A reader may still run a check — it changes nothing about the customer.
  const probe = await viewer.post(`/d/${muniId}/probe`, { _csrf: csrfOf(detail.body) })
  check('but a reader may still run a check', probe.status === 302, String(probe.status))
}

// ---------------------------------------------------------------------------
section('a deployment that is not there reads as not answering')
{
  const after = await owner.get(`/d/${muniId}`)
  check('the failure is reported in words', /Not answering/.test(after.body))
  check('and names a cause rather than "fetch failed"',
    /does not resolve|Nothing is listening|No answer within/.test(after.body),
    (after.body.match(/Not answering\.<\/b>\s*([^<]{0,90})/) || [])[1])
}

// ---------------------------------------------------------------------------
section('the setup page is generated from the row')
{
  const setup = await owner.get(`/d/${muniId}/setup`)
  check('it carries the municipality code', /MUNICIPALITY_CODE=bugallon-pangasinan/.test(setup.body))
  check('it carries the address', /PUBLIC_URL=https:\/\/bugallon\.gov\.ph/.test(setup.body))
  check('it does not print the ops token', !/OPS_TOKEN=[0-9a-f]{64}/.test(setup.body))
  check('it says the console does not provision anything', /does not provision anything itself/.test(setup.body))
}

// ---------------------------------------------------------------------------
section('rotating the token shows it once and only once')
{
  const f = csrfOf((await owner.get(`/d/${muniId}`)).body)
  const res = await owner.post(`/d/${muniId}/rotate`, { _csrf: f })
  const first = (res.body.match(/OPS_TOKEN=([0-9a-f]{64})/) || [])[1]
  check('a new token is shown', Boolean(first))
  const detail = await owner.get(`/d/${muniId}`)
  check('and never again on the deployment page', !/OPS_TOKEN=[0-9a-f]{64}/.test(detail.body))
}

// ---------------------------------------------------------------------------
section('decommissioning, and then forgetting')
{
  let f = csrfOf((await owner.get(`/d/${muniId}`)).body)
  const noReason = await owner.post(`/d/${muniId}/decommission`, { _csrf: f, reason: '  ' })
  check('a decommission with no reason is refused',
    noReason.status === 302 && String(noReason.location).includes('error='))

  f = csrfOf((await owner.get(`/d/${muniId}`)).body)
  const done = await owner.post(`/d/${muniId}/decommission`, { _csrf: f, reason: 'Contract ended' })
  check('with a reason it goes through', done.status === 302)

  const after = await owner.get(`/d/${muniId}`)
  check('the page says the database was not touched', /database was not touched/.test(after.body))
  check('and shows the reason', /Contract ended/.test(after.body))

  f = csrfOf(after.body)
  const wrong = await owner.post(`/d/${muniId}/forget`, { _csrf: f, confirm: 'not-the-slug' })
  check('forgetting with the wrong slug removes nothing',
    wrong.status === 302 && String(wrong.location).includes('error='))
  check('it is still there', (await owner.get(`/d/${muniId}`)).status === 200)

  f = csrfOf((await owner.get(`/d/${muniId}`)).body)
  const gone = await owner.post(`/d/${muniId}/forget`, { _csrf: f, confirm: 'bugallon' })
  check('with the slug typed back it is removed', gone.status === 302 && String(gone.location).includes('ok='))
  check('and the page is now not found', (await owner.get(`/d/${muniId}`)).status === 404)

  const activity = await owner.get('/activity')
  check('but the history survived it', /bugallon/.test(activity.body))
  check('including who did what', /A Director/.test(activity.body))
  check('and that it was removed', /Removed/.test(activity.body))
}

// ---------------------------------------------------------------------------
section('a live deployment cannot be removed without decommissioning first')
{
  const f = csrfOf((await owner.get('/new')).body)
  const res = await owner.post('/new', { ...MUNI, _csrf: f, slug: 'labrador', municipalityCode: 'labrador-pangasinan', municipalityName: 'Labrador' })
  const id = (res.body.match(/\/d\/([0-9a-f-]{36})/) || [])[1]
  const detail = await owner.get(`/d/${id}`)
  check('a live deployment has no forget form', !/name="confirm"/.test(detail.body))
  const forced = await owner.post(`/d/${id}/forget`, { _csrf: csrfOf(detail.body), confirm: 'labrador' })
  check('and forcing it is refused', String(forced.location ?? '').includes('error='), String(forced.location))
  check('it is still on the registry', (await owner.get(`/d/${id}`)).status === 200)
}

// ---------------------------------------------------------------------------
section('signing out ends the session for good')
{
  await owner.get('/sign-out')
  const after = await owner.get('/')
  check('the session no longer works', after.status === 302 && String(after.location).startsWith('/sign-in'))
}

server.kill('SIGTERM')
await new Promise((r) => { server.once('exit', r); setTimeout(() => { server.kill('SIGKILL'); r() }, 4000) })
try {
  psql(['-d', 'postgres', '-c', `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}'`])
  psql(['-d', 'postgres', '-c', `drop database if exists ${DB_NAME}`])
} catch { /* leave it; the next run drops it */ }

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
