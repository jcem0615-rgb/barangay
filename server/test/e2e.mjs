const API = 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`) }
}
async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

console.log('\n== catalogue (public) ==')
const cat = await call('/catalogue')
check('catalogue returns 6 offices', cat.json?.departments?.length === 6, JSON.stringify(cat.json?.departments?.length))
check('catalogue returns 17 services', cat.json?.services?.length === 17)
check('workflow has 4 steps', cat.json?.workflowSteps?.length === 4)

console.log('\n== resident registration + login ==')
const email = `maria.${Date.now()}@example.com`
const reg = await call('/auth/register', { method: 'POST', body: {
  email, password: 'tamang-lakas-2026', fullName: 'Maria Clara D. Santos',
  barangay: 'Barangay San Isidro', municipality: 'Municipality of San Fernando', province: 'Cebu' } })
check('register returns 201', reg.status === 201, reg.status)
check('register issues a token', typeof reg.json?.token === 'string')
check('self-registration is always a resident', reg.json?.user?.role === 'resident')
const resident = reg.json.token

check('weak password rejected', (await call('/auth/register', { method: 'POST',
  body: { email: `x.${Date.now()}@e.com`, password: 'short', fullName: 'X Y' } })).status === 400)
check('duplicate email rejected', (await call('/auth/register', { method: 'POST',
  body: { email, password: 'tamang-lakas-2026', fullName: 'Impostor' } })).status === 409)
check('wrong password rejected', (await call('/auth/login', { method: 'POST',
  body: { email, password: 'wrong-password-here' } })).status === 401)
const unknown = await call('/auth/login', { method: 'POST', body: { email: 'nobody@nowhere.ph', password: 'whatever123' } })
check('unknown email gives same message as wrong password', unknown.json?.error === 'Email or password is incorrect.', unknown.json?.error)

console.log('\n== resident submits a request ==')
const submit = await call('/requests', { method: 'POST', token: resident,
  body: { serviceId: 'building-permit', formValues: { workType: 'New Construction', floorArea: '84' } } })
check('submit returns 201', submit.status === 201, JSON.stringify(submit.json))
const reqId = submit.json?.id
check('reference number is OBO-prefixed', /^OBO-\d{4}-\d{5}$/.test(submit.json?.referenceNo ?? ''), submit.json?.referenceNo)
check('routed to the obo department', submit.json?.categoryId === 'obo', submit.json?.categoryId)
check('starts at step 0', submit.json?.currentStepIndex === 0)
check('fee copied from catalogue (1500)', submit.json?.fee === 1500, submit.json?.fee)
check('anonymous cannot submit', (await call('/requests', { method: 'POST', body: { serviceId: 'cedula' } })).status === 401)

console.log('\n== department isolation ==')
const oboTok = (await call('/auth/login', { method: 'POST', body: { email: 'obo@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const lcrTok = (await call('/auth/login', { method: 'POST', body: { email: 'lcr@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const oboQueue = await call('/staff/queue', { token: oboTok })
check('OBO staff sees the request in its queue', oboQueue.json?.some((r) => r.id === reqId), JSON.stringify(oboQueue.json?.length))
check('queue shows the resident name', oboQueue.json?.[0]?.residentName === 'Maria Clara D. Santos')
const lcrQueue = await call('/staff/queue', { token: lcrTok })
check('LCR staff does NOT see the OBO request', !lcrQueue.json?.some((r) => r.id === reqId))
check('LCR staff cannot open the OBO request', (await call(`/staff/requests/${reqId}`, { token: lcrTok })).status === 404)
check('LCR staff cannot assess the OBO request', (await call(`/staff/requests/${reqId}/assess`, { method: 'POST', token: lcrTok, body: { fee: 1 } })).status === 404)
check('LCR staff cannot request another office queue', (await call('/staff/queue?departmentId=obo', { token: lcrTok })).status === 403)
check('resident cannot reach the staff queue', (await call('/staff/queue', { token: resident })).status === 403)
check('staff cannot use the resident endpoint', (await call('/requests', { token: oboTok })).status === 403)

console.log('\n== workflow, driven by the office ==')
check('cannot pay before assessment', (await call(`/requests/${reqId}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })).status === 409)
const assessed = await call(`/staff/requests/${reqId}/assess`, { method: 'POST', token: oboTok, body: { fee: 1850.5, note: 'Includes zoning fee' } })
check('assess sets fee exactly (1850.50)', assessed.json?.fee === 1850.5, assessed.json?.fee)
check('assess moves to for_payment', assessed.json?.status === 'for_payment')
check('assess sits on the Payment step', assessed.json?.currentStepIndex === 2)
check('office cannot advance past unpaid payment', (await call(`/staff/requests/${reqId}/advance`, { method: 'POST', token: oboTok })).status === 409)
const paid = await call(`/requests/${reqId}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
check('resident pays', paid.json?.paid === true)
check('payment advances to release step', paid.json?.currentStepIndex === 3)
check('double payment rejected', (await call(`/requests/${reqId}/pay`, { method: 'POST', token: resident, body: { method: 'Maya' } })).status === 409)

console.log('\n== resident sees the office\'s work ==')
const mine = await call(`/requests/${reqId}`, { token: resident })
check('resident sees updated fee', mine.json?.fee === 1850.5)
check('audit trail recorded every actor', mine.json?.events?.length >= 3, JSON.stringify(mine.json?.events?.map(e => e.eventType)))
check('events include assessed + paid', ['assessed','paid'].every(t => mine.json?.events?.some(e => e.eventType === t)))

console.log('\n== another resident cannot read it ==')
const other = (await call('/auth/register', { method: 'POST', body: { email: `juan.${Date.now()}@example.com`, password: 'ibang-tao-2026', fullName: 'Juan Cruz' } })).json.token
check('other resident gets 404 on the request', (await call(`/requests/${reqId}`, { token: other })).status === 404)
check('other resident list is empty', (await call('/requests', { token: other })).json?.length === 0)

console.log('\n== rejection path ==')
const cedula = await call('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: { purpose: 'Employment' } } })
const mtoTok = (await call('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
check('empty rejection reason refused', (await call(`/staff/requests/${cedula.json.id}/reject`, { method: 'POST', token: mtoTok, body: { reason: '' } })).status === 400)
const rejected = await call(`/staff/requests/${cedula.json.id}/reject`, { method: 'POST', token: mtoTok, body: { reason: 'Declared income does not match submitted payslip.' } })
check('treasury rejects its own request', rejected.json?.status === 'rejected', JSON.stringify(rejected.json))
check('rejection reason reaches the resident', (await call(`/requests/${cedula.json.id}`, { token: resident })).json?.rejectionReason?.includes('payslip'))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
