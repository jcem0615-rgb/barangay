// Checking a digital ID at the counter: short-lived, single-use, and scoped to
// the question a clerk is actually asking.
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'

const API_PORT = 4115
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
const formFor = await formFiller(API)
const stamp = Date.now()

const resident = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `idv.${stamp}@example.com`, password: 'patunayan-mo-2026', fullName: 'Lourdes B. Aquino', barangay: 'Poblacion', municipality: 'Malasiqui', province: 'Pangasinan' } })).json.token
const other = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `idv2.${stamp}@example.com`, password: 'patunayan-mo-2026', fullName: 'Iba Tao' } })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const cswdo = (await j('/auth/login', { method: 'POST', body: { email: 'cswdo@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
// An office that never checks this resident, for the negative cases: cswdo and
// treasury both verify them above, which is exactly what the guard allows.
const uninvolved = (await j('/auth/login', { method: 'POST', body: { email: 'lcr@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const issue = (token) => j('/auth/me/verification', { method: 'POST', token })
const verify = (token, code) => j('/staff/verify-id', { method: 'POST', token, body: { code } })

console.log('\n== a resident issues a code from their own ID ==')
const first = await issue(resident)
check('issued', first.status === 200, JSON.stringify(first.json))
check('has a readable code', /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(first.json.code), first.json.code)
check('says when it dies', typeof first.json.expiresAt === 'string')
check('and how long that is', first.json.ttlSeconds === 90, `${first.json.ttlSeconds}`)
check('staff cannot issue one', (await issue(treasury)).status === 403)
check('anonymous cannot', (await j('/auth/me/verification', { method: 'POST' })).status === 401)

console.log('\n== a clerk checks it ==')
const ok = await verify(treasury, first.json.code)
check('accepted', ok.status === 200, JSON.stringify(ok.json)?.slice(0, 140))
check('names the holder', ok.json.fullName === 'Lourdes B. Aquino')
check('and where they live', ok.json.barangay === 'Poblacion' && ok.json.municipality === 'Malasiqui')
check('any office may check, not just one', (await verify(cswdo, (await issue(resident)).json.code)).status === 200)

console.log('\n== it answers only the question a counter asks ==')
const body = JSON.stringify(ok.json)
check('no email', !body.includes('@example.com'), body)
check('no request history', !('requests' in ok.json))
// The counter check used to return the last four digits of a national ID
// number this app never verified against anything. It holds none now, so what
// is asserted is the absence rather than the masking.
check('no national ID number, masked or otherwise', !/philSys/i.test(body), body)
check('says whether a photo exists', typeof ok.json.hasPhoto === 'boolean')
check('carries the live entitlements', Array.isArray(ok.json.programs))

console.log('\n== the entitlements are current, not whatever the card showed ==')
const reqId = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'solo-parent-id', formValues: formFor('solo-parent-id') } })).json.id
await j(`/staff/requests/${reqId}/programs`, { method: 'POST', token: cswdo, body: { code: 'senior', referenceNo: 'OSCA-4412' } })
const afterGrant = await verify(treasury, (await issue(resident)).json.code)
check('a programme granted since then shows up', afterGrant.json.programs.some((p) => p.code === 'senior'), JSON.stringify(afterGrant.json.programs))
await j(`/staff/requests/${reqId}/programs/senior`, { method: 'DELETE', token: cswdo })
const afterRevoke = await verify(treasury, (await issue(resident)).json.code)
check('and one revoked since then does not', !afterRevoke.json.programs.some((p) => p.code === 'senior'))

console.log('\n== a code works once ==')
const single = (await issue(resident)).json.code
check('first check succeeds', (await verify(treasury, single)).status === 200)
const twice = await verify(treasury, single)
check('second is refused', twice.status === 409, `${twice.status}`)
check('and says it was already checked', twice.json.outcome === 'used', JSON.stringify(twice.json))
check('a different clerk cannot reuse it either', (await verify(cswdo, single)).status === 409)

console.log('\n== issuing a new one retires the old ==')
const stale = (await issue(resident)).json.code
const fresh = (await issue(resident)).json.code
check('the newest works', (await verify(treasury, fresh)).status === 200)
const staleResult = await verify(treasury, stale)
check('the one it replaced does not', staleResult.status === 409, `${staleResult.status}`)

console.log('\n== a code that was never issued ==')
const bogus = await verify(treasury, 'ZZZZ-ZZZZ-ZZZZ')
check('is not found', bogus.status === 404, `${bogus.status}`)
check('and is reported as unknown', bogus.json.outcome === 'unknown')
check('a malformed one is refused outright', (await verify(treasury, 'x')).status === 400)
check('so is an absurd one', (await verify(treasury, 'x'.repeat(200))).status === 400)

console.log('\n== formatting is forgiving, matching is not ==')
const typed = (await issue(resident)).json.code
check('lower case and no dashes still match', (await verify(treasury, typed.toLowerCase().replace(/-/g, ''))).status === 200)
const another = (await issue(resident)).json.code
check('but one wrong character does not', (await verify(treasury, another.slice(0, -1) + (another.endsWith('0') ? '1' : '0'))).status !== 200)

console.log('\n== only staff may check ==')
check('a resident cannot verify anyone', (await verify(resident, (await issue(resident)).json.code)).status === 403)
check('not even themselves', (await j('/staff/verify-id', { method: 'POST', token: other, body: { code: 'ABCD-EFGH-JKLM' } })).status === 403)
check('anonymous cannot', (await j('/staff/verify-id', { method: 'POST', body: { code: 'ABCD-EFGH-JKLM' } })).status === 401)

console.log('\n== the face, only for a check just performed ==')
const photoJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)])
const form = new FormData()
form.append('file', new Blob([photoJpeg], { type: 'image/jpeg' }), 'me.jpg')
await fetch(`${API}/auth/me/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${resident}` }, body: form })
const checked = await verify(treasury, (await issue(resident)).json.code)
check('the check reports a photo', checked.json.hasPhoto === true)
const seen = await fetch(`${API}/staff/verify-id/${checked.json.residentId}/photo`, { headers: { Authorization: `Bearer ${treasury}` } })
check('the clerk who checked can see it', seen.status === 200, `${seen.status}`)
check('served as an image', seen.headers.get('content-type') === 'image/jpeg')
check('never cached', /no-store/.test(seen.headers.get('cache-control') ?? ''))
const stranger = await fetch(`${API}/staff/verify-id/${checked.json.residentId}/photo`, { headers: { Authorization: `Bearer ${uninvolved}` } })
check('a clerk who did not check cannot', stranger.status === 404, `${stranger.status}`)
check('and neither can a resident', (await fetch(`${API}/staff/verify-id/${checked.json.residentId}/photo`, { headers: { Authorization: `Bearer ${other}` } })).status === 403)

console.log('\n== a deactivated account does not verify ==')
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
check('staff accounts are the only ones an admin can deactivate', (await j('/admin/staff', { token: admin })).status === 200)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
