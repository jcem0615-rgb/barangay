// A resident's complaint to their own barangay, with proof.
//
// The rules here are a deliberate mixture of the two that already exist, and
// the point of this suite is the seam between them:
//
//   * Like the **notice board**, it has a resident read that has to work — the
//     author follows their own complaint and sees what was done about it.
//   * Like the **blotter**, what it holds may name somebody accused of
//     something. So what must NOT work is anybody else reading it: another
//     resident, another barangay, the municipality, or a kagawad.
//
// What makes the resident read safe is that the resident *wrote it*. Reading it
// back to its author discloses nothing they do not already know. Whoever is
// named stays prose inside `details`, attached to no account, so there is
// nothing here that could become a lookup — and this suite checks there is no
// field for one.
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

/** A multipart upload, for the proof. */
const upload = async (path, token, bytes, filename, durationSeconds) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), filename)
  if (durationSeconds !== undefined) form.append('durationSeconds', String(durationSeconds))
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const SEED = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: SEED } })).json?.token

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag) => (await j('/auth/register', { method: 'POST', body: {
  email: `comp.${tag}.${stamp}@example.com`, password: 'sumbong-2026',
  fullName: `Taga ${tag} ${stamp}`, birthDate: '1990-09-09',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const kagawad = await login('kagawad.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian-norte@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')
const treasury = await login('treasury@malasiqui.gov.ph')

const here = await register('here')
const neighbour = await register('neighbour')
const nowhere = await register('nowhere')
const barangays = (await j('/barangays')).json
await j('/barangay/me', { method: 'PUT', token: here, body: { barangayId: 'poblacion' } })
await j('/barangay/me', { method: 'PUT', token: neighbour, body: { barangayId: 'poblacion' } })

// A real 8x8 PNG, so the magic-byte sniffing has something true to read.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=',
  'base64'
)
// An ISO base-media header is all `detectEvidenceType` reads.
const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(2048, 7),
])

// ---------------------------------------------------------------------------
console.log('\n== filing one ==')
// ---------------------------------------------------------------------------
const filed = await j('/barangay-complaints', { method: 'POST', token: here, body: {
  category: 'garbage',
  details: 'The bins at the corner by the chapel have not been collected for two weeks. My neighbour keeps adding construction waste to the pile.',
  location: 'Corner by the chapel',
} })
check('a resident can file one', filed.status === 201, JSON.stringify(filed.json))
const id = filed.json?.id
check('it gets a reference from the counter', /^BCOM-\d{4}-\d{5}$/.test(filed.json?.referenceNo ?? ''), filed.json?.referenceNo)
check('it starts as new, and not final', filed.json?.status === 'new' && filed.json?.final === false)

// The field a complaint must not have: naming somebody is prose, not a column,
// or this table becomes a way to ask what a resident stands accused of.
check(
  'there is no respondent field to query on',
  filed.json !== null && !('respondent' in filed.json) && !('respondentId' in filed.json),
  Object.keys(filed.json ?? {}).join(',')
)

const noBarangay = await j('/barangay-complaints', { method: 'POST', token: nowhere, body: {
  category: 'other', details: 'Something is wrong and I have not said where I live.',
} })
check('an account with no barangay is told so, not 500', noBarangay.status === 409, String(noBarangay.status))

// ---------------------------------------------------------------------------
console.log('\n== the 1500-character cap ==')
// ---------------------------------------------------------------------------
const atCap = await j('/barangay-complaints', { method: 'POST', token: here, body: {
  category: 'other', details: 'x'.repeat(1500),
} })
check('1500 characters is accepted', atCap.status === 201, String(atCap.status))
const overCap = await j('/barangay-complaints', { method: 'POST', token: here, body: {
  category: 'other', details: 'x'.repeat(1501),
} })
check('1501 is refused rather than truncated', overCap.status === 400, String(overCap.status))
check('and nothing was silently cut', !(overCap.json?.details?.length === 1500))

const tooShort = await j('/barangay-complaints', { method: 'POST', token: here, body: {
  category: 'other', details: 'short',
} })
check('a one-word complaint is refused', tooShort.status === 400)

// ---------------------------------------------------------------------------
console.log('\n== the history starts where the complaint does ==')
// ---------------------------------------------------------------------------
const mine = await j(`/barangay-complaints/${id}`, { token: here })
check('the author reads their own', mine.status === 200)
check('with one history row', mine.json?.history?.length === 1, String(mine.json?.history?.length))
check('whose actor is the resident', mine.json?.history?.[0]?.actorRole === 'resident')
check('from nothing, to new', mine.json?.history?.[0]?.from === null && mine.json?.history?.[0]?.to === 'new')
check('and it carries a name, not an account id', typeof mine.json?.history?.[0]?.actorName === 'string' && !('actorId' in (mine.json?.history?.[0] ?? {})))

// ---------------------------------------------------------------------------
console.log('\n== proof ==')
// ---------------------------------------------------------------------------
const photo = await upload(`/barangay-complaints/${id}/evidence`, here, PNG, 'proof.png')
check('a photo attaches', photo.status === 201, JSON.stringify(photo.json))
const longVideo = await upload(`/barangay-complaints/${id}/evidence`, here, MP4, 'clip.mp4', 301)
check('a video over five minutes is refused', longVideo.status === 413, String(longVideo.status))
check('and the refusal names the limit', /5 minutes/.test(longVideo.json?.error ?? ''), longVideo.json?.error)
const okVideo = await upload(`/barangay-complaints/${id}/evidence`, here, MP4, 'clip.mp4', 300)
check('exactly five minutes is accepted', okVideo.status === 201, String(okVideo.status))
check('and the duration is kept', okVideo.json?.durationSeconds === 300, String(okVideo.json?.durationSeconds))
const notMedia = await upload(`/barangay-complaints/${id}/evidence`, here, Buffer.from('not a picture'), 'notes.txt')
check('a text file is refused on its bytes, not its name', notMedia.status === 415, String(notMedia.status))
const renamed = await upload(`/barangay-complaints/${id}/evidence`, here, Buffer.from('%PDF-1.7\nnope'), 'photo.jpg')
check('a PDF renamed .jpg is refused too', renamed.status === 415, String(renamed.status))

const withProof = await j(`/barangay-complaints/${id}`, { token: here })
check('the author sees their proof listed', withProof.json?.evidence?.length === 2, String(withProof.json?.evidence?.length))
const proofId = withProof.json?.evidence?.[0]?.id
const ownProof = await fetch(`${API}/barangay-complaints/${id}/evidence/${proofId}`, { headers: { Authorization: `Bearer ${here}` } })
check('and can fetch it back', ownProof.status === 200, String(ownProof.status))
check('served inline with nosniff', ownProof.headers.get('x-content-type-options') === 'nosniff')
check('and ranged, so a clip can be scrubbed', ownProof.headers.get('accept-ranges') === 'bytes')

// ---------------------------------------------------------------------------
console.log('\n== nobody else reads it ==')
// ---------------------------------------------------------------------------
const theirs = await j(`/barangay-complaints/${id}`, { token: neighbour })
check('another resident of the same barangay gets 404', theirs.status === 404, String(theirs.status))
const theirList = await j('/barangay-complaints', { token: neighbour })
check('and their own list does not contain it', !(theirList.json?.complaints ?? []).some((c) => c.id === id))
const theirProof = await fetch(`${API}/barangay-complaints/${id}/evidence/${proofId}`, { headers: { Authorization: `Bearer ${neighbour}` } })
check('nor can they fetch the proof', theirProof.status === 404, String(theirProof.status))

for (const [who, token] of [['the municipal administrator', municipalAdmin], ['municipal treasury staff', treasury], ['a kagawad', kagawad]]) {
  const out = await j('/barangay-staff/complaints', { token })
  check(`${who} is refused the queue`, out.status === 403, String(out.status))
}

// ---------------------------------------------------------------------------
console.log('\n== the barangay reads it; the administrator moves it ==')
// ---------------------------------------------------------------------------
const queue = await j('/barangay-staff/complaints', { token: admin })
check('the administrator sees the queue', queue.status === 200)
check('with the figures the screen leads on', typeof queue.json?.figures?.open === 'number' && typeof queue.json?.figures?.withProof === 'number')
check('and this complaint in it', (queue.json?.complaints ?? []).some((c) => c.id === id))
check('carrying a proof count', (queue.json?.complaints ?? []).find((c) => c.id === id)?.evidenceCount === 2)

const clerkQueue = await j('/barangay-staff/complaints', { token: officer })
check('the clerk reads it too', clerkQueue.status === 200, String(clerkQueue.status))
const clerkMove = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: officer, body: { status: 'acknowledged' } })
check('but the clerk cannot move it', clerkMove.status === 403, String(clerkMove.status))

const otherSees = await j(`/barangay-staff/complaints/${id}`, { token: otherAdmin })
check("another barangay's administrator gets 404, not 403", otherSees.status === 404, String(otherSees.status))
const otherMoves = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: otherAdmin, body: { status: 'resolved' } })
check('and cannot move it either', otherMoves.status === 404, String(otherMoves.status))

const staffDetail = await j(`/barangay-staff/complaints/${id}`, { token: admin })
check('the console detail carries the resident name', typeof staffDetail.json?.residentName === 'string')
check('and a number to ring, and nothing more about them',
  'residentPhone' in (staffDetail.json ?? {}) && !('residentEmail' in (staffDetail.json ?? {})))

// ---------------------------------------------------------------------------
console.log('\n== the status machine, and a history row per move ==')
// ---------------------------------------------------------------------------
const closeNoReason = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'closed' } })
check('closing with no reason is refused', closeNoReason.status === 400, String(closeNoReason.status))

const ack = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'acknowledged', note: 'Seen. Passing it to the crew.' } })
check('the administrator can acknowledge it', ack.status === 200, JSON.stringify(ack.json))
const working = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'in_progress', note: 'Crew out on Thursday.' } })
check('and move it on', working.status === 200)
const back = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'acknowledged' } })
check('but not backwards', back.status === 409, String(back.status))

const resolved = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'resolved', note: 'Collected, and the neighbour was spoken to.' } })
check('resolving works', resolved.status === 200)
check('and is final', resolved.json?.final === true)
const reopen = await j(`/barangay-staff/complaints/${id}`, { method: 'PATCH', token: admin, body: { status: 'in_progress', note: 'again' } })
check('a resolved complaint cannot be reopened', reopen.status === 409, String(reopen.status))
check('and the refusal says a recurrence is a new complaint', /new complaint/.test(reopen.json?.error ?? ''), reopen.json?.error)

const trail = await j(`/barangay-complaints/${id}`, { token: here })
check('the author sees every move', trail.json?.history?.length === 4, String(trail.json?.history?.length))
check('in order', ['new', 'acknowledged', 'in_progress', 'resolved']
  .every((s, i) => trail.json?.history?.[i]?.to === s), JSON.stringify(trail.json?.history?.map((h) => h.to)))
check('each staff row names who acted', trail.json?.history?.slice(1).every((h) => h.actorRole === 'barangay_admin' && h.actorName))
check('the notes are kept per step, not just the latest',
  trail.json?.history?.[1]?.note === 'Seen. Passing it to the crew.' &&
  trail.json?.history?.[2]?.note === 'Crew out on Thursday.')
check('and the latest is on the parent row for the list',
  trail.json?.response === 'Collected, and the neighbour was spoken to.', trail.json?.response)

const lateProof = await upload(`/barangay-complaints/${id}/evidence`, here, PNG, 'more.png')
check('proof cannot be added once it is finished', lateProof.status === 409, String(lateProof.status))

// ---------------------------------------------------------------------------
console.log('\n== the resident is told, and the telling says nothing ==')
// ---------------------------------------------------------------------------
const notes = await j('/notifications', { token: here })
const rows = notes.json?.notifications ?? notes.json ?? []
const filedNote = rows.find((n) => n.kind === 'barangay_complaint_filed')
const movedNote = rows.find((n) => n.kind === 'barangay_complaint_updated')
check('filing notifies the author', Boolean(filedNote), JSON.stringify(rows.slice(0, 2)))
check('so does every move', Boolean(movedNote))
check('and the body carries the reference and no detail',
  /BCOM-\d{4}-\d{5}/.test(movedNote?.body ?? '') && !/neighbour/i.test(movedNote?.body ?? ''),
  movedNote?.body)

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
