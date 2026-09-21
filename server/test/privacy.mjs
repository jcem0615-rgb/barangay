// The Data Privacy Act rights, as things a resident can actually do: see
// everything held about them, correct what is theirs to correct, and close the
// account — with an honest line between what is erased and what the office must
// keep.
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
  let parsed = null
  try { parsed = t ? JSON.parse(t) : null } catch { parsed = t }
  return { status: r.status, json: parsed, headers: r.headers, text: t }
}

const stamp = Date.now()
const make = async (n) => {
  const email = `priv.${n}.${stamp}@example.com`
  const token = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true,
    email, password: 'karapatan-ko-2026', fullName: `Privacy ${n} ${stamp}`,
    philSysId: '1010-2020-3030-4040', barangay: 'Poblacion', municipality: 'Malasiqui', province: 'Pangasinan',
  } })).json.token
  return { email, token }
}

const subject = await make('a')
const other = await make('b')
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token

// Give them a history worth exporting.
const cat = await (await fetch(`${API}/catalogue`)).json()
const svc = cat.services.find((s) => s.id === 'cedula')
const form = Object.fromEntries(svc.fields.map((f) => [f.id,
  f.type === 'select' ? f.options[0] : f.type === 'number' ? '150000' : f.type === 'date' ? '2026-01-15' : `Privacy a ${stamp}`]))
const request = (await j('/requests', { method: 'POST', token: subject.token, body: { serviceId: 'cedula', formValues: form } })).json
await j(`/staff/requests/${request.id}/assess`, { method: 'POST', token: treasury, body: { fee: 230 } })
await j('/requests/drafts/birth-certificate', { method: 'PUT', token: subject.token, body: { formValues: { registrantName: 'Half typed' } } })
await j('/feedback/complaints', { method: 'POST', token: subject.token, body: {
  departmentId: 'treasury', category: 'delay', body: `A complaint worth keeping ${stamp}` } })
const days = (await j('/appointments/days?departmentId=treasury', { token: subject.token })).json
const openDay = days.days.find((d) => d.open && d.date > days.days[0].date)?.date
const slot = (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: subject.token }))
  .json.slots.find((s) => s.available)
if (slot) await j('/appointments', { method: 'POST', token: subject.token, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: slot.startTime } })

console.log('\n== everything held about me, in one file ==')
const exported = await j('/privacy/export', { token: subject.token })
check('a resident can export', exported.status === 200, JSON.stringify(exported.json).slice(0, 120))
check('it downloads as a file', /attachment; filename="elgu-my-data-/.test(exported.headers.get('content-disposition') ?? ''), exported.headers.get('content-disposition'))
check('it says why it exists', (exported.json.about ?? '').includes('10173'))
for (const section of ['account', 'profile', 'requests', 'requestHistory', 'attachments', 'drafts',
                       'appointments', 'complaints', 'feedback', 'notifications', 'programs',
                       'idChecksAtCounters', 'devicesReceivingNotifications']) {
  check(`it includes ${section}`, section in exported.json, Object.keys(exported.json).join(','))
}
check('the request they filed is in it', exported.json.requests.some((r) => r.id === request.id))
check('and its history, not just its state', exported.json.requestHistory.some((e) => e.requestId === request.id))
check('the half-typed draft too', exported.json.drafts.some((d) => d.serviceId === 'birth-certificate'))
check('the complaint too', exported.json.complaints.some((c) => c.body.includes(`${stamp}`)))
check('it holds no password hash', !JSON.stringify(exported.json).includes('password_hash') && !('passwordHash' in exported.json.account))
check('somebody else’s data is not in it', !JSON.stringify(exported.json).includes(`Privacy b ${stamp}`))
check('a stranger cannot export', (await j('/privacy/export')).status === 401)

console.log('\n== correcting what is mine to correct ==')
const fixed = await j('/privacy/profile', { method: 'PATCH', token: subject.token, body: {
  address: `12 Rizal Street, Poblacion ${stamp}`, phone: '0917 123 4567' } })
check('address and phone can be corrected', fixed.status === 200 && fixed.json.address.includes(`${stamp}`), JSON.stringify(fixed.json))
check('a partial correction leaves the rest alone', (await j('/privacy/profile', { method: 'PATCH', token: subject.token, body: { phone: '0918 765 4321' } })).json.address.includes(`${stamp}`))
// A name and a PhilSys number are identity claims an office verified. A portal
// that let someone retype either is not one an office could trust.
const renamed = await j('/privacy/profile', { method: 'PATCH', token: subject.token, body: { philSysId: '9999-9999-9999-9999', fullName: 'Someone Else' } })
check('a PhilSys number cannot be retyped here', renamed.status === 400, `${renamed.status} ${JSON.stringify(renamed.json)}`)
check('and the number is unchanged', (await j('/privacy/export', { token: subject.token })).json.profile.philSysId === '1010-2020-3030-4040')
check('an impossible birth date is refused', (await j('/privacy/profile', { method: 'PATCH', token: subject.token, body: { birthDate: '2026-02-31' } })).status === 400)
check('an empty correction is refused', (await j('/privacy/profile', { method: 'PATCH', token: subject.token, body: {} })).status === 400)

console.log('\n== told what closing would do, before it happens ==')
const preview = await j('/privacy/closure-preview', { token: subject.token })
check('a preview is offered', preview.status === 200)
check('it names what is erased', typeof preview.json.erased.signIn === 'string')
check('and that the photo and contact details go', typeof preview.json.erased.contactDetails === 'string')
check('it names what is kept', typeof preview.json.retained.requests === 'string' && preview.json.retained.requests.includes('public records'))
check('and says why, rather than just refusing', preview.json.retained.requests.includes('law requires'))
check('programme records are named as somebody else’s register', (preview.json.retained.programs ?? preview.json.retained.complaints).length > 0)
check('and it says how to go further', (preview.json.howToGoFurther ?? '').includes('Data Protection Officer'))
check('nothing was deleted by looking', (await j('/privacy/export', { token: subject.token })).json.drafts.length === 1)

console.log('\n== closing the account ==')
const closed = await j('/privacy/close', { method: 'POST', token: subject.token, body: { reason: `Moving away ${stamp}` } })
check('it closes', closed.status === 200 && typeof closed.json.closedAt === 'string', JSON.stringify(closed.json).slice(0, 140))
check('and reports what it did', typeof closed.json.erased === 'object' && typeof closed.json.retained === 'object')
check('the session is dead immediately', (await j('/requests', { token: subject.token })).status === 401)
check('and the password no longer signs in', (await j('/auth/login', { method: 'POST', body: { email: subject.email, password: 'karapatan-ko-2026' } })).status >= 400)
check('the email is released for a fresh registration', (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true,
  email: subject.email, password: 'bagong-simula-2026', fullName: 'Someone New',
  philSysId: '5050-6060-7070-8080', barangay: 'Poblacion', municipality: 'Malasiqui', province: 'Pangasinan' } })).status === 201)
check('closing twice is refused', (await j('/privacy/close', { method: 'POST', token: subject.token })).status === 401)

console.log('\n== what really went, and what really stayed ==')
const staff = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token
const stillThere = await j(`/staff/requests/${request.id}`, { token: staff })
check('the request survives, because it is the office’s record', stillThere.status === 200, `${stillThere.status}`)
check('with the applicant still on it', (stillThere.json.residentName ?? '').includes(`${stamp}`), stillThere.json.residentName)
const complaint = (await j('/staff/complaints', { token: staff })).json.find((c) => c.body.includes(`${stamp}`))
check('the complaint survives too', !!complaint)
const dayNow = (await j(`/staff/appointments?date=${openDay}&departmentId=treasury`, { token: staff })).json.appointments
check('but the upcoming appointment was cancelled, freeing the slot',
  !slot || !dayNow.some((a) => a.residentName?.includes(`${stamp}`) && a.status === 'booked'),
  JSON.stringify(dayNow.filter((a) => a.residentName?.includes(`${stamp}`)).map((a) => a.status)))

console.log('\n== only the resident, only their own ==')
check('a stranger cannot preview a closure', (await j('/privacy/closure-preview')).status === 401)
check('a stranger cannot close an account', (await j('/privacy/close', { method: 'POST' })).status === 401)
check('staff have no route into any of this', (await j('/privacy/export', { token: staff })).status === 403)
check('the other resident is untouched', (await j('/privacy/export', { token: other.token })).status === 200)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
