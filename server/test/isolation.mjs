// A different tier is not a wider one.
//
// The barangay console is a separate shell and a separate mount, and the whole
// security argument for that is structural: there is no filter to get wrong,
// because municipal accounts never reach `/barangay-staff` and barangay
// accounts never reach `/staff` or `/admin`. Individual suites have checked
// that on the routes they happened to touch. Nothing checked it on *every*
// route, which is the only version of the claim worth making — a mount-level
// gate is exactly the kind of thing that holds for the twenty routes somebody
// tested and fails for the twenty-first somebody adds next year.
//
// So this suite reads the routers out of the source and walks every route it
// finds. A route added later is covered the day it is added, without anybody
// remembering to come back here.
//
// Two things are asserted per route:
//
//   1. The other tier gets **403**. Not 404, not 400, not a redirect — the gate
//      answers before anything else looks at the request, so the refusal is the
//      same whatever the path or the body.
//
//   2. Every route is defined *below* its mount's gate. A route added above the
//      `requireRole` line would be served to anybody, and would pass (1) only by
//      accident of the path not matching. This is the failure the structure is
//      supposed to make impossible, so it is worth reading the file to confirm.
import { readFileSync } from 'node:fs'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
const PASSWORD = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 120) } }
  return { status: res.status, json }
}

const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).json?.token

/**
 * Every route a router file declares, with the line it is on.
 *
 * Read from the source rather than listed here, so this suite cannot drift
 * from the app the way a hand-maintained list would. Sub-routers carry the
 * prefix they are mounted at inside their parent.
 */
function routesOf(file, routerName, prefix = '', source = null) {
  const src = source ?? readFileSync(new URL(`../src/routes/${file}`, import.meta.url), 'utf8')
  const lines = src.split('\n')
  const gate = lines.findIndex(
    (l) => new RegExp(`^${routerName}\\.use\\(\\s*authenticate,\\s*requireRole\\(`).test(l)
  )
  const found = []
  const pattern = new RegExp(`^${routerName}\\.(get|post|put|patch|delete)\\(\\s*'([^']*)'`)
  lines.forEach((line, i) => {
    const m = pattern.exec(line)
    if (m) found.push({ method: m[1].toUpperCase(), path: prefix + m[2], line: i, declaredAt: i })
  })
  return { gateLine: gate, routes: found }
}

/** `/requests/:id/attachments/:attachmentId` -> a concrete, harmless URL. */
const concrete = (path) =>
  path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000').replace(/\/$/, '') || '/'

// ---------------------------------------------------------------------------
// The two mounts, as `index.ts` wires them.
// ---------------------------------------------------------------------------
// `parent` names the router whose gate this one sits behind. The blotter, the
// register and the notice board carry no `requireRole` of their own and should
// not: they are mounted inside `barangayStaffRouter` *after* its gate, so they
// inherit it. What matters is where they are mounted, which is checked below —
// a sub-router mounted above the gate would be open to anybody.
const BARANGAY_SIDE = [
  ['barangayStaff.ts', 'barangayStaffRouter', '/barangay-staff', '', null],
  ['blotter.ts', 'blotterRouter', '/barangay-staff', '/blotter', 'barangayStaffRouter'],
  ['households.ts', 'householdsRouter', '/barangay-staff', '/households', 'barangayStaffRouter'],
  ['announcements.ts', 'announcementsStaffRouter', '/barangay-staff', '/announcements', 'barangayStaffRouter'],
  ['barangayKagawad.ts', 'barangayKagawadRouter', '/barangay-kagawad', '', null],
]
const MUNICIPAL_SIDE = [
  ['staff.ts', 'staffRouter', '/staff', '', null],
  ['admin.ts', 'adminRouter', '/admin', '', null],
]

const collect = (side) =>
  side.flatMap(([file, router, mount, prefix, parent]) => {
    const { gateLine, routes } = routesOf(file, router, prefix)
    return routes.map((r) => ({
      ...r, mount, file, router, parent, gateLine, url: mount + concrete(r.path),
    }))
  })

const barangayRoutes = collect(BARANGAY_SIDE)
const municipalRoutes = collect(MUNICIPAL_SIDE)

const barangays = (await j('/barangays')).json
const home = barangays.find((b) => b.id === 'poblacion') ?? barangays[0]

const accounts = {
  'the municipal administrator': await login('admin@malasiqui.gov.ph'),
  'municipal treasury staff': await login('treasury@malasiqui.gov.ph'),
  'the barangay administrator': await login(`admin.${home.id}@malasiqui.gov.ph`),
  'the barangay clerk': await login(`officer.${home.id}@malasiqui.gov.ph`),
  'the barangay kagawad': await login(`kagawad.${home.id}@malasiqui.gov.ph`),
}
for (const [who, token] of Object.entries(accounts)) {
  check(`signed in as ${who}`, typeof token === 'string' && token.length > 0)
}

console.log(`\n== every route is below its mount's gate ==`)

const parentSource = readFileSync(new URL('../src/routes/barangayStaff.ts', import.meta.url), 'utf8')
  .split('\n')

for (const [label, routes] of [['the barangay side', barangayRoutes], ['the municipal side', municipalRoutes]]) {
  const byRouter = new Map()
  for (const r of routes) if (!byRouter.has(r.router)) byRouter.set(r.router, r)

  for (const [router, sample] of byRouter) {
    // A router that parsed to nothing would pass every walk below for the
    // worst possible reason, so say out loud that the routes were found.
    check(
      `${router} parsed its routes`,
      routes.filter((r) => r.router === router).length > 0
    )

    if (sample.parent === null) {
      check(
        `${router} gates itself with requireRole`,
        sample.gateLine >= 0,
        `${sample.file}: no \`${router}.use(authenticate, requireRole(…))\` found`
      )
    } else {
      // It inherits. The property worth checking is that the mount is *below*
      // the parent's gate — above it, every route inside would be wide open.
      const parentGate = parentSource.findIndex(
        (l) => new RegExp(`^${sample.parent}\\.use\\(\\s*authenticate,\\s*requireRole\\(`).test(l)
      )
      const mountedAt = parentSource.findIndex(
        (l) => new RegExp(`^${sample.parent}\\.use\\('[^']*',\\s*${router}\\)`).test(l)
      )
      check(
        `${router} is mounted inside ${sample.parent}, below its gate`,
        parentGate >= 0 && mountedAt > parentGate,
        `gate at ${parentGate + 1}, mounted at ${mountedAt + 1}`
      )
    }
  }

  const above = routes.filter((r) => r.gateLine >= 0 && r.declaredAt < r.gateLine)
  check(
    `no route on ${label} is declared above its gate`,
    above.length === 0,
    above.map((r) => `${r.file}:${r.declaredAt + 1} ${r.method} ${r.path}`).join(', ')
  )
}

/**
 * Walks a set of routes with one account and returns everything that was not
 * 403. Returning rather than asserting, so the self-check at the bottom can
 * point it at a deliberately public route without printing a failure nobody is
 * meant to act on.
 */
async function walk(routes, who) {
  const token = accounts[who]
  const leaks = []
  for (const r of routes) {
    const res = await j(r.url, {
      method: r.method,
      token,
      body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {},
    })
    if (res.status !== 403) leaks.push(`${r.method} ${r.mount}${r.path} -> ${res.status}`)
  }
  return leaks
}

const refusedAll = async (label, routes, who) => {
  const leaks = await walk(routes, who)
  check(
    `${who} is refused all ${routes.length} ${label} routes`,
    leaks.length === 0,
    leaks.slice(0, 6).join(' | ')
  )
}

console.log('\n== the municipality cannot see into a barangay ==')
//
// The administrator included. The hall issues the accounts and sets the shared
// certificate catalogue; it does not work a barangay's queue, read its blotter
// or its register of inhabitants, or speak on its board.
for (const who of ['the municipal administrator', 'municipal treasury staff']) {
  await refusedAll('barangay-console', barangayRoutes, who)
}

console.log('\n== and a barangay cannot see into the municipality ==')
//
// The same statement the other way round, which is the half that was never
// asserted over the whole surface: no municipal queue, no other office's
// requests, no payments book, no reports, no accounts, no audit trail.
for (const who of ['the barangay administrator', 'the barangay clerk', 'the barangay kagawad']) {
  await refusedAll('municipal staff and admin', municipalRoutes, who)
}

console.log('\n== each tier still reaches its own ==')
//
// A gate that refused everybody would pass every check above, so the suite has
// to show the doors it is testing are real doors.
const own = [
  ['the barangay administrator', '/barangay-staff/requests'],
  ['the barangay clerk', '/barangay-staff/requests'],
  ['the barangay kagawad', '/barangay-kagawad/summary'],
  ['the municipal administrator', '/admin/municipality'],
  ['municipal treasury staff', '/staff/queue'],
]
for (const [who, path] of own) {
  const res = await j(path, { token: accounts[who] })
  check(`${who} still reaches ${path}`, res.status === 200, res.status)
}

// ---------------------------------------------------------------------------
console.log('\n== the suite can actually fail ==')
//
// Both halves of this file are detectors, and a detector nobody has seen go off
// is a detector nobody should trust. Neither of these touches the app: the
// first feeds the parser a string, the second walks a route that is public on
// purpose. If either stops reporting a problem, every PASS above is worthless.

const GATE_BELOW_A_ROUTE = [
  "export const exampleRouter = Router()",
  "exampleRouter.get('/wide-open', handler)",
  "exampleRouter.use(authenticate, requireRole('admin'))",
  "exampleRouter.get('/behind-the-gate', handler)",
].join('\n')

const fixture = routesOf('example.ts', 'exampleRouter', '', GATE_BELOW_A_ROUTE)
check(
  'the parser finds a route declared above the gate',
  fixture.routes.filter((r) => r.declaredAt < fixture.gateLine)
    .map((r) => r.path).join() === '/wide-open',
  JSON.stringify(fixture)
)
check(
  'and does not flag the one below it',
  fixture.routes.some((r) => r.path === '/behind-the-gate' && r.declaredAt > fixture.gateLine)
)

// `/catalogue` is public by design — the hotlines are on it, and a resident
// needing one is often somewhere with no signal and no session. So it answers
// 200 to a barangay token, and the walk must say so rather than pass.
const decoy = [{
  method: 'GET', path: '/catalogue', mount: '', url: '/catalogue',
  file: 'n/a', router: 'n/a', parent: null, gateLine: -1, declaredAt: 0,
}]
const decoyLeaks = await walk(decoy, 'the barangay administrator')
check(
  'the walk reports a route that answers anything but 403',
  decoyLeaks.length === 1 && decoyLeaks[0].endsWith('-> 200'),
  JSON.stringify(decoyLeaks)
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
