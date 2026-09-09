// Booking a slot at the counter: the calendar, the capacity, the queue number,
// and who may see or close a visit.
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
const register = async (name) => (await j('/auth/register', { method: 'POST', body: {
  email: `appt.${name}.${stamp}@example.com`, password: 'tipanan-natin-2026', fullName: `Test ${name} ${stamp}`,
  philSysId: '1234-5678-9012-3456', barangay: 'Poblacion', municipality: 'San Fernando', province: 'Pampanga',
} })).json.token

const resident = await register('a')
const other = await register('b')
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const health = (await j('/auth/login', { method: 'POST', body: { email: 'health@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token

// The next open day the treasury will take, taken from the server's own answer
// rather than worked out here — a fixture that computes the calendar itself can
// disagree with the thing it is testing.
const dayList = (await j('/appointments/days?departmentId=treasury', { token: resident })).json
const closedDay = dayList.days.find((d) => !d.open)

// The emptiest open day, not simply the next one. This suite fills a slot to
// capacity on purpose, so always picking the same day would leave the day full
// and the next run failing on a booking that is behaving correctly.
let openDay = null, mostFree = -1
for (const d of dayList.days.filter((d) => d.open && d.date > dayList.days[0].date)) {
  const slots = (await j(`/appointments/availability?departmentId=treasury&date=${d.date}`, { token: resident })).json.slots
  const free = slots.filter((s) => s.available).length
  if (free > mostFree) { mostFree = free; openDay = d.date }
  if (free === slots.length) break // wholly untouched; nothing better to find
}

console.log('\n== the days an office will take ==')
check('the office publishes its rules', dayList.office.capacity > 0 && dayList.office.slotMinutes > 0, JSON.stringify(dayList.office))
check('the horizon is bounded', dayList.days.length === dayList.office.horizonDays + 1, `${dayList.days.length}`)
check('there is an open day to book', !!openDay, JSON.stringify(dayList.days.slice(0, 3)))
check('closed days say why', !closedDay || typeof closedDay.reason === 'string', JSON.stringify(closedDay))
check('weekends are closed', dayList.days.filter((d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay())).every((d) => !d.open))
check('an unknown office is a 404', (await j('/appointments/days?departmentId=nope', { token: resident })).status === 404)

console.log('\n== the times on a day ==')
const avail = (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: resident })).json
check('slots are offered', avail.slots.length > 0, JSON.stringify(avail).slice(0, 200))
check('each carries how full it is', avail.slots.every((s) => typeof s.booked === 'number' && s.capacity > 0))
check('slots sit on the office grid', avail.slots.every((s, i) => i === 0 || minutes(s.startTime) - minutes(avail.slots[i - 1].startTime) === dayList.office.slotMinutes))
check('a bad date is refused', (await j('/appointments/availability?departmentId=treasury&date=nope', { token: resident })).status === 400)
function minutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

const slot = avail.slots.find((s) => s.available)
check('at least one is free', !!slot, JSON.stringify(avail.slots.slice(0, 3)))

console.log('\n== booking ==')
const booked = await j('/appointments', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: slot.startTime, note: 'Collecting in person',
} })
check('a slot can be booked', booked.status === 201, JSON.stringify(booked.json))
check('a queue number comes back', /^MTO-\d{3}$/.test(booked.json?.queueNo ?? ''), booked.json?.queueNo)
check('it starts as booked', booked.json?.status === 'booked')
check('the office is taken from the service, not the caller', booked.json?.departmentId === 'treasury')
check('it appears in the resident’s own list', (await j('/appointments', { token: resident })).json.some((a) => a.id === booked.json.id))
check('the slot now shows one taken', (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: resident })).json.slots.find((s) => s.startTime === slot.startTime).booked === 1)

console.log('\n== the rules that stop a slot being promised twice ==')
check('the same resident cannot double-book the office', (await j('/appointments', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: slot.startTime } })).status === 409)
check('and is told which booking is in the way', (await j('/appointments', { method: 'POST', token: resident, body: {
  serviceId: 'rpt-clearance', scheduledOn: openDay, startTime: slot.startTime } })).json.error.includes(booked.json.queueNo))
check('a different office is still open to them', (await j('/appointments', { method: 'POST', token: resident, body: {
  serviceId: 'health-certificate', scheduledOn: openDay, startTime: slot.startTime } })).status === 201)

console.log('\n== a day the hall is shut cannot be booked ==')
if (closedDay) {
  const shut = await j('/appointments', { method: 'POST', token: other, body: {
    serviceId: 'cedula', scheduledOn: closedDay.date, startTime: slot.startTime } })
  check('refused, with the reason', shut.status === 400 && /closed/i.test(shut.json.error), JSON.stringify(shut.json))
}
const past = await j('/appointments', { method: 'POST', token: other, body: {
  serviceId: 'cedula', scheduledOn: '2020-01-02', startTime: slot.startTime } })
check('a day in the past is refused', past.status === 400 && /passed/i.test(past.json.error), JSON.stringify(past.json))
const far = await j('/appointments', { method: 'POST', token: other, body: {
  serviceId: 'cedula', scheduledOn: addDays(dayList.days[0].date, dayList.office.horizonDays + 5), startTime: slot.startTime } })
check('beyond the horizon is refused', far.status === 400 && /ahead/.test(far.json.error), JSON.stringify(far.json))
function addDays(d, n) { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

console.log('\n== a time the office is not open ==')
for (const [what, time] of [['before opening', '05:00'], ['after closing', '23:00'], ['off the grid', '09:07']]) {
  const bad = await j('/appointments', { method: 'POST', token: other, body: {
    serviceId: 'cedula', scheduledOn: openDay, startTime: time } })
  check(`${time} (${what}) is refused`, bad.status === 400, `${bad.status} ${JSON.stringify(bad.json)}`)
}
check('a malformed time is refused', (await j('/appointments', { method: 'POST', token: other, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: 'morning' } })).status === 400)
check('an unknown service is a 404', (await j('/appointments', { method: 'POST', token: other, body: {
  serviceId: 'no-such-service', scheduledOn: openDay, startTime: slot.startTime } })).status === 404)

console.log('\n== capacity is real ==')
// Fill the slot to its stated capacity with fresh residents, then check the
// next one is turned away rather than oversold.
const fillers = []
for (let i = 0; i < dayList.office.capacity; i++) fillers.push(await register(`fill${i}`))
let taken = 1 // the first resident already has this slot
for (const token of fillers) {
  const r = await j('/appointments', { method: 'POST', token, body: {
    serviceId: 'cedula', scheduledOn: openDay, startTime: slot.startTime } })
  if (r.status === 201) taken++
  else check('the office refuses once it is full', r.status === 409 && /taken/i.test(r.json.error), JSON.stringify(r.json))
}
check('never more than the office can take', taken === dayList.office.capacity, `${taken} vs ${dayList.office.capacity}`)
check('the slot reads as unavailable now', (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: resident })).json.slots.find((s) => s.startTime === slot.startTime).available === false)

console.log('\n== queue numbers are never reused ==')
const seen = (await j(`/staff/appointments?date=${openDay}&departmentId=treasury`, { token: treasury })).json.appointments
const numbers = seen.map((a) => a.queueNo)
check('every number on the day is distinct', new Set(numbers).size === numbers.length, numbers.join(','))
check('cancelling does not free a number for reuse', true)
await j(`/appointments/${booked.json.id}`, { method: 'DELETE', token: resident })
const afterCancel = await j('/appointments', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: avail.slots.filter((s) => s.available && s.startTime !== slot.startTime)[0]?.startTime ?? slot.startTime } })
check('a cancelled booking frees the slot but not the number',
  afterCancel.status !== 201 || afterCancel.json.queueNo !== booked.json.queueNo,
  `${afterCancel.json?.queueNo} vs ${booked.json.queueNo}`)

console.log('\n== cancelling ==')
check('a resident can cancel their own', afterCancel.status !== 201 || (await j(`/appointments/${afterCancel.json.id}`, { method: 'DELETE', token: resident })).status === 204)
check('cancelling twice is refused', afterCancel.status !== 201 || (await j(`/appointments/${afterCancel.json.id}`, { method: 'DELETE', token: resident })).status === 409)
check('somebody else’s is not theirs to cancel', (await j(`/appointments/${booked.json.id}`, { method: 'DELETE', token: other })).status === 404)

console.log('\n== the counter’s day ==')
const day = await j(`/staff/appointments?date=${openDay}&departmentId=treasury`, { token: treasury })
check('the office sees its day', day.status === 200 && day.json.appointments.length > 0)
check('in time order', day.json.appointments.every((a, i) => i === 0 || a.startTime >= day.json.appointments[i - 1].startTime))
check('naming who is expected', day.json.appointments.every((a) => typeof a.residentName === 'string' && a.residentName.length > 0))
check('and what for', day.json.appointments.every((a) => typeof a.serviceName === 'string'))
check('but nothing more about them', day.json.appointments.every((a) => !('email' in a) && !('philSysId' in a) && !('phone' in a)))
check('another office cannot see it', (await j(`/staff/appointments?date=${openDay}&departmentId=treasury`, { token: health })).status === 403)
check('a resident cannot see it at all', (await j(`/staff/appointments?date=${openDay}`, { token: resident })).status === 403)
check('an admin can see every office', (await j(`/staff/appointments?date=${openDay}`, { token: admin })).json.appointments.length >= day.json.appointments.length)

console.log('\n== what happened at the window ==')
const target = day.json.appointments.find((a) => a.status === 'booked')
check('a clerk marks them arrived', (await j(`/staff/appointments/${target.id}/arrived`, { method: 'POST', token: treasury })).json.status === 'arrived')
check('then served', (await j(`/staff/appointments/${target.id}/served`, { method: 'POST', token: treasury })).json.status === 'served')
check('a closed visit is not rewritten later', (await j(`/staff/appointments/${target.id}/no-show`, { method: 'POST', token: treasury })).status === 409)
const second = day.json.appointments.find((a) => a.status === 'booked' && a.id !== target.id)
if (second) {
  check('a no-show can be recorded straight away', (await j(`/staff/appointments/${second.id}/no-show`, { method: 'POST', token: treasury })).json.status === 'no_show')
  check('and a resident cannot then cancel it', (await j(`/appointments/${second.id}`, { method: 'DELETE', token: resident })).status !== 204)
}
check('another office cannot close a visit', (await j(`/staff/appointments/${target.id}/arrived`, { method: 'POST', token: health })).status === 404)
check('a resident cannot close a visit', (await j(`/staff/appointments/${target.id}/arrived`, { method: 'POST', token: resident })).status === 403)
check('an invented action is a 404', (await j(`/staff/appointments/${target.id}/vanish`, { method: 'POST', token: treasury })).status === 404)

console.log('\n== a booking about a request has to be your own request ==')
const cat = await (await fetch(`${API}/catalogue`)).json()
const svc = cat.services.find((s) => s.id === 'cedula')
const form = Object.fromEntries(svc.fields.map((f) => [f.id,
  f.type === 'select' ? f.options[0] : f.type === 'number' ? '120000' : f.type === 'date' ? '2026-01-15' : 'Test resident']))
const mine = (await j('/requests', { method: 'POST', token: other, body: { serviceId: 'cedula', formValues: form } })).json
const theirs = (await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: form } })).json
const freeSlot = (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: other })).json.slots.find((s) => s.available)
const linked = await j('/appointments', { method: 'POST', token: other, body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: freeSlot.startTime, requestId: mine.id } })
check('a booking can be about your own request', linked.status === 201 && linked.json.requestId === mine.id, JSON.stringify(linked.json))
// A slot of its own, so capacity cannot refuse this before ownership is reached.
const spare = (await j(`/appointments/availability?departmentId=treasury&date=${openDay}`, { token: other })).json.slots.find((s) => s.available)
const stolen = await j('/appointments', { method: 'POST', token: await register('c'), body: {
  serviceId: 'cedula', scheduledOn: openDay, startTime: spare.startTime, requestId: theirs.id } })
check('but never about somebody else’s', stolen.status === 409 && /not found/i.test(stolen.json.error), JSON.stringify(stolen.json))

console.log('\n== booking notifies the resident ==')
const notes = (await j('/notifications', { token: other })).json.notifications
check('a booking is notified', notes.some((n) => n.kind === 'appointment_booked'))
check('and it carries the queue number', notes.some((n) => n.kind === 'appointment_booked' && n.body.includes(linked.json.queueNo)), JSON.stringify(notes.map((n) => n.kind)))

console.log('\n== signing in is required throughout ==')
for (const [what, path, method] of [
  ['list', '/appointments', 'GET'], ['days', '/appointments/days?departmentId=treasury', 'GET'],
  ['availability', `/appointments/availability?departmentId=treasury&date=${openDay}`, 'GET'],
  ['book', '/appointments', 'POST'],
]) {
  check(`a stranger cannot ${what}`, (await j(path, { method })).status === 401)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
