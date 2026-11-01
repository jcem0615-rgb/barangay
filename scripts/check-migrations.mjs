// Two repositories, one migration sequence, and the collision that follows.
//
// `server/src/migrate.ts` keys `schema_migrations` on the **filename** and
// applies files in sorted order. Both this repository and the eLGU one add
// migrations, and both were counting from the same sequence — so the first time
// upstream reached 042 a merge would have produced two different files claiming
// that number. Nothing about that is a git conflict: the files have different
// names (`042_barangay_complaints.sql`, `042_whatever_upstream_did.sql`), so
// both merge cleanly, both apply, and which goes first is alphabetical accident
// on a database that may already have run one of them.
//
// **So the ranges are split. Upstream owns 000-599; this repository owns
// 600-999.** Numeric rather than a letter prefix because the order has to stay
// right — a barangay migration references tables from `001_init.sql`, and
// `600_` sorts after every `0xx_` while `b01_` would sort before them.
//
// This script is what makes that a rule rather than a sentence in a document.
// It checks two things, and the first works with no network at all:
//
//   1. **No two migrations share a number.** This is the collision itself, and
//      it is detectable offline — after a merge, from the filenames alone.
//   2. **Nothing this repository added sits in upstream's range.** That needs
//      the fork point, so it is checked only where upstream is reachable, and
//      says so plainly when it is not rather than passing quietly.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const UPSTREAM_BRANCH = 'claude/app-setup-github-lgu-m3kmd7'

/** The first number this repository may use. Everything below is upstream's. */
const RESERVED_FROM = 600

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const files = readdirSync(new URL('../server/migrations', import.meta.url))
  .filter((f) => f.endsWith('.sql'))
  .sort()

const problems = []

// ---- shape -----------------------------------------------------------------
//
// Three digits and an underscore. The runner sorts by filename, so `42_x.sql`
// would sort after `600_x.sql` and apply in the wrong place — which is the same
// class of bug as the collision and is invisible until something depends on the
// order.
const parsed = []
for (const file of files) {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(file)
  if (!match) {
    problems.push(`${file}  is not named NNN_lower_snake_case.sql — the runner sorts by filename`)
    continue
  }
  parsed.push({ file, number: Number(match[1]) })
}

// ---- 1. no two migrations share a number -----------------------------------
const byNumber = new Map()
for (const row of parsed) {
  const existing = byNumber.get(row.number)
  if (existing) {
    problems.push(
      `${String(row.number).padStart(3, '0')} is claimed twice: ${existing.file} and ${row.file}\n` +
      '      Both would apply, in alphabetical order of their names, on a database that may\n' +
      '      already have run one of them. Renumber the one this repository owns into 600+.'
    )
  } else {
    byNumber.set(row.number, row)
  }
}

// ---- 2. nothing we added sits in upstream's range --------------------------
let checkedOurs = false
try {
  const remotes = git('remote').split('\n').filter(Boolean)
  const ref = process.env.UPSTREAM_REF
    ?? (remotes.includes('upstream') ? `upstream/${UPSTREAM_BRANCH}` : null)
  if (ref) {
    const base = git('merge-base', git('rev-parse', ref), 'HEAD')
    // What the fork point had. Anything on disk that is not in that list is
    // this repository's, which is the question being asked.
    //
    // Deliberately NOT `git diff base HEAD`: that compares commits, so a
    // migration added but not yet committed reads as absent and passes — and
    // before the commit is exactly when somebody wants to be told the number
    // is wrong, while renaming it is still free.
    const atFork = new Set(
      git('ls-tree', '--name-only', base, '--', 'server/migrations/')
        .split('\n')
        .filter(Boolean)
        .map((p) => p.split('/').pop())
    )
    const added = files.filter((f) => !atFork.has(f))
    checkedOurs = true
    for (const file of added) {
      const row = parsed.find((r) => r.file === file)
      if (row && row.number < RESERVED_FROM) {
        problems.push(
          `${file}  was added here but sits in upstream's range (needs ${RESERVED_FROM}+).\n` +
          `      Rename it to the next free number from ${RESERVED_FROM}. Nothing has applied it\n` +
          '      under the old name unless a database somewhere already ran it — check that\n' +
          '      before renaming, because the runner keys on the filename and would re-run it.'
        )
      }
    }
  }
} catch {
  // A missing remote or an unresolvable ref is not a failure of this check —
  // the half that matters most runs offline.
}

// ---- report ----------------------------------------------------------------
if (problems.length) {
  console.error(`\n${problems.length} problem(s) with the migration sequence:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('')
  process.exit(1)
}

const ours = parsed.filter((r) => r.number >= RESERVED_FROM)
const theirs = parsed.filter((r) => r.number < RESERVED_FROM)
console.log(
  `migrations ok — ${theirs.length} upstream (000-${String(RESERVED_FROM - 1).padStart(3, '0')}), ` +
  `${ours.length} ours (${RESERVED_FROM}+), no number claimed twice`
)
if (!checkedOurs) {
  console.log(
    'note: upstream was not reachable, so only the duplicate check ran. Add the remote\n' +
    `      (git remote add upstream https://github.com/jcem0615-rgb/LGU.git) to check that\n` +
    `      nothing added here landed below ${RESERVED_FROM}.`
  )
}
if (ours.length) {
  const next = Math.max(RESERVED_FROM - 1, ...ours.map((r) => r.number)) + 1
  console.log(`next free number for this repository: ${next}`)
}
