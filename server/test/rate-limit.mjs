const API = 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
async function call(path, body, headers = {}) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: res.status, retryAfter: res.headers.get('retry-after'), json: await res.json().catch(() => null) }
}

// Register a real account to prove a locked-out account rejects the CORRECT password too.
const email = `rl.${Date.now()}@example.com`
const pw = 'tamang-lakas-2026'
const reg = await call('/auth/register', { email, password: pw, fullName: 'Rate Limit Test' })
check('setup: account created', reg.status === 201, reg.status)

console.log('\n== per-account lockout ==')
const codes = []
for (let i = 0; i < 6; i++) codes.push((await call('/auth/login', { email, password: 'wrong-password-xx' })).status)
console.log('  statuses across 6 wrong attempts:', codes.join(', '))
check('first 5 wrong attempts return 401', codes.slice(0, 5).every((c) => c === 401))
check('6th attempt is blocked with 429', codes[5] === 429)

const locked = await call('/auth/login', { email, password: pw })
check('CORRECT password is also refused while locked', locked.status === 429, locked.status)
check('429 carries a Retry-After header', Number(locked.retryAfter) > 0, locked.retryAfter)
check('message tells the resident when to retry', /try again in \d+ minute/i.test(locked.json?.error ?? ''), locked.json?.error)

console.log('\n== lockout does not leak whether an account exists ==')
const ghost = `ghost.${Date.now()}@example.com`
const ghostCodes = []
for (let i = 0; i < 6; i++) ghostCodes.push((await call('/auth/login', { email: ghost, password: 'wrong-password-xx' })).status)
check('unknown address locks out identically', ghostCodes[5] === 429, ghostCodes.join(','))

console.log('\n== a different account is unaffected ==')
const other = `other.${Date.now()}@example.com`
const oreg = await call('/auth/register', { email: other, password: pw, fullName: 'Other Person' })
check('different account can still register', oreg.status === 201, JSON.stringify(oreg.json))
const ok = await call('/auth/login', { email: other, password: pw })
check('different account can still sign in', ok.status === 200, ok.status)

console.log('\n== a correct password clears the counter ==')
const email2 = `clear.${Date.now()}@example.com`
await call('/auth/register', { email: email2, password: pw, fullName: 'Clear Test' })
for (let i = 0; i < 3; i++) await call('/auth/login', { email: email2, password: 'wrong-password-xx' })
check('sign-in succeeds after 3 misses', (await call('/auth/login', { email: email2, password: pw })).status === 200)
const afterClear = []
for (let i = 0; i < 4; i++) afterClear.push((await call('/auth/login', { email: email2, password: 'wrong-password-xx' })).status)
check('counter reset: 4 more misses still 401, not locked', afterClear.every((c) => c === 401), afterClear.join(','))

console.log('\n== X-Forwarded-For cannot be forged past the limit ==')
const spoofed = await call('/auth/login',
  { email, password: 'wrong-password-xx' },
  { 'X-Forwarded-For': '203.0.113.' + Math.floor(Math.random() * 250) })
check('still blocked despite a fresh forwarded IP', spoofed.status === 429, spoofed.status)

console.log('\n== per-IP limit ==')
// Needs TRUST_PROXY=1 on the server for X-Forwarded-For to be believed; without
// it every request looks like one address and this axis can't be exercised.
if (process.env.TRUST_PROXY === '1') {
  const attacker = '203.0.113.77'
  const codes = []
  for (let i = 0; i < 21; i++) {
    codes.push((await call('/auth/login', { email: `victim${i}.${Date.now()}@example.com`, password: 'wrong-password-xx' }, { 'X-Forwarded-For': attacker })).status)
  }
  check('per-email limit never fires (addresses all distinct)', codes.slice(0, 20).every((c) => c === 401), codes.slice(0, 20).join(','))
  check('IP cut off after 20 failures', codes[20] === 429, `21st was ${codes[20]}`)
  const bystander = await call('/auth/login', { email: `bystander.${Date.now()}@example.com`, password: 'wrong-password-xx' }, { 'X-Forwarded-For': '198.51.100.9' })
  check('unrelated IP unaffected', bystander.status === 401, bystander.status)
} else {
  console.log('  SKIP  set TRUST_PROXY=1 on the server to exercise the per-IP limit')
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
