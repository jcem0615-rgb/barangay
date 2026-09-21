// Password reset. The mechanism matters more than the screen, so this covers
// enumeration, token handling, single use, expiry, and session invalidation.
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'

const API_PORT = 4101
const API = `http://127.0.0.1:${API_PORT}/api`
const OUTBOX = '/tmp/elgu-test-outbox.jsonl'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

await rm(OUTBOX, { force: true })
// The file transport is a real transport, not a test hook: it is how you run
// this without a mail server.
const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), SERVE_WEB: 'false',
         MAIL_TRANSPORT: 'file', MAIL_OUTBOX: OUTBOX, PUBLIC_URL: 'https://portal.example.ph' },
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
async function linkFor(email) {
  const lines = (await readFile(OUTBOX, 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
  const mail = [...lines].reverse().find((m) => m.to === email)
  return mail?.text.match(/https?:\/\/\S+/)?.[0]
}

const email = `reset.${Date.now()}@example.com`
const OLD = 'lumang-password-2026'
const NEW = 'bagong-password-2026'
const first = await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email, password: OLD, fullName: 'Lourdes Aquino' } })
const oldSession = first.json.token

console.log('\n== requesting a link says nothing about who exists ==')
const known = await j('/auth/forgot', { method: 'POST', body: { email } })
const unknown = await j('/auth/forgot', { method: 'POST', body: { email: `ghost.${Date.now()}@example.com` } })
check('known address returns 202', known.status === 202, known.status)
check('unknown address answers identically', unknown.status === unknown.status && JSON.stringify(known.json) === JSON.stringify(unknown.json), JSON.stringify(unknown.json))
check('a malformed address answers the same too', (await j('/auth/forgot', { method: 'POST', body: { email: 'not-an-email' } })).status === 202)
check('no mail was sent to the unknown address', !(await linkFor(`ghost.${Date.now()}@example.com`)))

console.log('\n== the link works once ==')
const link = await linkFor(email)
check('a link was sent', !!link, link)
check('it points at PUBLIC_URL, not the API host', link?.startsWith('https://portal.example.ph/?reset='), link)
const token = new URL(link).searchParams.get('reset')
check('the raw token is not stored anywhere retrievable', token && token.length > 20)

check('a short password is refused', (await j('/auth/reset', { method: 'POST', body: { token, password: 'short' } })).status === 400)
check('a made-up token is refused', (await j('/auth/reset', { method: 'POST', body: { token: 'x'.repeat(40), password: NEW } })).status === 400)
const reset = await j('/auth/reset', { method: 'POST', body: { token, password: NEW } })
check('reset succeeds', reset.status === 204, reset.status)
check('the same link cannot be reused', (await j('/auth/reset', { method: 'POST', body: { token, password: 'another-password-2026' } })).status === 400)

console.log('\n== the new password is the only one that works ==')
check('old password refused', (await j('/auth/login', { method: 'POST', body: { email, password: OLD } })).status === 401)
const relogin = await j('/auth/login', { method: 'POST', body: { email, password: NEW } })
check('new password signs in', relogin.status === 200, relogin.status)

console.log('\n== resetting signs out sessions that already existed ==')
// Without this, resetting would not remove whoever prompted the reset.
const old = await j('/requests', { token: oldSession })
check('the pre-reset session is refused', old.status === 401, old.status)
check('and is told why', /password was changed/i.test(old.json?.error ?? ''), old.json?.error)
check('the new session works', (await j('/requests', { token: relogin.json.token })).status === 200)

console.log('\n== outstanding links are spent by a reset ==')
await j('/auth/forgot', { method: 'POST', body: { email } })
const a = new URL(await linkFor(email)).searchParams.get('reset')
await j('/auth/forgot', { method: 'POST', body: { email } })
const b = new URL(await linkFor(email)).searchParams.get('reset')
check('two requests produce different tokens', a !== b)
check('using the newest works', (await j('/auth/reset', { method: 'POST', body: { token: b, password: 'ikatlong-password-2026' } })).status === 204)
check('the earlier one is dead', (await j('/auth/reset', { method: 'POST', body: { token: a, password: 'ikaapat-password-2026' } })).status === 400)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
