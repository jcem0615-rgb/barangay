// Feedback and complaints — the RA 11032 mechanism. Who may rate what, who may
// see a complaint, the working-day deadline, and the figures it feeds.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const r = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const t = await r.text()
  return { status: r.status, json: t ? JSON.parse(t) : null }
}

const stamp = Date.now()
const register = async (n) => (await j('/auth/register', { method: 'POST', body: {
  email: `fb.${n}.${stamp}@example.com`, password: 'sabihin-mo-2026', fullName: `Feedback ${n} ${stamp}`,
  philSysId: '2233-4455-6677-8899', barangay: 'Poblacion', municipality: 'San Fernando', province: 'Pampanga',
} })).json.token

const resident = await register('a')
const other = await register('b')
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const health = (await j('/auth/login', { method: 'POST', body: { email: 'health@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token

// A real, finished transaction to rate — built from the live catalogue so this
// cannot drift from the service it fills in.
const cat = await (await fetch(`${API}/catalogue`)).json()
const svc = cat.services.find((s) => s.id === 'cedula')
const form = Object.fromEntries(svc.fields.map((f) => [f.id,
  f.type === 'select' ? f.options[0] : f.type === 'number' ? '150000' : f.type === 'date' ? '2026-01-15' : 'Test resident']))
const open = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: form } })).json

console.log('\n== a transaction can only be rated once it is finished ==')
const tooEarly = await j(`/feedback/${open.id}`, { method: 'PUT', token: resident, body: { rating: 5 } })
check('an open request cannot be rated', tooEarly.status === 409, JSON.stringify(tooEarly.json))

await j(`/staff/requests/${open.id}/assess`, { method: 'POST', token: treasury, body: { fee: 230 } })
await j(`/requests/${open.id}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
await j(`/staff/requests/${open.id}/advance`, { method: 'POST', token: treasury })

const rated = await j(`/feedback/${open.id}`, { method: 'PUT', token: resident, body: { rating: 4, comment: `Quick enough ${stamp}` } })
check('a finished one can be rated', rated.status === 200 && rated.json.rating === 4, JSON.stringify(rated.json))
check('the comment is kept', rated.json.comment.includes(`${stamp}`))
check('rating again replaces rather than stacks', (await j(`/feedback/${open.id}`, { method: 'PUT', token: resident, body: { rating: 5 } })).json.rating === 5)
check('and there is still one rating', (await j('/feedback', { token: resident })).json.filter((f) => f.requestId === open.id).length === 1)
check('somebody else’s transaction is not theirs to rate', (await j(`/feedback/${open.id}`, { method: 'PUT', token: other, body: { rating: 1 } })).status === 404)
for (const bad of [0, 6, 2.5, -1]) {
  check(`${bad} is not a rating`, (await j(`/feedback/${open.id}`, { method: 'PUT', token: resident, body: { rating: bad } })).status === 400)
}

console.log('\n== filing a complaint ==')
const filed = await j('/feedback/complaints', { method: 'POST', token: resident, body: {
  departmentId: 'treasury', category: 'delay', body: `Waited three weeks for a cedula ${stamp}`, requestId: open.id,
} })
check('a complaint can be filed', filed.status === 201, JSON.stringify(filed.json))
check('with a reference to chase it by', /^CMP-\d{4}-\d{5}$/.test(filed.json?.referenceNo ?? ''), filed.json?.referenceNo)
check('it starts open', filed.json?.status === 'open')
check('and carries a deadline', /^\d{4}-\d{2}-\d{2}$/.test(filed.json?.dueOn ?? ''), filed.json?.dueOn)
check('the deadline is a working day', ![0, 6].includes(new Date(`${filed.json.dueOn}T00:00:00Z`).getUTCDay()), filed.json?.dueOn)
check('the deadline is not a declared holiday', !cat.holidays.some((h) => h.date === filed.json.dueOn))
check('it is in the resident’s own list', (await j('/feedback/complaints', { token: resident })).json.some((c) => c.id === filed.json.id))
check('references are unique', (await j('/feedback/complaints', { method: 'POST', token: other, body: {
  departmentId: 'treasury', category: 'other', body: `Another complaint entirely ${stamp}` } })).json.referenceNo !== filed.json.referenceNo)

console.log('\n== what will not be accepted ==')
for (const [what, body] of [
  ['a blank complaint', { departmentId: 'treasury', category: 'delay', body: '' }],
  ['a one-word complaint', { departmentId: 'treasury', category: 'delay', body: 'bad' }],
  ['an invented category', { departmentId: 'treasury', category: 'vibes', body: 'A perfectly long complaint body' }],
]) {
  check(`${what} is refused`, (await j('/feedback/complaints', { method: 'POST', token: resident, body })).status === 400)
}
check('an unknown office is a 404', (await j('/feedback/complaints', { method: 'POST', token: resident, body: {
  departmentId: 'nope', category: 'other', body: 'A perfectly long complaint body' } })).status === 404)
check('a complaint cannot be pinned to somebody else’s request', (await j('/feedback/complaints', { method: 'POST', token: other, body: {
  departmentId: 'treasury', category: 'other', body: 'A perfectly long complaint body', requestId: open.id } })).status === 404)

console.log('\n== who sees a complaint ==')
const queue = await j('/staff/complaints', { token: treasury })
check('the office it is against sees it', queue.status === 200 && queue.json.some((c) => c.id === filed.json.id))
check('it names who complained', queue.json.find((c) => c.id === filed.json.id)?.residentName?.includes(`${stamp}`) === true)
check('another office does not', !(await j('/staff/complaints', { token: health })).json.some((c) => c.id === filed.json.id))
check('naming an office you do not serve is refused', (await j('/staff/complaints?departmentId=treasury', { token: health })).status === 403)
check('a resident cannot read the office queue', (await j('/staff/complaints', { token: resident })).status === 403)
check('an admin sees every office', (await j('/staff/complaints', { token: admin })).json.some((c) => c.id === filed.json.id))
// Ordering matters: an office works this list top-down, and an answered
// complaint sitting above an unanswered one wastes the glance.
const ordered = queue.json.map((c) => c.status)
check('open ones come before answered ones',
  ordered.indexOf('answered') === -1 || ordered.lastIndexOf('open') < ordered.indexOf('answered'),
  ordered.join(','))
check('and the oldest open one is first',
  queue.json.filter((c) => c.status === 'open').every((c, i, all) => i === 0 || c.createdAt >= all[i - 1].createdAt))
check('filtering to open works', (await j('/staff/complaints?status=open', { token: treasury })).json.every((c) => c.status === 'open'))

console.log('\n== answering it ==')
check('another office cannot answer it', (await j(`/staff/complaints/${filed.json.id}/respond`, { method: 'POST', token: health, body: { response: 'Not ours' } })).status === 404)
check('a resident cannot answer it', (await j(`/staff/complaints/${filed.json.id}/respond`, { method: 'POST', token: resident, body: { response: 'ok' } })).status === 403)
check('an empty reply is refused', (await j(`/staff/complaints/${filed.json.id}/respond`, { method: 'POST', token: treasury, body: { response: '   ' } })).status === 400)
const answered = await j(`/staff/complaints/${filed.json.id}/respond`, { method: 'POST', token: treasury, body: {
  response: `We were short-staffed that week. Your cedula was released on the 3rd. ${stamp}` } })
check('the office answers it', answered.status === 200 && answered.json.status === 'answered', JSON.stringify(answered.json))
check('the reply is recorded', answered.json.response.includes(`${stamp}`))
check('and cannot be quietly rewritten later', (await j(`/staff/complaints/${filed.json.id}/respond`, { method: 'POST', token: treasury, body: { response: 'Actually, never mind' } })).status === 409)
check('the resident can read the reply', (await j('/feedback/complaints', { token: resident })).json.find((c) => c.id === filed.json.id)?.response?.includes(`${stamp}`) === true)

console.log('\n== the resident is told, both times ==')
const notes = (await j('/notifications', { token: resident })).json.notifications
check('filing is notified', notes.some((n) => n.kind === 'complaint_filed' && n.body.includes(filed.json.referenceNo)))
check('the notice carries the deadline', notes.some((n) => n.kind === 'complaint_filed' && n.body.includes(filed.json.dueOn)))
check('answering is notified', notes.some((n) => n.kind === 'complaint_answered' && n.body.includes(filed.json.referenceNo)))

console.log('\n== the figures reach the report ==')
const today = new Date().toISOString().slice(0, 10)
const report = (await j(`/staff/reports?from=${today}&to=${today}&departmentId=treasury`, { token: treasury })).json
check('ratings are counted', report.ratings >= 1, `${report.ratings}`)
check('with an average', typeof report.averageRating === 'number' && report.averageRating >= 1 && report.averageRating <= 5, `${report.averageRating}`)
check('complaints are counted', report.complaintsFiled >= 1, `${report.complaintsFiled}`)
check('and how many were answered', report.complaintsAnswered >= 1, `${report.complaintsAnswered}`)
check('overdue is a number, not a guess', typeof report.complaintsOverdue === 'number')
const empty = (await j('/staff/reports?from=2019-01-01&to=2019-01-31&departmentId=treasury', { token: treasury })).json
check('a period with no ratings has no average, not a zero', empty.averageRating === null, `${empty.averageRating}`)
check('and no complaints', empty.complaintsFiled === 0)

console.log('\n== signing in is required ==')
for (const [what, path, method] of [
  ['rate', `/feedback/${open.id}`, 'PUT'], ['file', '/feedback/complaints', 'POST'],
  ['list complaints', '/feedback/complaints', 'GET'], ['read the office queue', '/staff/complaints', 'GET'],
]) {
  check(`a stranger cannot ${what}`, (await j(path, { method })).status === 401)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
