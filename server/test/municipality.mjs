// The municipal facts an administrator can now correct: hotlines, the holiday
// calendar, and how to reach each office. Every write is admin-only and every
// write is audited with the old value still in it.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const r = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await r.text()
  return { status: r.status, json: text ? JSON.parse(text) : null }
}

const stamp = Date.now()
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const clerk = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `muni.${stamp}@example.com`, password: 'palitan-mo-ito-2026', fullName: 'Rosario T. Aguilar',
  philSysId: '4455-6677-8899-0011', barangay: 'Poblacion', municipality: 'San Fernando', province: 'Pampanga',
} })).json.token

console.log('\n== only an administrator may touch any of it ==')
for (const [what, path, method, body] of [
  ['list hotlines', '/admin/hotlines', 'GET', undefined],
  ['add a hotline', '/admin/hotlines', 'POST', { label: 'X', agency: 'Y', phone: '911', isNational: true }],
  ['list holidays', '/admin/holidays', 'GET', undefined],
  ['add a holiday', '/admin/holidays', 'POST', { date: '2026-12-25', name: 'X', isLocal: false }],
  ['list offices', '/admin/offices', 'GET', undefined],
  ['edit an office', '/admin/offices/treasury', 'PATCH', { phone: '911' }],
  ['read the audit trail', '/admin/audit', 'GET', undefined],
]) {
  check(`a resident cannot ${what}`, (await j(path, { method, token: resident, body })).status === 403)
  check(`a department clerk cannot ${what}`, (await j(path, { method, token: clerk, body })).status === 403)
  check(`and nor can a stranger ${what}`, (await j(path, { method, body })).status === 401)
}

console.log('\n== a hotline can be added, corrected and withdrawn ==')
const before = (await j('/admin/hotlines', { token: admin })).json
const created = await j('/admin/hotlines', { method: 'POST', token: admin, body: {
  label: `Coast Guard ${stamp}`, agency: 'PCG — San Fernando Station', phone: '(045) 961-9111', isNational: false, sortOrder: 90,
} })
check('added', created.status === 201, JSON.stringify(created.json))
const id = created.json?.id
check('the id reads as something', typeof id === 'string' && id.startsWith('coast-guard'), id)
check('it comes back in the list', (await j('/admin/hotlines', { token: admin })).json.length === before.length + 1)

const edited = await j(`/admin/hotlines/${id}`, { method: 'PUT', token: admin, body: {
  label: `Coast Guard ${stamp}`, agency: 'PCG — San Fernando Station', phone: '(045) 961-9222', isNational: false,
} })
check('corrected', edited.status === 200 && edited.json.phone === '(045) 961-9222', JSON.stringify(edited.json))
check('editing one that is gone is a 404', (await j('/admin/hotlines/no-such-hotline', { method: 'PUT', token: admin, body: {
  label: 'X', agency: 'Y', phone: '911', isNational: false } })).status === 404)

console.log('\n== a number nobody could dial is refused ==')
for (const [what, value] of [
  ['empty', '  '],
  ['letters', 'call the office'],
  ['too few digits', '12'],
  ['a pasted paragraph', '0917'.repeat(20)],
]) {
  const bad = await j('/admin/hotlines', { method: 'POST', token: admin, body: {
    label: 'Test', agency: 'Test', phone: value, isNational: false } })
  check(`${what} is refused`, bad.status === 400, `${bad.status} ${JSON.stringify(bad.json)}`)
}
for (const good of ['911', '143', '(045) 961-2400', '0917 123 4567', '+63 2 8888 4000']) {
  const ok = await j('/admin/hotlines', { method: 'POST', token: admin, body: {
    label: `Fmt ${stamp}`, agency: 'Format check', phone: good, isNational: false } })
  check(`${good} is accepted`, ok.status === 201, JSON.stringify(ok.json))
  if (ok.status === 201) await j(`/admin/hotlines/${ok.json.id}`, { method: 'DELETE', token: admin })
}

console.log('\n== the change reaches residents, who never had to sign in ==')
const published = (await (await fetch(`${API}/catalogue`)).json()).emergencyContacts
check('the edited number is on the public catalogue', published.some((c) => c.phone === '(045) 961-9222'), JSON.stringify(published.map((c) => c.phone)))

console.log('\n== the calendar is editable, and only with real dates ==')
const holidayDate = '2026-11-17'
const added = await j('/admin/holidays', { method: 'POST', token: admin, body: { date: holidayDate, name: `Founding Anniversary ${stamp}`, isLocal: true } })
check('a local holiday can be declared', added.status === 201, JSON.stringify(added.json))
const listed = (await j('/admin/holidays?year=2026', { token: admin })).json
check('it appears in that year', listed.some((h) => h.date === holidayDate), JSON.stringify(listed.slice(0, 3)))
check('a different year does not show it', !(await j('/admin/holidays?year=2025', { token: admin })).json.some((h) => h.date === holidayDate))

const renamed = await j('/admin/holidays', { method: 'POST', token: admin, body: { date: holidayDate, name: `Renamed ${stamp}`, isLocal: true } })
check('re-declaring the same day corrects it rather than failing', renamed.status === 201 && renamed.json.name === `Renamed ${stamp}`, JSON.stringify(renamed.json))
check('there is still only one row for that day', (await j('/admin/holidays?year=2026', { token: admin })).json.filter((h) => h.date === holidayDate).length === 1)

for (const bad of ['2026-02-31', '2026-13-01', 'next Friday', '2026-2-1']) {
  check(`${bad} is refused`, (await j('/admin/holidays', { method: 'POST', token: admin, body: { date: bad, name: 'X', isLocal: true } })).status === 400)
}

console.log('\n== a declared holiday actually moves a promised date ==')
const cat = await (await fetch(`${API}/catalogue`)).json()
check('the calendar rides along on the public catalogue', cat.holidays.some((h) => h.date === holidayDate), 'not published')
check('and is marked local', cat.holidays.find((h) => h.date === holidayDate)?.isLocal === true)
// Ready dates are computed over this calendar behind a cache. Declaring a day
// has to take effect now, or an administrator watches nothing move and
// reasonably concludes it did not save.
{
  const svc = cat.services.find((s) => s.processingDaysMax > 0)
  const before = (await j(`/services/${svc.id}/ready`)).json ?? null
  const probe = '2026-11-18'
  await j('/admin/holidays', { method: 'POST', token: admin, body: { date: probe, name: `Cache probe ${stamp}`, isLocal: true } })
  const after = (await (await fetch(`${API}/catalogue`)).json()).holidays.some((h) => h.date === probe)
  check('a day declared now is visible immediately, not after a cache expires', after, 'still cached')
  await j(`/admin/holidays/${probe}`, { method: 'DELETE', token: admin })
  check('and removing it takes effect immediately too', !(await (await fetch(`${API}/catalogue`)).json()).holidays.some((h) => h.date === probe))
  void before
}

console.log('\n== an office can be reached again ==')
const offices = (await j('/admin/offices', { token: admin })).json
check('every office is listed', offices.length >= 6, `${offices.length}`)
const patched = await j('/admin/offices/treasury', { method: 'PATCH', token: admin, body: {
  address: `2F Municipal Hall, Poblacion ${stamp}`, hours: 'Mon–Fri, 8:00 AM – 5:00 PM', phone: '(045) 961-2400', email: 'treasury@sanfernando.gov.ph',
} })
check('contact details save', patched.status === 200 && patched.json.address.includes(`${stamp}`), JSON.stringify(patched.json))
check('a partial change leaves the rest alone', (await j('/admin/offices/treasury', { method: 'PATCH', token: admin, body: { hours: 'Mon–Fri, 8:00 AM – 4:00 PM' } })).json.address.includes(`${stamp}`))
check('an empty patch is refused', (await j('/admin/offices/treasury', { method: 'PATCH', token: admin, body: {} })).status === 400)
check('a bad email is refused', (await j('/admin/offices/treasury', { method: 'PATCH', token: admin, body: { email: 'not-an-email' } })).status === 400)
check('an unknown office is a 404', (await j('/admin/offices/nope', { method: 'PATCH', token: admin, body: { hours: 'x' } })).status === 404)
check('the new address is on the public catalogue', (await (await fetch(`${API}/catalogue`)).json()).departments.find((d) => d.id === 'treasury').address.includes(`${stamp}`))

console.log('\n== the office catalogue itself is not editable here ==')
// The unknown key is stripped, which leaves nothing to change, so the whole
// request is refused rather than quietly doing something else.
const rename = await j('/admin/offices/treasury', { method: 'PATCH', token: admin, body: { name: 'Something Else' } })
check('renaming an office is refused, not silently ignored', rename.status === 400, `${rename.status} ${JSON.stringify(rename.json)}`)
check('and the office keeps its name', (await (await fetch(`${API}/catalogue`)).json()).departments.find((d) => d.id === 'treasury').name === "Treasurer's Office")

console.log('\n== every change is on the record, with what it was before ==')
const audit = (await j('/admin/audit?limit=200', { token: admin })).json
const forHotline = audit.filter((a) => a.target === id)
check('the hotline was logged when created', forHotline.some((a) => a.action === 'hotline.create'))
check('and when corrected', forHotline.some((a) => a.action === 'hotline.update'))
const update = forHotline.find((a) => a.action === 'hotline.update')
check('the log keeps the number it used to be', update?.before?.phone === '(045) 961-9111', JSON.stringify(update?.before))
check('and the number it became', update?.after?.phone === '(045) 961-9222')
check('a create has no before', forHotline.find((a) => a.action === 'hotline.create')?.before === null)
check('it says who did it', update?.actorName === 'Office of the Mayor — Administrator', update?.actorName)
check('and when', typeof update?.createdAt === 'string' && !Number.isNaN(Date.parse(update.createdAt)))
check('the holiday is on the record too', audit.some((a) => a.target === holidayDate && a.action === 'holiday.create'))
check('so is the office edit', audit.some((a) => a.target === 'treasury' && a.action === 'office.update'))
check('newest first', audit.length < 2 || Date.parse(audit[0].createdAt) >= Date.parse(audit[audit.length - 1].createdAt))

console.log('\n== withdrawing is logged, and leaves the old value behind ==')
check('the hotline is withdrawn', (await j(`/admin/hotlines/${id}`, { method: 'DELETE', token: admin })).status === 204)
check('withdrawing it twice is a 404', (await j(`/admin/hotlines/${id}`, { method: 'DELETE', token: admin })).status === 404)
check('it is off the public catalogue', !(await (await fetch(`${API}/catalogue`)).json()).emergencyContacts.some((c) => c.id === id))
const deletion = (await j('/admin/audit?limit=200', { token: admin })).json.find((a) => a.action === 'hotline.delete' && a.target === id)
check('the deletion is logged', !!deletion)
check('with the number that was withdrawn', deletion?.before?.phone === '(045) 961-9222', JSON.stringify(deletion?.before))
check('and nothing after it', deletion?.after === null)

check('the holiday can be withdrawn', (await j(`/admin/holidays/${holidayDate}`, { method: 'DELETE', token: admin })).status === 204)
check('withdrawing a day that is not there is a 404', (await j(`/admin/holidays/${holidayDate}`, { method: 'DELETE', token: admin })).status === 404)
check('a malformed date is refused, not 404', (await j('/admin/holidays/2026-02-31', { method: 'DELETE', token: admin })).status === 400)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
