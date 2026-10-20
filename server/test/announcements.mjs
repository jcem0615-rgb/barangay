// Barangay announcements.
//
// The first barangay feature that is meant to reach residents, so the checks
// invert: the resident read has to work, the notification has to actually go,
// and what is scoped is relevance — your own barangay's board and no other.
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

const SEED = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: SEED } })).json?.token

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag) => (await j('/auth/register', { method: 'POST', body: {
  email: `ann.${tag}.${stamp}@example.com`, password: 'patalastas-2026',
  fullName: `Taga ${tag} ${stamp}`, birthDate: '1991-11-11',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian-norte@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')

// One resident here, one in the next barangay, one who has not said where they live.
const here = await register('here')
const elsewhere = await register('elsewhere')
const nowhere = await register('nowhere')
const barangays = (await j('/barangays')).json
const poblacion = barangays.find((b) => b.id === 'poblacion')
const nalsian = barangays.find((b) => b.id === 'nalsian-norte')
await j('/barangay/me', { method: 'PUT', token: here, body: { barangayId: poblacion.id } })
await j('/barangay/me', { method: 'PUT', token: elsewhere, body: { barangayId: nalsian.id } })

const soon = (hours) => new Date(Date.now() + hours * 3600_000).toISOString()

console.log('\n== who may post ==')

check('a resident cannot', (await j('/barangay-staff/announcements', {
  method: 'POST', token: here, body: { title: 'Free money', body: 'Come and get it at my house.' },
})).status === 403)
check('nor the municipal administrator — this is the barangay’s board',
  (await j('/barangay-staff/announcements', { token: municipalAdmin })).status === 403)

const thin = await j('/barangay-staff/announcements', {
  method: 'POST', token: officer, body: { title: 'Hi', body: 'Short.' },
})
check('a notice too thin to be worth reading is refused', thin.status === 400, thin.status)

const stale = await j('/barangay-staff/announcements', {
  method: 'POST', token: officer,
  body: { title: 'Already over', body: 'This has already happened, somehow.', expiresAt: soon(-5) },
})
check('a notice that would expire before anybody saw it is refused', stale.status === 400, stale.status)

const normal = await j('/barangay-staff/announcements', {
  method: 'POST', token: officer, body: {
    kind: 'event', title: `Clean-up drive ${stamp}`,
    body: 'Barangay-wide clean-up this Saturday, 6am, meeting at the covered court.',
  },
})
check('the officer can put an ordinary notice up', normal.status === 201, normal.status)
check('and it rings nobody', normal.json.notified === 0, normal.json.notified)

console.log('\n== urgent is the administrator’s, because it reaches a phone ==')

const officerUrgent = await j('/barangay-staff/announcements', {
  method: 'POST', token: officer, body: {
    kind: 'emergency', title: 'Evacuate', body: 'Everybody out, right now, please.', urgent: true,
  },
})
check('an officer cannot ring every phone in the barangay', officerUrgent.status === 403, officerUrgent.status)

const before = (await j('/notifications', { token: here })).json.notifications.length
const urgent = await j('/barangay-staff/announcements', {
  method: 'POST', token: admin, body: {
    kind: 'service', title: `Water interruption ${stamp}`,
    body: 'No water from 8am to 4pm tomorrow while the main is repaired. Store what you need tonight.',
    urgent: true,
  },
})
check('the administrator can', urgent.status === 201, urgent.status)
check('and it reached the residents of this barangay', urgent.json.notified >= 1, urgent.json.notified)

const hereNotes = (await j('/notifications', { token: here })).json.notifications
check('the resident here was told', hereNotes.length > before &&
  hereNotes.some((n) => n.title.includes(`Water interruption ${stamp}`)),
  JSON.stringify(hereNotes.slice(0, 2)))
check('and the notice carries its real text, not a placeholder',
  hereNotes.some((n) => n.body.includes('Store what you need tonight')))

const elsewhereNotes = (await j('/notifications', { token: elsewhere })).json.notifications
check('a resident of the next barangay was not',
  elsewhereNotes.every((n) => !n.title.includes(String(stamp))), elsewhereNotes.length)

console.log('\n== the resident’s board ==')

const board = await j('/barangay/announcements', { token: here })
check('a resident reads their own board', board.status === 200 && board.json.length >= 2, board.json?.length)
check('the urgent one is lifted to the top', board.json[0].title.includes(`Water interruption ${stamp}`),
  board.json[0]?.title)
check('the ordinary one is there too', board.json.some((a) => a.title.includes(`Clean-up drive ${stamp}`)))
check('it says who posted it', Boolean(board.json[0].postedBy), board.json[0].postedBy)

const theirBoard = await j('/barangay/announcements', { token: elsewhere })
check('and sees nothing from the next barangay',
  theirBoard.json.every((a) => !a.title.includes(String(stamp))), theirBoard.json.length)

const noBoard = await j('/barangay/announcements', { token: nowhere })
check('a resident who has not said where they live gets an empty board, not an error',
  noBoard.status === 200 && noBoard.json.length === 0, noBoard.status)

check('a signed-out caller cannot read any board', (await j('/barangay/announcements')).status === 401)

console.log('\n== expiry happens on read ==')

const expiring = await j('/barangay-staff/announcements', {
  method: 'POST', token: officer, body: {
    kind: 'general', title: `Expires shortly ${stamp}`,
    body: 'This notice is about something happening in the next few seconds.',
    expiresAt: new Date(Date.now() + 1500).toISOString(),
  },
})
check('a notice with an expiry can be posted', expiring.status === 201, expiring.status)
check('and shows while it is live',
  (await j('/barangay/announcements', { token: here })).json.some((a) => a.id === expiring.json.id))
await new Promise((r) => setTimeout(r, 2200))
check('then stops showing on its own, with nothing scheduled to make that true',
  (await j('/barangay/announcements', { token: here })).json.every((a) => a.id !== expiring.json.id))
check('while the barangay can still see it in its own list',
  (await j('/barangay-staff/announcements', { token: officer })).json.some((a) => a.id === expiring.json.id))

console.log('\n== correcting and taking down ==')

const edited = await j(`/barangay-staff/announcements/${normal.json.id}`, {
  method: 'PATCH', token: officer, body: { body: 'Moved to Sunday, 6am, same meeting point.' },
})
check('a notice can be corrected', edited.status === 200, edited.status)
check('and says it was edited, because the first version is what people read',
  Boolean(edited.json.editedAt), edited.json.editedAt)

const flagLater = await j(`/barangay-staff/announcements/${normal.json.id}`, {
  method: 'PATCH', token: admin, body: { urgent: true },
})
check('urgent cannot be flipped on afterwards — the notification already went or did not',
  flagLater.status === 400 || (flagLater.status === 200 && flagLater.json.urgent === false),
  `${flagLater.status} ${JSON.stringify(flagLater.json)}`)

const officerTakedown = await j(`/barangay-staff/announcements/${normal.json.id}`, {
  method: 'DELETE', token: officer,
})
check('an officer does not take a notice down', officerTakedown.status === 403, officerTakedown.status)

check('the administrator does', (await j(`/barangay-staff/announcements/${normal.json.id}`, {
  method: 'DELETE', token: admin,
})).status === 200)

check('it leaves the resident board',
  (await j('/barangay/announcements', { token: here })).json.every((a) => a.id !== normal.json.id))
check('but is kept rather than deleted',
  (await j('/barangay-staff/announcements?archived=true', { token: officer }))
    .json.some((a) => a.id === normal.json.id))
check('and cannot be taken down twice', (await j(`/barangay-staff/announcements/${normal.json.id}`, {
  method: 'DELETE', token: admin,
})).status === 404)

console.log('\n== another barangay’s board ==')

check('the next barangay sees none of our notices',
  (await j('/barangay-staff/announcements', { token: otherAdmin }))
    .json.every((a) => !a.title.includes(String(stamp))))
check('and cannot edit one', (await j(`/barangay-staff/announcements/${urgent.json.id}`, {
  method: 'PATCH', token: otherAdmin, body: { title: 'Taken over by Nalsian' },
})).status === 404)
check('nor take one down', (await j(`/barangay-staff/announcements/${urgent.json.id}`, {
  method: 'DELETE', token: otherAdmin,
})).status === 404)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
