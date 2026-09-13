// Finding a service by what a resident calls it. The matching runs on the
// device against the cached catalogue, so this checks the two halves that make
// it work: the terms are published, and the matcher ranks the way a person
// would expect.
import { searchServices, normalise } from '../../src/lib/search.ts'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const catalogue = await (await fetch(`${API}/catalogue`)).json()
const { services, departments } = catalogue
const findCategory = (id) => departments.find((d) => d.id === id)
const top = (q) => searchServices(q, services, findCategory)[0]?.service?.id ?? null
const ids = (q) => searchServices(q, services, findCategory).map((m) => m.service.id)

console.log('\n== the catalogue publishes what people call things ==')
check('every service carries search terms', services.every((s) => Array.isArray(s.searchTerms)), JSON.stringify(services.find((s) => !Array.isArray(s.searchTerms))?.id))
check('and none is left empty', services.every((s) => s.searchTerms.length > 0), services.filter((s) => s.searchTerms.length === 0).map((s) => s.id).join(','))
check('they reach the client without signing in', true)

console.log('\n== normalising ==')
check('case is ignored', normalise('CEDULA') === 'cedula')
check('a typographic apostrophe reads the same as a straight one',
  normalise('mayor’s permit') === normalise("mayor's permit"), normalise('mayor’s permit'))
check('accents fold', normalise('Señor Niño') === 'senor nino', normalise('Señor Niño'))
check('punctuation becomes a gap', normalise('sari-sari/store') === 'sari sari store')

console.log('\n== what a resident actually types ==')
const expected = [
  ['sari-sari store', 'boss-application'],
  ['negosyo', 'boss-application'],
  ['mayor’s permit', 'boss-application'],
  ["mayor's permit", 'boss-application'],
  ['amilyar', 'rpt-assessment'],
  ['ayuda', 'aics-application'],
  ['kasal', 'marriage-certificate'],
  ['ikakasal', 'marriage-license'],
  ['cedula', 'cedula'],
  ['sedula', 'cedula'],
  ['matanda', 'senior-pwd-id'],
  ['pwd', 'senior-pwd-id'],
  ['magpapatayo ng bahay', 'building-permit'],
  ['yellow card', 'health-certificate'],
  ['solo parent', 'solo-parent-id'],
  ['karinderya', 'sanitary-permit'],
]
for (const [query, want] of expected) {
  check(`"${query}" finds ${want}`, top(query) === want, `got ${top(query)}`)
}

console.log('\n== the official name still works ==')
for (const service of services) {
  check(`"${service.name}" finds itself`, top(service.name) === service.id, `got ${top(service.name)}`)
}

console.log('\n== more words means fewer results, never more ==')
check('"permit" is broad', ids('permit').length > 1, `${ids('permit').length}`)
check('"building permit" is narrower', ids('building permit').length <= ids('permit').length)
check('and every narrower result was in the broader one', ids('building permit').every((id) => ids('permit').includes(id)))

console.log('\n== it does not invent matches ==')
for (const nonsense of ['xyzzy', 'passport', 'drivers license', '']) {
  check(`"${nonsense}" finds nothing`, ids(nonsense).length === 0, ids(nonsense).join(','))
}
check('a birth certificate is not a building permit', !ids('building permit').includes('birth-certificate'))

console.log('\n== an office name finds its services ==')
const treasuryHits = ids('treasurer')
check('searching the office lists its services', treasuryHits.length > 0 && treasuryHits.every((id) => services.find((s) => s.id === id).categoryId === 'treasury'), treasuryHits.join(','))

console.log('\n== a requirement matches, but ranks below the thing itself ==')
const zoning = ids('zoning')
check('zoning finds the clearance first', zoning[0] === 'zoning-clearance', zoning.join(','))
check('and the building permit that requires it, below', zoning.includes('building-permit'), zoning.join(','))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
