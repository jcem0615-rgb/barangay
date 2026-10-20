// The barangay blotter and its summons.
//
// This is the most defamatory data the app holds — a respondent is somebody
// accused of something and found to have done nothing — so the checks that
// matter most are the negative ones: no resident can reach it, no other
// barangay can, no municipal office can, and nothing about it is announced to
// anybody by notification.
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
  email: `bltr.${tag}.${stamp}@example.com`, password: 'blotter-ko-2026',
  fullName: `Taga ${tag} ${stamp}`, birthDate: '1989-04-04',
  motherMaidenName: uniq(), residesHere: true,
} })).json.token

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian-norte@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')
const municipalStaff = await login('bpls@malasiqui.gov.ph')
const resident = await register('a')

const soon = (hours) => new Date(Date.now() + hours * 3600_000).toISOString()

console.log('\n== who may open the book ==')

check('a resident cannot', (await j('/barangay-staff/blotter', { token: resident })).status === 403)
check('nor municipal staff', (await j('/barangay-staff/blotter', { token: municipalStaff })).status === 403)
check('nor the municipal administrator — this is the barangay’s book',
  (await j('/barangay-staff/blotter', { token: municipalAdmin })).status === 403)
check('a signed-out caller cannot', (await j('/barangay-staff/blotter')).status === 401)
check('the barangay officer can', (await j('/barangay-staff/blotter', { token: officer })).status === 200)
check('and the barangay administrator can', (await j('/barangay-staff/blotter', { token: admin })).status === 200)

console.log('\n== writing an entry ==')

const thin = await j('/barangay-staff/blotter', { method: 'POST', token: officer, body: {
  complainant: 'Juan Dela Cruz', respondent: 'Pedro Santos', nature: 'Noise or nuisance',
  narrative: 'too loud',
} })
check('a narrative too short to mean anything is refused', thin.status === 400, thin.status)

const badNature = await j('/barangay-staff/blotter', { method: 'POST', token: officer, body: {
  complainant: 'Juan Dela Cruz', respondent: 'Pedro Santos', nature: 'Witchcraft',
  narrative: 'A long enough narrative about what is alleged to have happened here.',
} })
check('a nature the book does not have is refused', badNature.status === 400, badNature.status)

const future = await j('/barangay-staff/blotter', { method: 'POST', token: officer, body: {
  complainant: 'Juan Dela Cruz', respondent: 'Pedro Santos', nature: 'Theft',
  narrative: 'A long enough narrative about what is alleged to have happened here.',
  occurredAt: soon(48),
} })
check('an incident that has not happened yet is refused', future.status === 400, future.status)

const entry = await j('/barangay-staff/blotter', { method: 'POST', token: officer, body: {
  complainant: `Juan Dela Cruz ${stamp}`, complainantContact: '0917 000 0000',
  respondent: `Pedro Santos ${stamp}`, respondentAddress: 'Purok 3',
  nature: 'Dispute between neighbours',
  narrative: 'The respondent is alleged to have burned refuse against the shared fence, repeatedly, after being asked to stop.',
} })
check('the officer can write the book', entry.status === 201, entry.status)
check('and it comes back with a reference', /^BLTR-\d{4}-\d{5}$/.test(entry.json?.referenceNo ?? ''), entry.json?.referenceNo)
check('a new entry starts as recorded', entry.json.status === 'recorded', entry.json.status)

const second = await j('/barangay-staff/blotter', { method: 'POST', token: admin, body: {
  complainant: 'Maria Reyes', respondent: 'Jose Cruz', nature: 'Debt or unpaid obligation',
  narrative: 'A long enough narrative about an unpaid obligation and what was agreed between them.',
} })
check('numbers are never reused', second.json.referenceNo !== entry.json.referenceNo, second.json.referenceNo)

console.log('\n== another barangay’s book ==')

const theirs = await j('/barangay-staff/blotter', { token: otherAdmin })
check('the next barangay sees nothing of ours',
  theirs.json.every((e) => e.referenceNo !== entry.json.referenceNo), theirs.json.length)

const reachAcross = await j(`/barangay-staff/blotter/${entry.json.id}`, { token: otherAdmin })
check('and cannot open one by id — not found rather than refused', reachAcross.status === 404, reachAcross.status)

const patchAcross = await j(`/barangay-staff/blotter/${entry.json.id}`, {
  method: 'PATCH', token: otherAdmin, body: { status: 'withdrawn', outcomeNote: 'Not mine to close.' },
})
check('nor close one', patchAcross.status === 404, patchAcross.status)

const summonAcross = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: otherAdmin, body: { hearingAt: soon(48), venue: 'Their hall' },
})
check('nor call a hearing on it', summonAcross.status === 404, summonAcross.status)

console.log('\n== the summons is the administrator’s ==')

const officerSummons = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: officer, body: { hearingAt: soon(48), venue: 'Barangay hall' },
})
check('an officer records the book but does not call a hearing', officerSummons.status === 403, officerSummons.status)

const past = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: admin, body: { hearingAt: soon(-48), venue: 'Barangay hall' },
})
check('a hearing cannot be called for a date that has gone', past.status === 400, past.status)

const first = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: admin, body: { hearingAt: soon(48), venue: 'Barangay hall', note: 'Both parties to appear.' },
})
check('the administrator can call one', first.status === 201, first.status)
check('and it is the first calling', first.json.sequence === 1, first.json.sequence)

const opened = await j(`/barangay-staff/blotter/${entry.json.id}`, { token: officer })
check('calling a hearing moves the matter into mediation', opened.json.status === 'mediation', opened.json.status)
check('the summons is on the entry', opened.json.summons.length === 1, opened.json.summons.length)

const twice = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: admin, body: { hearingAt: soon(72), venue: 'Barangay hall' },
})
check('a second open hearing on one matter is refused', twice.status === 409, twice.status)

console.log('\n== what happened at the hearing ==')

const summonsId = opened.json.summons[0].id
const nothing = await j(`/barangay-staff/blotter/${entry.json.id}/summons/${summonsId}`, {
  method: 'PATCH', token: admin, body: {},
})
check('recording nothing is refused', nothing.status === 400, nothing.status)

check('service is recorded on its own',
  (await j(`/barangay-staff/blotter/${entry.json.id}/summons/${summonsId}`, {
    method: 'PATCH', token: admin, body: { servedAt: new Date().toISOString(), servedNote: 'Served personally.' },
  })).status === 200)

const officerOutcome = await j(`/barangay-staff/blotter/${entry.json.id}/summons/${summonsId}`, {
  method: 'PATCH', token: officer, body: { outcome: 'appeared' },
})
check('an officer does not record the outcome either', officerOutcome.status === 403, officerOutcome.status)

check('the administrator records it',
  (await j(`/barangay-staff/blotter/${entry.json.id}/summons/${summonsId}`, {
    method: 'PATCH', token: admin, body: { outcome: 'failed_to_appear' },
  })).status === 200)

const rewrite = await j(`/barangay-staff/blotter/${entry.json.id}/summons/${summonsId}`, {
  method: 'PATCH', token: admin, body: { outcome: 'appeared' },
})
check('and what happened at a hearing is not rewritten afterwards', rewrite.status === 409, rewrite.status)

const afterOutcome = await j(`/barangay-staff/blotter/${entry.json.id}`, { token: admin })
check('service is kept beside the outcome', Boolean(afterOutcome.json.summons[0].servedAt))

const again = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: admin, body: { hearingAt: soon(96), venue: 'Barangay hall' },
})
check('a second calling is allowed once the first is closed', again.status === 201, again.status)
check('and it is numbered as the second', again.json.sequence === 2, again.json.sequence)

console.log('\n== closing the matter ==')

const silent = await j(`/barangay-staff/blotter/${entry.json.id}`, {
  method: 'PATCH', token: admin, body: { status: 'settled' },
})
check('closing without saying how is refused', silent.status === 400, silent.status)

check('the officer may close it, having recorded it',
  (await j(`/barangay-staff/blotter/${entry.json.id}`, {
    method: 'PATCH', token: officer,
    body: { status: 'settled', outcomeNote: 'Parties agreed the fence line and to burn no refuse there.' },
  })).status === 200)

const closed = await j(`/barangay-staff/blotter/${entry.json.id}`, { token: admin })
check('the terms are kept', closed.json.outcomeNote.includes('fence line'))
check(
  'closing cancels a hearing nobody now needs to attend',
  closed.json.summons.every((s) => s.outcome !== 'pending'),
  JSON.stringify(closed.json.summons.map((s) => s.outcome))
)

const reopen = await j(`/barangay-staff/blotter/${entry.json.id}`, {
  method: 'PATCH', token: admin, body: { status: 'mediation' },
})
check('a concluded matter is not reopened here', reopen.status === 409, reopen.status)

const summonsAfter = await j(`/barangay-staff/blotter/${entry.json.id}/summons`, {
  method: 'POST', token: admin, body: { hearingAt: soon(120), venue: 'Barangay hall' },
})
check('nor called again', summonsAfter.status === 409, summonsAfter.status)

console.log('\n== nothing about this reaches the resident ==')

const notes = await j('/notifications', { token: resident })
check('no notification was written by any of it',
  notes.json.notifications.every((n) => !/blotter|summons|BLTR-/i.test(`${n.title} ${n.body}`)),
  JSON.stringify(notes.json.notifications.slice(0, 2)))

// A resident's own export is where they see everything held about them. The
// blotter is deliberately not in it: it is the barangay's record of a dispute
// between two people, and half of it is somebody else's name.
const exported = await j('/privacy/export', { token: resident })
check('and it is not in a resident’s data export',
  !/BLTR-|blotter/i.test(JSON.stringify(exported.json ?? {})), exported.status)

console.log('\n== the calendar ==')

const upcoming = await j('/barangay-staff/blotter/calendar/upcoming', { token: admin })
check('the hearings called are listed', upcoming.status === 200, upcoming.status)
check('a cancelled one is not among them',
  upcoming.json.every((s) => s.referenceNo !== entry.json.referenceNo),
  upcoming.json.length)
check('another barangay sees none of ours',
  (await j('/barangay-staff/blotter/calendar/upcoming', { token: otherAdmin })).json
    .every((s) => s.referenceNo !== entry.json.referenceNo))

console.log('\n== searching the book ==')

const found = await j(`/barangay-staff/blotter?q=${encodeURIComponent(String(stamp))}`, { token: officer })
check('a name finds its entry', found.json.some((e) => e.referenceNo === entry.json.referenceNo), found.json.length)
const theirSearch = await j(`/barangay-staff/blotter?q=${encodeURIComponent(String(stamp))}`, { token: otherAdmin })
check('but only inside the barangay doing the searching', theirSearch.json.length === 0, theirSearch.json.length)

console.log('\n== telling the parties a hearing was called ==')

// The one place the blotter's silence is relaxed. It is relaxed without the
// thing that made silence necessary: the parties are still free text, so the
// reminder goes to a contact the barangay typed and never to a matched account.
const withContacts = await j('/barangay-staff/blotter', {
  method: 'POST', token: admin, body: {
    complainant: `Reachable Complainant ${stamp}`,
    complainantContact: 'complainant@example.com',
    respondent: `Reachable Respondent ${stamp}`,
    respondentContact: '0917 555 0101',
    nature: 'Other',
    narrative: 'A dispute recorded so the reminder path has two contacts to reach.',
  },
})
check('a respondent contact can be recorded', withContacts.status === 201, withContacts.status)
check('and reads back', withContacts.json.respondentContact === '0917 555 0101',
  withContacts.json.respondentContact)

const called = await j(`/barangay-staff/blotter/${withContacts.json.id}/summons`, {
  method: 'POST', token: admin,
  body: { hearingAt: soon(72), venue: 'Barangay Hall' },
})
check('calling a hearing reports what became of the reminder',
  called.status === 201 && typeof called.json.notifyResult === 'string', JSON.stringify(called.json))
check('it reached the email contact', /emailed/.test(called.json.notifyResult), called.json.notifyResult)
check('and said plainly what happened to the number rather than implying it went',
  /texted|SMS is not configured/.test(called.json.notifyResult), called.json.notifyResult)

const withNotice = await j(`/barangay-staff/blotter/${withContacts.json.id}`, { token: admin })
const row = withNotice.json.summons[0]
check('the summons records that a reminder went', Boolean(row.notifiedAt), row.notifiedAt)
check('and what happened to it', Boolean(row.notifyResult))
// A text message is not service. The law wants the barangay to serve it, and
// conflating the two would let a barangay report service it never performed.
check('but it is NOT recorded as served', row.servedAt === null, row.servedAt)

const noContacts = await j('/barangay-staff/blotter', {
  method: 'POST', token: admin, body: {
    complainant: `Unreachable ${stamp}`, respondent: `Also Unreachable ${stamp}`,
    nature: 'Other', narrative: 'Nobody left a number, which the barangay has to be told.',
  },
})
const quiet = await j(`/barangay-staff/blotter/${noContacts.json.id}/summons`, {
  method: 'POST', token: admin,
  body: { hearingAt: soon(72), venue: 'Barangay Hall' },
})
check('with no contact on file the hearing is still called', quiet.status === 201, quiet.status)
check('and the barangay is told nobody was reached',
  /no contact/i.test(quiet.json.notifyResult), quiet.json.notifyResult)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
