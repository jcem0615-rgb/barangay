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
 *   feature— work done here that belongs upstream as-is. The barangay tier
 *            exists in both products, so a barangay feature is not something
 *            the eLGU tree has to be protected from — it is something it wants.
 *            These are the rows that make integration a merge rather than a
 *            fast-forward, and that is the cost the split was accepted for.
 */
const DIVERGENCE = {
  // The three that flip the product. These are the dangerous ones.
  'src/lib/demoServer.ts': ['revert', 'VITE_DEMO_TIER default to municipal again — but KEEP the complaint routes it also carries'],
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

  // Tier-neutral cleanups that belong upstream too, and are only here because
  // this is where they were noticed.
  'scripts/check-i18n.mjs': ['keep', "SAME_IN_BOTH entry for the dead 'auth.title' key went with it"],

  // ---- the barangay complaint feature -------------------------------------
  //
  // A resident complaining to their own barangay, with photo and video proof,
  // worked by the captain and the clerk. Entirely new surface: it takes
  // nothing away from the municipal tier and adds nothing to it, so every row
  // integrates as-is.
  'server/migrations/600_barangay_complaints.sql': ['feature', 'in this repo\'s reserved 600+ range, so it cannot collide with upstream\'s'],
  'scripts/check-migrations.mjs': ['feature', 'enforces the range split; keep it until the sequences are one again'],

  // ---- dark mode ----------------------------------------------------------
  // One attribute on <html>, no `dark:` class in any screen. Tier-neutral:
  // the municipal app wants it just as much.
  'src/lib/theme.tsx': ['feature', 'the provider; system-aware and persisted'],
  'src/components/ThemeToggle.tsx': ['feature', 'Light / Dark / Phone, beside the text-size control'],
  'src/index.css': ['feature', 'the dark block — variable remaps and the ambiguous-class overrides'],

  // ---- the build stamp ----------------------------------------------------
  // Tier-neutral: the municipal app wants to know which build it is just as
  // much, and the literal v1.0.0 this replaced was wrong in both.
  'src/lib/version.ts': ['feature', 'the three stamped values and the one-line form'],
  'src/screens/Profile.tsx': ['feature', 'appearance control, and the real version in place of a literal v1.0.0'],
  'src/screens/barangay/BarangayConsole.tsx': ['feature', 'the Complaints tab and the build footer'],
  'vite.config.ts': ['revert', 'VITE_PRODUCT default to municipal — but KEEP the define block that stamps the build'],

  // ---- the barangay logo --------------------------------------------------
  'server/migrations/601_barangay_logo.sql': ['feature', 'logo_key/type/updated_at on barangays'],
  'src/lib/barangayLogo.tsx': ['feature', 'fetched once, shared by the three places that draw it'],
  'server/test/barangay-logo.mjs': ['feature', '27 checks'],
  'src/components/IDCard.tsx': ['feature', 'the logo watermarked behind the card'],
  'src/screens/Dashboard.tsx': ['feature', 'the logo behind the dashboard'],
  'src/components/TopBar.tsx': ['feature', "the logo as the app's mark where no back arrow is"],
  'src/screens/barangay/BarangayOffice.tsx': ['feature', 'the logo upload, above the seal'],
  'server/src/marks.ts': ['keep', 'fixed "missing from every a certificate" — wrong for the seal upstream too'],
  'server/src/routes/barangay.ts': ['feature', 'the resident logo read'],
  'server/src/barangayComplaints.ts': ['feature', 'the status machine, serialiser and history writer both sides share'],
  'server/src/routes/barangayComplaints.ts': ['feature', 'the resident side'],
  'server/src/routes/barangayComplaintsStaff.ts': ['feature', 'the console side, mounted below the barangay gate'],
  'server/test/barangay-complaints.mjs': ['feature', '58 checks'],
  'src/screens/BarangayComplaintForm.tsx': ['feature', 'file one, with proof'],
  'src/screens/BarangayComplaints.tsx': ['feature', "the resident's own list and history"],
  'src/screens/barangay/BarangayComplaints.tsx': ['feature', 'the console tab: queue, figures, records'],

  // Existing files the feature touches. Each is additive.
  'server/src/index.ts': ['feature', 'mounts the resident router — and adds the media-src CSP fix, which belongs upstream on its own'],
  'server/src/uploads.ts': ['feature', 'MAX_COMPLAINT_VIDEO_SECONDS = 300'],
  'server/src/notifications.ts': ['feature', 'two notification kinds'],
  'server/src/push.ts': ['feature', 'both kinds are private on a lock screen'],
  'server/src/routes/barangayStaff.ts': ['feature', 'mounts the complaints sub-router below its gate'],
  'server/test/isolation.mjs': ['feature', 'registers the sub-router so its routes are walked — 44 routes became 48'],
  'server/package.json': ['feature', 'the test script'],
  'src/App.tsx': ['feature', 'two screens routed'],
  'src/lib/nav.tsx': ['feature', 'two screens declared'],
  'src/lib/api.ts': ['feature', 'the client methods and types'],
  'src/screens/BarangayHub.tsx': ['feature', 'the entry point residents actually look at'],
  'src/i18n/strings.ts': ['feature', "50 bilingual keys, plus the dead 'auth.title' removal"],

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
const order = { revert: 0, feature: 1, drop: 2, human: 3, keep: 4 }
console.log(`\n${changed.length} file(s) diverge, all declared. At integration:\n`)
for (const f of changed.sort((a, b) => order[DIVERGENCE[a][0]] - order[DIVERGENCE[b][0]] || a.localeCompare(b))) {
  const [action, why] = DIVERGENCE[f]
  console.log(`  ${action.padEnd(7)} ${f.padEnd(width)}  ${why}`)
}
console.log('\nupstream drift ok\n')
