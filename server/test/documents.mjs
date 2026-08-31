// Document release: the thing a resident actually came for.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
async function j(p, o = {}) {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const raw = (p, token) => fetch(API + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `docs.${Date.now()}@example.com`, password: 'tamang-lakas-2026',
  fullName: 'Elena Mendoza', address: 'Blk 7 Lot 3, Purok 2',
  municipality: 'Municipality of San Fernando' } })).json.token
const mto = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token
const lcr = (await j('/auth/login', { method: 'POST', body: { email: 'lcr@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token

const sub = await j('/requests', { method: 'POST', token: resident, body: {
  serviceId: 'cedula', formValues: { purpose: 'Employment', occupation: 'Store owner' } } })
const id = sub.json.id

console.log('\n== nothing is released before the office finishes ==')
check('no document while in progress', (await j(`/requests/${id}/document`, { token: resident })).status === 404)

console.log('\n== a paid request can actually be completed ==')
// Regression: paying moved a request to the final step, and advance refused to
// act on a request already at the final step — so it could never complete and
// no document was ever released.
await j(`/staff/requests/${id}/assess`, { method: 'POST', token: mto, body: { fee: 55 } })
await j(`/requests/${id}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
const done = await j(`/staff/requests/${id}/advance`, { method: 'POST', token: mto })
check('advancing a paid request completes it', done.json?.status === 'completed', JSON.stringify(done.json))

console.log('\n== the resident gets a real PDF ==')
const dl = await raw(`/requests/${id}/document`, resident)
const buf = Buffer.from(await dl.arrayBuffer())
check('download succeeds', dl.status === 200, dl.status)
check('served as a PDF', dl.headers.get('content-type') === 'application/pdf')
check('offered as a named download', /filename=".*MTO-\d{4}-\d{5}\.pdf"/.test(dl.headers.get('content-disposition') ?? ''), dl.headers.get('content-disposition'))
check('bytes are a real PDF', buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 1000, `${buf.length} bytes`)

console.log('\n== only the right people can fetch it ==')
const other = (await j('/auth/register', { method: 'POST', body: { email: `other.${Date.now()}@example.com`, password: 'ibang-tao-2026', fullName: 'Juan Cruz' } })).json.token
check('another resident cannot', (await raw(`/requests/${id}/document`, other)).status === 404)
check('anonymous cannot', (await raw(`/requests/${id}/document`)).status === 401)
check('another department cannot', (await raw(`/staff/requests/${id}/document`, lcr)).status === 404)
check('the issuing office can', (await raw(`/staff/requests/${id}/document`, mto)).status === 200)

console.log('\n== the verification code checks out ==')
const detail = await j(`/requests/${id}`, { token: resident })
const code = detail.json.events.find(e => e.eventType === 'released')?.note?.match(/code ([0-9A-Z-]+)/)?.[1]
check('release is recorded in the history', !!code, JSON.stringify(detail.json.events?.map(e => e.eventType)))
const ver = await j(`/verify/${code}`)
check('code verifies without signing in', ver.status === 200 && ver.json.valid === true)
check('names the document and the office', ver.json?.documentType === 'Community Tax Certificate (Cedula)' && /Treasurer/.test(ver.json?.issuedBy ?? ''), JSON.stringify(ver.json))
check('names who it was issued to', ver.json?.issuedTo === 'Elena Mendoza')
check('lowercase code still verifies', (await j(`/verify/${code.toLowerCase()}`)).json?.valid === true)
check('an unknown code is refused', (await j('/verify/ZZZZ-ZZZZ-ZZZZ-ZZZZ')).status === 404)

console.log('\n== releasing twice does not mint a second document ==')
const again = await j(`/staff/requests/${id}/advance`, { method: 'POST', token: mto })
check('re-completing is refused', again.status === 409, again.status)
check('the code is unchanged', (await j(`/verify/${code}`)).json?.valid === true)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
