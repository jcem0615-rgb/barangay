// The step-by-step route to a document.
//
// The value of this feature is entirely in the links being right: a step that
// points at a service that does not exist renders as a dead end, and a chain
// that loops sends a resident round in circles. Both are worse than the flat
// checklist this replaced, so they are checked rather than trusted.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const get = async (p) => (await fetch(API + p)).json()

const catalogue = await get('/catalogue')
const certificates = await get('/barangays/certificates')
const services = catalogue.services
const byService = new Map(services.map((s) => [s.id, s]))
const byCertificate = new Map(certificates.map((c) => [c.id, c]))

console.log('\n== the route is published ==')

check('the catalogue is public and carries services', services.length > 0)
check('every service has a route', services.every((s) => Array.isArray(s.steps) && s.steps.length > 0),
  services.filter((s) => !s.steps?.length).map((s) => s.id).join(', '))
check('every barangay certificate has one too', certificates.every((c) => c.steps?.length > 0),
  certificates.filter((c) => !c.steps?.length).map((c) => c.id).join(', '))

const allSteps = [
  ...services.flatMap((s) => s.steps.map((step) => [s.id, step])),
  ...certificates.flatMap((c) => c.steps.map((step) => [c.id, step])),
]
check('every step says what it is and who issues it',
  allSteps.every(([, s]) => s.label?.trim() && s.where?.trim()),
  JSON.stringify(allSteps.find(([, s]) => !s.label?.trim() || !s.where?.trim())))

console.log('\n== every link goes somewhere ==')

const linked = allSteps.filter(([, s]) => s.serviceId || s.certificateId)
check('some steps link to documents issued here', linked.length > 0, linked.length)

const deadService = linked.filter(([, s]) => s.serviceId && !byService.has(s.serviceId))
check('no step points at a service that does not exist', deadService.length === 0,
  deadService.map(([owner, s]) => `${owner} -> ${s.serviceId}`).join(', '))

const deadCert = linked.filter(([, s]) => s.certificateId && !byCertificate.has(s.certificateId))
check('no step points at a certificate that does not exist', deadCert.length === 0,
  deadCert.map(([owner, s]) => `${owner} -> ${s.certificateId}`).join(', '))

check('no step claims to be both a service and a certificate',
  !linked.some(([, s]) => s.serviceId && s.certificateId))

const selfRef = linked.filter(([owner, s]) => s.serviceId === owner || s.certificateId === owner)
check('nothing requires itself', selfRef.length === 0, selfRef.map(([o]) => o).join(', '))

console.log('\n== the chain terminates ==')

// A cycle would let the guide walk a resident between two documents forever,
// each saying to get the other first. Depth-first over the prerequisite edges.
const edges = (id) => {
  const owner = byService.get(id) ?? byCertificate.get(id)
  return (owner?.steps ?? [])
    .map((s) => s.serviceId ?? s.certificateId)
    .filter(Boolean)
    .filter((next) => next !== id)
}

const cycles = []
for (const start of [...byService.keys(), ...byCertificate.keys()]) {
  const seen = new Set()
  const walk = (id, trail) => {
    if (trail.includes(id)) { cycles.push([...trail, id].join(' -> ')); return }
    if (seen.has(id)) return
    seen.add(id)
    for (const next of edges(id)) walk(next, [...trail, id])
  }
  walk(start, [])
}
check('no document requires another that requires it back', cycles.length === 0, cycles[0] ?? '')

console.log('\n== the chains that matter ==')

const stepIds = (id) => {
  const owner = byService.get(id) ?? byCertificate.get(id)
  return owner.steps.map((s) => s.serviceId ?? s.certificateId).filter(Boolean)
}

check('a business permit sends you to the barangay first',
  byService.get('boss-application').steps[0].certificateId === 'business-clearance',
  JSON.stringify(byService.get('boss-application').steps[0]))

check('a building permit needs zoning cleared first',
  byService.get('building-permit').steps[0].serviceId === 'zoning-clearance',
  JSON.stringify(byService.get('building-permit').steps[0]))

check('an occupancy certificate needs the building permit',
  stepIds('occupancy-permit').includes('building-permit'))

check('zoning needs the property tax cleared',
  stepIds('zoning-clearance').includes('rpt-clearance'))

check('a tax clearance starts from the assessment',
  stepIds('rpt-clearance').includes('rpt-assessment'))

check('an occupational permit needs a cedula and a health certificate',
  ['cedula', 'health-certificate'].every((id) => stepIds('occupational-permit').includes(id)),
  stepIds('occupational-permit').join(', '))

check('financial assistance starts with a certificate of indigency',
  stepIds('aics-application').includes('indigency'))

check('a sanitary permit needs the workers’ health certificates',
  stepIds('sanitary-permit').includes('health-certificate'))

console.log('\n== what is conditional is marked as such ==')

const conditional = allSteps.filter(([, s]) => s.onlyIf)
check('some steps apply only to some applicants', conditional.length > 0, conditional.length)
check('each one says what the condition is',
  conditional.every(([, s]) => s.onlyIf.trim().length > 3),
  JSON.stringify(conditional.find(([, s]) => s.onlIf)))
check('a food business is told about the sanitary permit',
  byService.get('boss-application').steps.some((s) => s.serviceId === 'sanitary-permit' && s.onlyIf))

console.log('\n== the last step is applying ==')

// A route that ends on a prerequisite leaves the resident with no instruction
// to actually file anything.
const endsOnLink = services.filter((s) => {
  const last = s.steps[s.steps.length - 1]
  return last.serviceId || last.certificateId
})
check('no route ends on another document', endsOnLink.length === 0,
  endsOnLink.map((s) => s.id).join(', '))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
