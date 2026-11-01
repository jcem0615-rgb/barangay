// What keeps this split integratable, rather than hoping it stays that way.
//
// `server/BARANGAY-TIER.md` argued against two repositories in one sentence:
// "A copied repo would have started drifting at the first bug fix, and
// 'integrate later' would have meant a rewrite." SPLIT.md accepts that cost
// and answers it by keeping the divergence tiny — but prose cannot hold a line
// like that. Nothing stops the next change from editing a screen, a route or a
// migration here, and nothing would say so until somebody tried to merge.
//
// So the divergence is declared below, and this fails when reality exceeds the
// declaration. Two failures, and they are different:
//
//   1. **A file changed here that is not on the list.** Divergence grew. That
//      is not forbidden — it is a decision, and the fix is usually to make the
//      same change upstream instead, or to add the file here with what
//      integration must do to it. What is forbidden is it happening silently.
//
//   2. **A listed file no longer differs.** The list is stale and now
//      overstates the gap, which is the way a manifest stops being read.
//
// It also reports whether upstream has moved, because that is the thing that
// decides how expensive integration is today, and it is invisible from inside
// this repository.
import { execFileSync } from 'node:child_process'

const UPSTREAM_URL = 'https://github.com/jcem0615-rgb/LGU.git'
const UPSTREAM_BRANCH = 'claude/app-setup-github-lgu-m3kmd7'

const git = (...args) =>
  execFileSync('git', args, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim()

/**
 * Everything this repository changes relative to the eLGU tree, and **what
 * integration has to do with each one**. That second column is the part worth
 * having: at a merge, the question about every one of these files is not "did
 * it change" but "does it belong in a repository that ships both products".
 *
 *   revert — a product default that is correct here and WRONG in a combined
 *            tree. Merging it as-is would turn the eLGU demo into a second
 *            barangay one, which is the exact failure the upstream commit that
 *            created the two Vercel projects was written to prevent.
 *   keep   — barangay-specific, and harmless or useful upstream.
 *   drop   — exists only because this is a separate repository.
 *   human  — documentation that has to be read and reconciled, not merged.
 */
const DIVERGENCE = {
  // The three that flip the product. These are the dangerous ones.
  'vite.config.ts': ['revert', 'VITE_PRODUCT must default to municipal again'],
  'src/lib/demoServer.ts': ['revert', 'VITE_DEMO_TIER must default to municipal again'],
  'src/lib/catalogue.tsx': [
    'revert',
    'DEFAULT_TIER / DEFAULT_PRODUCT_NAME must go back to municipal — they are read at first paint',
  ],

  // Deployment configuration that only makes sense for a one-product repo.
  'render.yaml': ['drop', 'upstream has its own blueprint with both demos and the owner portal'],
  'docker-compose.yml': ['revert', 'remove the DEPLOYMENT_TIER / BARANGAY_ID defaults'],
  'server/.env.example': ['revert', 'remove the commented tier block'],

  // Naming.
  'package.json': ['revert', 'name goes back to elgu-citizen-portal'],
  'package-lock.json': ['revert', 'same name field'],

  // Documentation.
  'SPLIT.md': ['drop', 'it describes the split; there is no split once merged'],
  'README.md': ['human', 'upstream README covers both tiers'],
  'CLAUDE.md': ['human', 'drop the split banner; keep anything else learned here'],
  'DEPLOY.md': ['human', 'drop the split banner'],

  // This file.
  'scripts/check-upstream-drift.mjs': ['drop', 'nothing to check once there is one repository'],
}

// ---------------------------------------------------------------------------

let upstreamRef = process.env.UPSTREAM_REF
if (!upstreamRef) {
  const remotes = git('remote').split('\n').filter(Boolean)
  if (!remotes.includes('upstream')) {
    console.error(
      '\nNo `upstream` remote, so there is nothing to compare against. Add it:\n\n' +
      `  git remote add upstream ${UPSTREAM_URL}\n` +
      `  git fetch upstream ${UPSTREAM_BRANCH}\n\n` +
      'SPLIT.md explains why it is not configured by default — a `git pull` is the\n' +
      'wrong reflex here. Set UPSTREAM_REF to compare against something else.\n'
    )
    process.exit(2)
  }
  upstreamRef = `upstream/${UPSTREAM_BRANCH}`
}

let tip
try {
  tip = git('rev-parse', upstreamRef)
} catch {
  console.error(`\nCannot resolve ${upstreamRef}. Fetch it first:\n\n  git fetch upstream ${UPSTREAM_BRANCH}\n`)
  process.exit(2)
}

const base = git('merge-base', tip, 'HEAD')
// Files *this* repository changed since the fork — not files that differ from
// upstream's tip, which would also count upstream's own later work and make
// the gap look like ours.
const changed = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean)

const declared = new Set(Object.keys(DIVERGENCE))
const undeclared = changed.filter((f) => !declared.has(f))
const stale = [...declared].filter((f) => !changed.includes(f))

const aheadUpstream = git('rev-list', '--count', `${base}..${tip}`)
const aheadHere = git('rev-list', '--count', `${base}..HEAD`)
const fastForward = base === tip

console.log('')
console.log(`upstream   ${upstreamRef} @ ${tip.slice(0, 7)}`)
console.log(`fork point ${base.slice(0, 7)}`)
console.log(`ahead      this repo +${aheadHere}, upstream +${aheadUpstream}`)
console.log(
  fastForward
    ? '\nIntegration today is a FAST-FORWARD — upstream has not moved since the fork.\n' +
      'There is nothing to reconcile, only the `revert` rows below to undo.'
    : `\nUpstream has moved by ${aheadUpstream} commit(s), so integration is a real merge.\n` +
      'Conflicts can only arise in the files listed below.'
)

if (undeclared.length) {
  console.error(`\n${undeclared.length} file(s) changed here that the manifest does not declare:\n`)
  for (const f of undeclared) console.error('  ' + f)
  console.error(
    '\nDivergence grew. That is allowed and is not allowed to be silent. Either make\n' +
    'the change upstream instead, or add the file to DIVERGENCE in this script with\n' +
    'what integration must do to it.\n'
  )
}

if (stale.length) {
  console.error(`\n${stale.length} declared file(s) no longer differ from upstream:\n`)
  for (const f of stale) console.error('  ' + f)
  console.error('\nRemove them from DIVERGENCE — a manifest that overstates the gap stops being read.\n')
}

if (undeclared.length || stale.length) process.exit(1)

const width = Math.max(...changed.map((f) => f.length))
const order = { revert: 0, drop: 1, human: 2, keep: 3 }
console.log(`\n${changed.length} file(s) diverge, all declared. At integration:\n`)
for (const f of changed.sort((a, b) => order[DIVERGENCE[a][0]] - order[DIVERGENCE[b][0]] || a.localeCompare(b))) {
  const [action, why] = DIVERGENCE[f]
  console.log(`  ${action.padEnd(6)} ${f.padEnd(width)}  ${why}`)
}
console.log('\nupstream drift ok\n')
