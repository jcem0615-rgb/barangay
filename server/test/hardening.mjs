// Regression coverage for the issues found in the pre-deployment security pass.
// Each block fails if the corresponding fix is reverted.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const email = `harden.${Date.now()}@example.com`
const token = (await call('/auth/register', { method: 'POST', body: {
  email, password: 'tamang-lakas-2026', fullName: 'Hardening Test' } })).json.token

console.log('\n== reference numbers survive concurrent submission ==')
// Regression: reference numbers were derived from count(*), which does not
// serialize — 6 of 8 simultaneous submissions used to fail on the unique index.
const burst = await Promise.all(Array.from({ length: 10 }, () =>
  call('/requests', { method: 'POST', token, body: { serviceId: 'cedula', formValues: { purpose: 'Employment' } } })))
const refs = burst.filter(r => r.status === 201).map(r => r.json.referenceNo)
check('all 10 concurrent submissions succeed', burst.every(r => r.status === 201), burst.map(r => r.status).join(','))
check('every reference number is distinct', new Set(refs).size === 10, `${new Set(refs).size} distinct`)
check('references carry the department prefix and year', refs.every(r => /^MTO-\d{4}-\d{5}$/.test(r)), refs[0])

console.log('\n== submitted fields are constrained to the service ==')
// Regression: any key could be attached and would be shown to staff as though
// the resident had filled it in.
const injected = await call('/requests', { method: 'POST', token, body: {
  serviceId: 'cedula', formValues: { purpose: 'Employment', approvedBy: 'Mayor', feeWaived: 'yes' } } })
check('unknown field is rejected', injected.status === 400, injected.status)
check('the error names the offending field', /approvedBy|feeWaived/.test(injected.json?.error ?? ''), injected.json?.error)
const oversized = await call('/requests', { method: 'POST', token, body: {
  serviceId: 'cedula', formValues: { purpose: 'x'.repeat(2001) } } })
check('oversized field value is rejected', oversized.status === 400, oversized.status)
const valid = await call('/requests', { method: 'POST', token, body: {
  serviceId: 'cedula', formValues: { purpose: 'Employment', occupation: 'Store owner' } } })
check('declared fields still accepted', valid.status === 201, JSON.stringify(valid.json))

console.log('\n== tokens are only accepted under the pinned algorithm ==')
// Regression: verify() was called without an algorithms allowlist.
const [h, p] = token.split('.')
const noneToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  + '.' + p + '.'
check('alg:none token is refused', (await call('/requests', { token: noneToken })).status === 401)
check('token with a tampered payload is refused',
  (await call('/requests', { token: `${h}.${Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'admin' })).toString('base64url')}.sig` })).status === 401)
check('garbage token is refused', (await call('/requests', { token: 'not-a-token' })).status === 401)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
