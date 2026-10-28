// The barangay tier: one barangay standing alone, with no hall above it.
//
// What is checked here is mostly an *absence*, which is the hard kind: the
// claim is that the hall's routers are not mounted, and a suite that only
// pokes a handful of paths proves nothing about the one somebody adds next
// year. So the municipal mounts are read out of index.ts and every one of them
// is walked, the same way isolation.mjs walks the two tiers' routers.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
// This suite provisions its own database rather than talking to a running API,
// so it needs the connection string the server reads — from the environment if
// it is there, otherwise from server/.env, exactly as `npm start` does.
import 'dotenv/config'

const API_PORT = 4310
const API = `http://127.0.0.1:${API_PORT}/api`
const BARANGAY = 'poblacion'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const base = process.env.DATABASE_URL
if (!base) throw new Error('DATABASE_URL is not set')
const TIER_DB = base.replace(/\/[^/]+$/, '/elgu_tier_check')

// ---------------------------------------------------------------------------
// A database of its own, provisioned as the product is actually provisioned.
// ---------------------------------------------------------------------------
const admin = new Client({ connectionString: base.replace(/\/[^/]+$/, '/postgres') })
await admin.connect()
// A previous run's API may still hold a connection, and Postgres refuses to
// drop a database anybody is attached to. Nothing here is precious, so the
// connections go first.
await admin.query(
  `select pg_terminate_backend(pid) from pg_stat_activity
    where datname = 'elgu_tier_check' and pid <> pg_backend_pid()`
)
await admin.query(`drop database if exists elgu_tier_check`)
await admin.query(`create database elgu_tier_check`)
await admin.end()

const run = (script, env) => new Promise((resolve, reject) => {
  const p = spawn('npm', ['run', script], {
    env: { ...process.env, ...env, DATABASE_URL: TIER_DB },
    stdio: 'pipe',
  })
  let out = ''
  p.stdout.on('data', (d) => { out += d })
  p.stderr.on('data', (d) => { out += d })
  p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out.slice(-600))))) 
})

await run('migrate', {})
const seeded = await run('seed', { DEPLOYMENT_TIER: 'barangay', BARANGAY_ID: BARANGAY })

console.log('\n== provisioning a barangay deployment ==')
check('the seed says it seeded no hall', /no hall in this tier/.test(seeded), seeded.slice(-200))
check('and names the one barangay', new RegExp(`barangay: `, 'i').test(seeded))

const db = new Client({ connectionString: TIER_DB })
await db.connect()
const count = async (t) => Number((await db.query(`select count(*)::int as n from ${t}`)).rows[0].n)
check('one barangay', await count('barangays') === 1)
check('no departments', await count('departments') === 0)
check('no services', await count('services') === 0)
check('no sectoral programmes', await count('sectoral_programs') === 0)
check('hotlines are still seeded', await count('emergency_contacts') > 0)
check('holidays are still seeded', await count('holidays') > 0)

const owned = Number((await db.query(
  `select count(*)::int as n from barangay_certificate_types where barangay_id = $1`, [BARANGAY]
)).rows[0].n)
const shared = Number((await db.query(
  `select count(*)::int as n from barangay_certificate_types where barangay_id is null`
)).rows[0].n)
check('every certificate type is the barangay’s own', owned > 0 && shared === 0, `own=${owned} shared=${shared}`)

const root = (await db.query(
  `select role::text as role, barangay_id from users where lower(email) = lower($1)`,
  ['admin@malasiqui.gov.ph']
)).rows[0]
check('the root account is a barangay administrator', root?.role === 'barangay_admin', root?.role)
check('and it is scoped to this barangay', root?.barangay_id === BARANGAY, root?.barangay_id)
check('no municipal admin exists at all',
  Number((await db.query(`select count(*)::int as n from users where role = 'admin'`)).rows[0].n) === 0)
await db.end()

// ---------------------------------------------------------------------------
// The API, in barangay tier.
// ---------------------------------------------------------------------------
const api = spawn('npm', ['start'], {
  env: { ...process.env, DATABASE_URL: TIER_DB, DEPLOYMENT_TIER: 'barangay', BARANGAY_ID: BARANGAY, PORT: String(API_PORT) },
  stdio: 'pipe',
})
let boot = ''
api.stdout.on('data', (d) => { boot += d })
api.stderr.on('data', (d) => { boot += d })
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500))
  try { if ((await fetch(`${API}/health`)).ok) break } catch { /* not up yet */ }
}

const j = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

console.log('\n== the boot says which product this is ==')
// The server is up — /health answered — but its stdout reaches this pipe when
// the OS gets round to it, so the line is waited for rather than sampled once.
const says = (re) => new Promise(async (resolve) => {
  for (let i = 0; i < 40; i++) {
    if (re.test(boot)) return resolve(true)
    await new Promise((r) => setTimeout(r, 100))
  }
  resolve(false)
})
check('the log names the tier and the barangay',
  (await says(/tier: barangay/)) && (await says(new RegExp(BARANGAY))), boot.slice(-200))

console.log('\n== the catalogue publishes the tier ==')
const cat = (await j('/catalogue')).json
check('tier is barangay', cat?.tier === 'barangay', cat?.tier)
check('it names the barangay served', cat?.barangay?.id === BARANGAY, JSON.stringify(cat?.barangay))
check('and carries no services', Array.isArray(cat?.services) && cat.services.length === 0)
check('but still carries the hotlines', (cat?.emergencyContacts ?? []).length > 0)

// ---------------------------------------------------------------------------
// Every municipal mount, read out of index.ts and walked.
// ---------------------------------------------------------------------------
console.log('\n== the hall is not mounted, and that is every route ==')
const indexSrc = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const guarded = indexSrc.slice(indexSrc.indexOf("if (tier === 'municipal') {"))
const municipalMounts = [...guarded.matchAll(/app\.use\('(\/api\/[a-z-]+)'/g)].map((m) => m[1])
check('found the municipal mounts in index.ts', municipalMounts.length >= 5, municipalMounts.join(' '))

// Reading the mounts out of the guard covers a route added inside it, but not
// one moved *out*: that would simply vanish from the list and stop being
// walked, which is a hole that widens silently. So the halls' own routes are
// named here too, and a mount that leaves the guard fails this rather than
// quietly going unchecked.
const MUST_BE_GUARDED = ['/api/requests', '/api/payments', '/api/appointments', '/api/staff', '/api/admin', '/api/incidents']
const escaped = MUST_BE_GUARDED.filter((m) => !municipalMounts.includes(m))
check('no hall route has escaped the guard', escaped.length === 0,
  escaped.length ? `${escaped.join(', ')} is mounted in both tiers` : '')

// A self-check: a mount that IS served must not read as absent, or the walk
// below would pass against an app that mounted everything.
const present = await j('/barangay-staff/requests')
check('self-check: a mounted route does not answer 404', present.status !== 404, present.status)

for (const mount of municipalMounts) {
  const res = await j(mount)
  check(`${mount} is not mounted`, res.status === 404, `got ${res.status}`)
}

console.log('\n== the barangay tier is still fully mounted ==')
for (const [path, expect] of [['/barangay-staff/requests', 401], ['/barangay-kagawad/summary', 401], ['/barangays', 200]]) {
  const res = await j(path)
  check(`${path} answers ${expect}`, res.status === expect, `got ${res.status}`)
}

console.log('\n== a resident registers into the one barangay ==')
const stamp = Date.now()
const reg = await j('/auth/register', { method: 'POST', body: {
  email: `tier.${stamp}@example.com`, password: 'isang-barangay-2026', fullName: 'Tier Tester',
  birthDate: '1991-03-03', motherMaidenName: `Maiden ${stamp}`, residesHere: true, barangayId: BARANGAY,
} })
check('registration succeeds', reg.status === 201, `${reg.status} ${JSON.stringify(reg.json)}`)
const token = reg.json?.token
const me = await j('/auth/me', { headers: { authorization: `Bearer ${token}` } })
check('and the account is attached to the barangay',
  me.json?.user?.barangayId === BARANGAY || me.json?.profile?.barangay,
  JSON.stringify(me.json?.user ?? {}).slice(0, 120))

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
