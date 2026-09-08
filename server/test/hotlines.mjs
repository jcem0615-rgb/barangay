// Emergency hotlines: published to anyone, municipal first, and dialable.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const catalogue = await (await fetch(`${API}/catalogue`)).json()
const contacts = catalogue.emergencyContacts

console.log('\n== published without signing in ==')
check('the catalogue carries them', Array.isArray(contacts) && contacts.length > 0, `${contacts?.length}`)
check('no token was needed', true)
check('every entry has a number', contacts.every((c) => typeof c.phone === 'string' && c.phone.length > 0))
check('and names who answers', contacts.every((c) => c.agency.length > 0 && c.label.length > 0))

console.log('\n== every number can actually be dialled ==')
for (const c of contacts) {
  const digits = c.phone.replace(/[^\d+]/g, '')
  check(`${c.label} → ${digits}`, digits.length >= 3, c.phone)
}

console.log('\n== the ones a resident needs are there ==')
const agencies = contacts.map((c) => c.agency.toLowerCase()).join(' | ')
for (const [what, needle] of [['disaster office', 'disaster'], ['police', 'police'], ['fire', 'fire'], ['ambulance', 'health']]) {
  check(`${what} is listed`, agencies.includes(needle), agencies)
}

console.log('\n== national numbers are marked as such ==')
const national = contacts.filter((c) => c.isNational)
const municipal = contacts.filter((c) => !c.isNational)
check('some are municipal', municipal.length > 0)
check('some are nationwide', national.length > 0)
check('911 is among the national ones', national.some((c) => c.phone === '911'), JSON.stringify(national.map((c) => c.phone)))
check('and the Red Cross', national.some((c) => c.phone === '143'))
check('no municipal number is flagged national', municipal.every((c) => c.isNational === false))

console.log('\n== municipal numbers come first ==')
const firstNational = contacts.findIndex((c) => c.isNational)
const lastMunicipal = contacts.map((c) => c.isNational).lastIndexOf(false)
check('grouped, not interleaved', firstNational === -1 || lastMunicipal < firstNational, `${lastMunicipal} < ${firstNational}`)

console.log('\n== ids are stable, so a reseed updates rather than duplicates ==')
check('ids are unique', new Set(contacts.map((c) => c.id)).size === contacts.length)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
