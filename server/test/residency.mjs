// Residency and duplicate accounts.
//
// Two rules that were previously nobody's job: which municipality an account
// belongs to, and whether the person behind it already has one.
import { spawn } from 'node:child_process'
// Reaching into the database directly for one check, because the only way an
// account can belong to another municipality is a database that outlived the
// deployment that filled it — there is no API that produces one.
import { query } from '../src/db.ts'

const API_PORT = 4126
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
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const stamp = Date.now()
const register = (body) => j('/auth/register', { method: 'POST', body })
const base = { password: 'tirahan-ko-2026', birthDate: '1988-06-14', residesHere: true }

console.log('\n== the municipality is the deployment\'s, not the browser\'s ==')

const cat = await j('/catalogue')
check('the public catalogue names the municipality it serves',
  typeof cat.json.municipality?.code === 'string' && cat.json.municipality.name.length > 0,
  JSON.stringify(cat.json.municipality))
const served = cat.json.municipality

const liar = await register({
  ...base,
  email: `liar.${stamp}@example.com`,
  fullName: 'Mapagpanggap Na Tao',
  motherMaidenName: `Lopez ${stamp}`,
  // Sent deliberately: a browser asserting a municipality must not be believed.
  municipality: 'Somewhere Else',
  province: 'Another Province',
})
check('registration succeeds', liar.status === 201, liar.status)

const liarMe = await j('/auth/me', { token: liar.json.token })
check('and the profile is stamped with the served municipality, not the one sent',
  liarMe.json.profile.municipality === served.name && liarMe.json.profile.province === served.province,
  `${liarMe.json.profile.municipality} / ${liarMe.json.profile.province}`)

console.log('\n== living here is asked, not assumed ==')

const noClaim = await register({
  ...base, email: `noclaim.${stamp}@example.com`, fullName: 'Walang Sagot',
  motherMaidenName: `Reyes ${stamp}`, residesHere: undefined,
})
check('registration without the residency statement is refused', noClaim.status === 400, noClaim.status)

const denies = await register({
  ...base, email: `elsewhere.${stamp}@example.com`, fullName: 'Taga Ibang Bayan',
  motherMaidenName: `Cruz ${stamp}`, residesHere: false,
})
check('and so is one that says they live elsewhere', denies.status === 400, denies.status)

console.log('\n== one person, one account ==')

const twin = { fullName: 'Jose P. Santos', birthDate: '1975-11-02', motherMaidenName: `Bautista ${stamp}` }
const first = await register({ ...base, ...twin, email: `jose.${stamp}@example.com` })
check('the first registration is accepted', first.status === 201, first.status)

const again = await register({ ...base, ...twin, email: `jose.again.${stamp}@example.com` })
check('the same person under a new email address is refused', again.status === 409, again.status)
check('and told what to do about it',
  /already exists/i.test(again.json.error) && /Local Civil Registrar/i.test(again.json.error),
  again.json.error)

// A middle initial is on half the forms in any municipal office and missing from
// the other half; if it defeated the check, the check would be useless.
const noInitial = await register({ ...base, ...twin, fullName: 'Jose Santos', email: `jose.ni.${stamp}@example.com` })
check('dropping the middle initial does not get a second account', noInitial.status === 409, noInitial.status)

const casing = await register({
  ...base, ...twin, fullName: 'JOSE P. SANTOS', motherMaidenName: `  bautista ${stamp}  `,
  email: `jose.caps.${stamp}@example.com`,
})
check('nor does shouting it in different case and spacing', casing.status === 409, casing.status)

// Twins share a birth date and a mother's maiden name and are two people. A
// check keyed on those alone would refuse the second one at the counter.
const twinSibling = await register({ ...base, ...twin, fullName: 'Maria P. Santos', email: `maria.${stamp}@example.com` })
check('but a twin — same birth date, same mother, different name — registers fine',
  twinSibling.status === 201, twinSibling.status)

console.log('\n== identity facts are required, and not stored in the clear ==')

const noMother = await register({
  ...base, email: `nomother.${stamp}@example.com`, fullName: 'Walang Ina Nakalagay',
})
check("registration without the mother's maiden name is refused", noMother.status === 400, noMother.status)

const noBirth = await register({
  ...base, email: `nobirth.${stamp}@example.com`, fullName: 'Walang Petsa',
  motherMaidenName: `Garcia ${stamp}`, birthDate: undefined,
})
check('and without a date of birth', noBirth.status === 400, noBirth.status)

// The export is everything the app holds about a resident. The maiden name must
// not be in it, because it is not kept.
const dump = await j('/privacy/export', { token: first.json.token })
check("the data export does not contain the mother's maiden name",
  dump.status === 200 && !JSON.stringify(dump.json).toLowerCase().includes('bautista'),
  dump.status)

console.log('\n== signing in ==')

const joseEmail = `jose.${stamp}@example.com`
const ok = await j('/auth/login', { method: 'POST', body: { email: joseEmail, password: base.password } })
check('a resident of this municipality signs in', ok.status === 200, ok.status)

const staff = await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: process.env.SEED_PASSWORD ?? 'elgu-demo-2026' } })
check('and so does its staff', staff.status === 200, staff.status)

await query(`update users set municipality_code = 'somewhere-else' where lower(email) = lower($1)`, [joseEmail])

const foreign = await j('/auth/login', { method: 'POST', body: { email: joseEmail, password: base.password } })
check('an account stamped with another municipality is refused', foreign.status === 403, foreign.status)
check('and told where to sign in instead', /another municipality/i.test(foreign.json.error), foreign.json.error)

const wrongPassword = await j('/auth/login', { method: 'POST', body: { email: joseEmail, password: 'not-the-password' } })
check('a wrong password is still just a wrong password — the refusal does not leak which municipality an address belongs to',
  wrongPassword.status === 401, wrongPassword.status)

// Accounts made before the residency migration carry no stamp. They were created
// by this deployment, so they still sign in.
await query(`update users set municipality_code = null where lower(email) = lower($1)`, [joseEmail])
const legacy = await j('/auth/login', { method: 'POST', body: { email: joseEmail, password: base.password } })
check('an account from before the rule existed still signs in', legacy.status === 200, legacy.status)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
