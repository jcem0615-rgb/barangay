// Resident-supplied requirement files, and the rules around them.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
import { formFiller } from './fixtures.mjs'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
async function j(p, o = {}) {
  const res = await fetch(API + p, { method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null) }
}
async function put(path, token, bytes, name, requirement) {
  const form = new FormData()
  form.append('file', new Blob([bytes]), name)
  if (requirement) form.append('requirement', requirement)
  const res = await fetch(API + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const formFor = await formFiller(API)

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600, 0x20), Buffer.from('\n%%EOF')])
const PNG = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(400, 1)])

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `att.${Date.now()}@example.com`, password: 'tamang-lakas-2026', fullName: 'Pedro Ramos' } })).json.token
const mto = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const lcr = (await j('/auth/login', { method: 'POST', body: { email: 'lcr@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const id = (await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })).json.id

console.log('\n== attaching a requirement ==')
const up = await put(`/requests/${id}/attachments`, resident, PDF, 'my id.pdf', 'Valid government ID')
check('upload accepted', up.status === 201, JSON.stringify(up.json))
check('filed under the requirement', up.json?.requirement === 'Valid government ID')
check('type taken from the bytes', up.json?.contentType === 'application/pdf')
const attId = up.json?.id
check('listed on the request', (await j(`/requests/${id}/attachments`, { token: resident })).json?.length === 1)

console.log('\n== the office can see and open it ==')
const staffList = await j(`/staff/requests/${id}/attachments`, { token: mto })
check('issuing office sees the attachment', staffList.json?.length === 1, JSON.stringify(staffList.json))
const dl = await fetch(`${API}/staff/requests/${id}/attachments/${attId}`, { headers: { Authorization: `Bearer ${mto}` } })
check('office can download it', dl.status === 200)
check('served as an attachment, never inline', /^attachment;/.test(dl.headers.get('content-disposition') ?? ''), dl.headers.get('content-disposition'))
check('nosniff is set', dl.headers.get('x-content-type-options') === 'nosniff')
check('bytes come back intact', Buffer.from(await dl.arrayBuffer()).equals(PDF))

console.log('\n== the bytes decide the type, not the caller ==')
const disguised = await put(`/requests/${id}/attachments`, resident, Buffer.from('<script>alert(1)</script>'), 'evil.pdf')
check('HTML renamed .pdf is refused', disguised.status === 415, `${disguised.status} ${JSON.stringify(disguised.json)}`)
const svg = await put(`/requests/${id}/attachments`, resident, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.png')
check('SVG renamed .png is refused', svg.status === 415, svg.status)
const png = await put(`/requests/${id}/attachments`, resident, PNG, 'photo.heic')
check('a real PNG is accepted whatever it is named', png.status === 201 && png.json.contentType === 'image/png', JSON.stringify(png.json))
check('stored name uses the detected extension', png.json?.fileName?.endsWith('.png'), png.json?.fileName)

console.log('\n== filenames cannot escape ==')
const nasty = await put(`/requests/${id}/attachments`, resident, PDF, '../../../etc/passwd.pdf')
check('path segments stripped from the name', nasty.status === 201 && !nasty.json.fileName.includes('/'), nasty.json?.fileName)

console.log('\n== only the right people reach it ==')
const other = (await j('/auth/register', { method: 'POST', body: { email: `o.${Date.now()}@example.com`, password: 'ibang-tao-2026', fullName: 'Ana Lopez' } })).json.token
check('another resident cannot list', (await j(`/requests/${id}/attachments`, { token: other })).status === 404)
check('another resident cannot download', (await fetch(`${API}/requests/${id}/attachments/${attId}`, { headers: { Authorization: `Bearer ${other}` } })).status === 404)
check('another department cannot list', (await j(`/staff/requests/${id}/attachments`, { token: lcr })).status === 404)
check('another department cannot download', (await fetch(`${API}/staff/requests/${id}/attachments/${attId}`, { headers: { Authorization: `Bearer ${lcr}` } })).status === 404)
check('anonymous cannot download', (await fetch(`${API}/requests/${id}/attachments/${attId}`)).status === 401)

console.log('\n== the resident can remove a file while the request is open ==')
check('delete succeeds', (await fetch(`${API}/requests/${id}/attachments/${png.json.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${resident}` } })).status === 204)
const after = (await j(`/requests/${id}/attachments`, { token: resident })).json
check('it is gone from the list', Array.isArray(after) && !after.some(a => a.id === png.json?.id), JSON.stringify(after))
check('another resident cannot delete', (await fetch(`${API}/requests/${id}/attachments/${attId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${other}` } })).status === 404)

console.log('\n== a closed request stops accepting files ==')
await j(`/staff/requests/${id}/assess`, { method: 'POST', token: mto, body: { fee: 55 } })
await j(`/requests/${id}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
await j(`/staff/requests/${id}/advance`, { method: 'POST', token: mto })
check('upload refused once completed', (await put(`/requests/${id}/attachments`, resident, PDF, 'late.pdf')).status === 409)
check('delete refused once completed', (await fetch(`${API}/requests/${id}/attachments/${attId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${resident}` } })).status === 409)
check('the office can still read them', (await j(`/staff/requests/${id}/attachments`, { token: mto })).json?.length >= 1)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
