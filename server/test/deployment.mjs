// One deployment, one municipality.
//
// This is the whole isolation model of the per-LGU deployment: two towns never
// share a row, so nothing can forget to scope. What *can* go wrong is the wrong
// database reaching the wrong instance — a restore into the wrong environment,
// a copied DATABASE_URL — and that mistake is silent by nature. So the thing
// worth testing is that the instance refuses to start rather than serving it.
//
// Runs the real boot path in a child process rather than importing it, because
// "refuses to start" is a process exit and nothing else proves it.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configuredBarangays, configuredMunicipality, seedsSampleAccounts } from '../src/deployment.ts'

let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const scratch = mkdtempSync(join(tmpdir(), 'elgu-deploy-'))

console.log('\n== what a deployment is configured with ==')

const sample = configuredMunicipality()
check('with nothing set, the sample municipality is used', sample.source === 'sample', sample.source)
check('and it is the one in mockData', sample.code === 'malasiqui-pangasinan', sample.code)

process.env.MUNICIPALITY_CODE = 'bugallon-pangasinan'
process.env.MUNICIPALITY_NAME = 'Bugallon'
process.env.MUNICIPALITY_PROVINCE = 'Pangasinan'
const configured = configuredMunicipality()
check('the environment wins when it is set', configured.source === 'environment')
check('carrying the town it names', configured.name === 'Bugallon' && configured.code === 'bugallon-pangasinan')

console.log('\n== the barangay roster ==')

check('with no roster file, the sample six are used', configuredBarangays().length === 6)

const roster = join(scratch, 'roster.json')
writeFileSync(roster, JSON.stringify([
  { id: 'poblacion', name: 'Poblacion', captain: 'Hon. A', secretary: 'B' },
  { id: 'salasa', name: 'Salasa' },
]))
process.env.BARANGAY_ROSTER = roster
const loaded = configuredBarangays()
check('a roster file replaces them', loaded.length === 2, loaded.length)
check('and fills in what it leaves out rather than refusing',
  loaded[1].captain === '' && loaded[1].name === 'Salasa')

// Half a roster is worse than none: residents of the missing barangays cannot
// register at all, and nothing in the running app would say why.
const broken = join(scratch, 'broken.json')
writeFileSync(broken, '{ not json')
process.env.BARANGAY_ROSTER = broken
let threw = null
try { configuredBarangays() } catch (err) { threw = err }
check('an unreadable roster stops the seed rather than seeding part of it', threw !== null)
check('and says which file', /broken\.json/.test(threw?.message ?? ''), threw?.message)

const dupes = join(scratch, 'dupes.json')
writeFileSync(dupes, JSON.stringify([{ id: 'a', name: 'A' }, { id: 'a', name: 'Also A' }]))
process.env.BARANGAY_ROSTER = dupes
threw = null
try { configuredBarangays() } catch (err) { threw = err }
check('two barangays with one id is refused', /same id/.test(threw?.message ?? ''), threw?.message)
delete process.env.BARANGAY_ROSTER

console.log('\n== sample logins are a development convenience ==')

delete process.env.SEED_SAMPLE_ACCOUNTS
const wasProduction = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
check('a production provision creates no shared-password logins', seedsSampleAccounts() === false)
process.env.NODE_ENV = 'development'
check('a development seed still does', seedsSampleAccounts() === true)
process.env.SEED_SAMPLE_ACCOUNTS = 'false'
check('and it can be turned off explicitly', seedsSampleAccounts() === false)
delete process.env.SEED_SAMPLE_ACCOUNTS
if (wasProduction === undefined) delete process.env.NODE_ENV
else process.env.NODE_ENV = wasProduction

console.log('\n== the instance refuses a database that is not its own ==')

/** Boots the real server with an env, and reports how it exited. */
const boot = (extraEnv) => new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'],
    { env: { ...process.env, ...extraEnv, PORT: '4399' }, cwd: process.cwd() }
  )
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { out += d })
  // A server that starts stays up, so a boot that has not exited shortly is a
  // boot that succeeded.
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: null, out }) }, 6000)
  child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }) })
})

// The seeded database is Malasiqui's. Point an instance configured for another
// town at it and it must die rather than serve.
const wrong = await boot({
  MUNICIPALITY_CODE: 'bugallon-pangasinan',
  MUNICIPALITY_NAME: 'Bugallon',
})
check('it exits rather than serving another town’s database', wrong.code === 1, wrong.code)
check('and names both sides so the mistake is obvious',
  /different municipality/i.test(wrong.out) && /Bugallon/.test(wrong.out) && /malasiqui/i.test(wrong.out),
  wrong.out.slice(0, 300))

const right = await boot({
  MUNICIPALITY_CODE: 'malasiqui-pangasinan',
  MUNICIPALITY_NAME: 'Malasiqui',
})
check('the matching database starts normally', right.code === null, right.code)
check('and every boot says which municipality it is serving',
  /serving Malasiqui \(malasiqui-pangasinan\)/.test(right.out), right.out.slice(0, 300))

// A development copy sets nothing, and there is nothing to confuse.
const unconfigured = await boot({ MUNICIPALITY_CODE: '' })
check('an unconfigured development copy still starts', unconfigured.code === null, unconfigured.code)

rmSync(scratch, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
