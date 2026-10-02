// Reporting an incident: who may file one, what counts as evidence, the
// thirty-minute video ceiling, and the fact that it lands with the administrator
// and nobody else.
import { Blob } from 'node:buffer'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

/** A file upload, as the browser sends it. */
const upload = async (path, token, bytes, name, extra = {}) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), name)
  for (const [key, value] of Object.entries(extra)) form.append(key, String(value))
  const res = await fetch(API + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

// Real leading bytes, because the server decides what a file is from those and
// not from the name or the declared type.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)])
const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(4096, 3),
])
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(512, 1)])

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag) => (await j('/auth/register', { method: 'POST', body: {
  email: `inc.${tag}.${stamp}@example.com`, password: 'ulat-ko-2026', fullName: `Taga ${tag} ${stamp}`,
  birthDate: '1991-02-03', motherMaidenName: uniq(), residesHere: true, barangay: 'Poblacion',
} })).json.token

const reporter = await register('a')
const other = await register('b')
const admin = (await j('/auth/login', { method: 'POST', body: { email: 'admin@malasiqui.gov.ph', password: process.env.SEED_PASSWORD ?? 'elgu-demo-2026' } })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: process.env.SEED_PASSWORD ?? 'elgu-demo-2026' } })).json.token

console.log('\n== filing a report ==')

const thin = await j('/incidents', { method: 'POST', token: reporter, body: { kind: 'flood', description: 'water' } })
check('a description too short to act on is refused', thin.status === 400, thin.status)

const badKind = await j('/incidents', { method: 'POST', token: reporter, body: { kind: 'alien-invasion', description: 'Something strange by the river.' } })
check('a kind the app does not offer is refused', badKind.status === 400, badKind.status)

const report = await j('/incidents', { method: 'POST', token: reporter, body: {
  kind: 'flood',
  description: 'The road past the public market is under water and a tricycle has stalled in it.',
  location: 'Bridge past the public market',
} })
check('a real report is accepted', report.status === 201, report.status)
check('and comes back with a reference the resident can quote',
  /^INC-\d{4}-\d{5}$/.test(report.json.referenceNo), report.json.referenceNo)

const second = await j('/incidents', { method: 'POST', token: reporter, body: {
  kind: 'road', description: 'A pothole on the national road has swallowed a wheel.',
} })
check('the next reference is a new number, not a reused one',
  second.json.referenceNo !== report.json.referenceNo, second.json.referenceNo)

console.log('\n== evidence ==')

const photo = await upload(`/incidents/${report.json.id}/evidence`, reporter, JPEG, 'scene.jpg')
check('a photo is accepted', photo.status === 201, JSON.stringify(photo.json))

const video = await upload(`/incidents/${report.json.id}/evidence`, reporter, MP4, 'clip.mp4', { durationSeconds: 95 })
check('a video is accepted', video.status === 201, JSON.stringify(video.json))
check('and its length is kept', video.json.durationSeconds === 95, video.json.durationSeconds)

const tooLong = await upload(`/incidents/${report.json.id}/evidence`, reporter, MP4, 'long.mp4', { durationSeconds: 31 * 60 })
check('a video over thirty minutes is refused', tooLong.status === 413, tooLong.status)
check('and says so in minutes', /30 minutes/.test(tooLong.json?.error ?? ''), tooLong.json?.error)

// The name says jpg and the type says image; only the bytes say PDF.
const liar = await upload(`/incidents/${report.json.id}/evidence`, reporter, PDF, 'photo.jpg')
check('a PDF renamed as a photo is refused on its bytes', liar.status === 415, liar.status)

const notMine = await upload(`/incidents/${report.json.id}/evidence`, other, JPEG, 'scene.jpg')
check('another resident cannot add evidence to it', notMine.status === 404, notMine.status)

console.log('\n== who can see it ==')

const mine = await j('/incidents', { token: reporter })
check('the reporter sees their own reports', mine.json.length === 2, mine.json.length)
check('with the evidence counted', mine.json.find((i) => i.id === report.json.id)?.evidenceCount === 2)

const theirs = await j('/incidents', { token: other })
check('another resident sees none of them', theirs.json.length === 0, theirs.json.length)

const queue = await j('/staff/incidents', { token: admin })
check('the administrator sees the queue', queue.status === 200, queue.status)
check('the report is in it', queue.json.some((i) => i.referenceNo === report.json.referenceNo))
check('with the evidence listed', queue.json.find((i) => i.referenceNo === report.json.referenceNo)?.evidence.length === 2)
check('and who reported it', typeof queue.json[0]?.reportedBy === 'string')

check('an office that is not the administrator cannot', (await j('/staff/incidents', { token: treasury })).status === 403)
check('and neither can a resident', (await j('/staff/incidents', { token: reporter })).status === 403)

console.log('\n== the office acts on it ==')

const acted = await j(`/staff/incidents/${report.json.id}`, { method: 'PATCH', token: admin, body: {
  status: 'acknowledged', note: 'Engineering is on the way with a barrier.',
} })
check('the administrator can acknowledge it', acted.status === 200, acted.status)

const afterAck = await j('/incidents', { token: reporter })
const updated = afterAck.json.find((i) => i.id === report.json.id)
check('the resident sees the new state', updated.status === 'acknowledged', updated.status)
check('and what the office said', /barrier/.test(updated.officeNote ?? ''), updated.officeNote)

const notified = await j('/notifications', { token: reporter })
check('the resident is notified', notified.json.notifications.some((n) => n.kind === 'incident_updated'))

check('a resident cannot change the state of their own report',
  (await j(`/staff/incidents/${report.json.id}`, { method: 'PATCH', token: reporter, body: { status: 'resolved' } })).status === 403)

console.log('\n== evidence is watched, not handed out ==')

const evidenceId = queue.json.find((i) => i.referenceNo === report.json.referenceNo).evidence[0].id
const fetched = await fetch(`${API}/staff/incidents/${report.json.id}/evidence/${evidenceId}`, {
  headers: { Authorization: `Bearer ${admin}` },
})
check('the administrator can play it', fetched.status === 200, fetched.status)
check('served as what it actually is', (fetched.headers.get('content-type') ?? '').startsWith('image/'),
  fetched.headers.get('content-type'))
check('and ranged, so a long video can be scrubbed', fetched.headers.get('accept-ranges') === 'bytes')

const ranged = await fetch(`${API}/staff/incidents/${report.json.id}/evidence/${evidenceId}`, {
  headers: { Authorization: `Bearer ${admin}`, Range: 'bytes=0-99' },
})
check('a range request gets a partial answer', ranged.status === 206, ranged.status)
check('of exactly the bytes asked for', (await ranged.arrayBuffer()).byteLength === 100)

check('a resident cannot read evidence through the staff route',
  (await fetch(`${API}/staff/incidents/${report.json.id}/evidence/${evidenceId}`, {
    headers: { Authorization: `Bearer ${reporter}` },
  })).status === 403)

console.log('\n== a closed report stops taking files ==')
await j(`/staff/incidents/${report.json.id}`, { method: 'PATCH', token: admin, body: { status: 'closed' } })
const late = await upload(`/incidents/${report.json.id}/evidence`, reporter, JPEG, 'late.jpg')
check('evidence after closing is refused', late.status === 409, late.status)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
