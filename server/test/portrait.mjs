// The portrait on a resident's digital ID: their own photo, images only,
// and reachable by nobody else.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const putPhoto = async (token, bytes, name, type = 'image/jpeg') => {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  const res = await fetch(`${API}/auth/me/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 3)])
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(500, 32), Buffer.from('\n%%EOF')])
const HTML = Buffer.from('<html><script>alert(1)</script></html>')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const stamp = Date.now()
const resident = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `pt.${stamp}@example.com`, password: 'larawan-ko-2026', fullName: 'Aurora M. Villamor' } })).json.token
const stranger = (await j('/auth/register', { method: 'POST', body: { birthDate: '1990-01-01', motherMaidenName: `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`, residesHere: true, email: `pt2.${stamp}@example.com`, password: 'larawan-ko-2026', fullName: 'Iba Tao' } })).json.token
const staff = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: 'elgu-demo-2026' } })).json.token

console.log('\n== a resident starts with no photo ==')
const before = (await j('/auth/me', { token: resident })).json
check('the profile says so', before.profile.hasPhoto === false, JSON.stringify(before.profile?.hasPhoto))
check('fetching one is a 404', (await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${resident}` } })).status === 404)

console.log('\n== uploading a selfie ==')
const up = await putPhoto(resident, JPEG, 'selfie.jpg')
check('accepted', up.status === 200, JSON.stringify(up.json))
check('reports a photo is now on file', up.json?.hasPhoto === true)
const me = (await j('/auth/me', { token: resident })).json
check('the profile agrees', me.profile.hasPhoto === true)
check('and records when', typeof me.profile.photoUpdatedAt === 'string')

console.log('\n== reading it back ==')
const got = await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${resident}` } })
check('served', got.status === 200)
check('as an image', got.headers.get('content-type') === 'image/jpeg', got.headers.get('content-type'))
check('inline, because the ID renders it', /^inline/.test(got.headers.get('content-disposition') ?? ''), got.headers.get('content-disposition'))
check('with nosniff', got.headers.get('x-content-type-options') === 'nosniff')
check('never cached by a shared proxy', /no-store/.test(got.headers.get('cache-control') ?? ''), got.headers.get('cache-control'))
check('the bytes come back intact', Buffer.from(await got.arrayBuffer()).equals(JPEG))

console.log('\n== only pictures ==')
check('a PDF is refused', (await putPhoto(resident, PDF, 'scan.pdf', 'application/pdf')).status === 415)
const disguised = await putPhoto(resident, HTML, 'me.jpg', 'image/jpeg')
check('HTML renamed .jpg is refused', disguised.status === 415, `${disguised.status}`)
check('SVG is refused, script and all', (await putPhoto(resident, SVG, 'me.svg', 'image/svg+xml')).status === 415)
check('a PNG is accepted', (await putPhoto(resident, PNG, 'me.png', 'image/png')).status === 200)
const asPng = await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${resident}` } })
check('replacing changes the served type', asPng.headers.get('content-type') === 'image/png', asPng.headers.get('content-type'))
check('and the bytes', Buffer.from(await asPng.arrayBuffer()).equals(PNG))

console.log('\n== size ==')
const HUGE = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5 * 1024 * 1024, 7)])
check('over 4 MB is refused', (await putPhoto(resident, HUGE, 'huge.jpg')).status === 413)

console.log('\n== it belongs to one resident ==')
const strangerGet = await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${stranger}` } })
check('another resident gets their own 404, not this photo', strangerGet.status === 404)
check('anonymous cannot read', (await fetch(`${API}/auth/me/photo`)).status === 401)
check('staff have no portrait of their own', (await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${staff}` } })).status === 403)
check('and cannot upload one', (await putPhoto(staff, JPEG, 'x.jpg')).status === 403)

console.log('\n== removing it ==')
check('delete succeeds', (await fetch(`${API}/auth/me/photo`, { method: 'DELETE', headers: { Authorization: `Bearer ${resident}` } })).status === 204)
check('the profile no longer claims one', (await j('/auth/me', { token: resident })).json.profile.hasPhoto === false)
check('and it is gone', (await fetch(`${API}/auth/me/photo`, { headers: { Authorization: `Bearer ${resident}` } })).status === 404)
check('deleting twice is a 404', (await fetch(`${API}/auth/me/photo`, { method: 'DELETE', headers: { Authorization: `Bearer ${resident}` } })).status === 404)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
