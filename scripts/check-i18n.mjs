// What the language toggle actually has to switch.
//
// The dictionaries cannot drift apart — `fil` is typed `Record<StringKey,
// string>`, so a missing translation is a compile error. What the type system
// cannot see is the other three ways a string stays English anyway, and all
// three had happened by the time this was written:
//
//   1. A date formatted with a hard-coded `'en-PH'`, so "October" appeared in
//      the middle of a Filipino screen — or, worse, a shared formatter that
//      *took* a locale and defaulted it to `'en-PH'`, so every call site
//      compiled and none of them passed one.
//   2. An English literal rendered straight out of a component — "just now",
//      "yesterday", "Go back" — never passing through `t()` at all.
//   3. A key whose Filipino is a copy of its English, which reads as
//      translated and is not.
//
// None of those is visible to the compiler and all of them are invisible to
// anyone testing in English, which is everyone writing the code.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// The staff and barangay consoles stay English on purpose — see CLAUDE.md.
const CONSOLE_DIRS = ['src/screens/staff', 'src/screens/barangay']
const CONSOLE_FILES = [
  'src/components/MarkUpload.tsx',
  'src/components/CertificateCatalogue.tsx',
]

/**
 * Keys whose Filipino is deliberately the same text as the English.
 *
 * Loanwords Filipino uses unchanged, words that are already Filipino, product
 * names, and the official names of documents and offices — which CLAUDE.md
 * keeps untranslated everywhere, because they are what a resident has to say
 * at the counter. Anything *not* on this list that comes back identical is a
 * translation somebody forgot, so the list is the decision and the check is
 * the reminder.
 */
const SAME_IN_BOTH = new Set([
  'id.cardLabel', 'id.cardLabelBarangay',
  'auth.barangay', 'mydata.barangay', 'tier.barangay', 'brgy.title', 'brgy.hallCaptain',
  'auth.email', 'profile.email', 'help.email', 'auth.password', 'profile.account',
  'nav.profile', 'profile.title', 'notif.kindAdvanced', 'incident.videoFile',
  'id.title', 'privacy.contactTitle', 'docCheck.kindReceipt',
  'pay.reference', 'pay.refShort', 'docCheck.reference',
  'verify.title', 'docCheck.codeLabel', 'detail.documentCode',
  // The demo panel: a place, a person and a Filipino word. "Barangay
  // Poblacion" names somewhere, "Maria Santos" is the seeded resident, and
  // "Kagawad" is already the Filipino for the office.
  'demo.tierBarangay', 'demo.roleResident', 'demo.roleKagawad',
  // Two place names and the word "Barangay", which is the Filipino word
  // already — "Barangay Poblacion, Malasiqui" is what is said in both
  // languages, the same rule 'tier.barangay' is on this list for.
  'auth.barangayOf',
])

const walk = (dir) =>
  readdirSync(join(ROOT, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
  })

// `src/lib` is in here because that is where the one this check first missed
// was hiding: the shared ready-date formatter, not a screen. The demo server
// is excluded — it stands in for the API, and the API's own text is English by
// the same rule that leaves the service catalogue as authored.
const LIB_EXCLUDED = ['src/lib/demoServer.ts', 'src/lib/money.ts']

const residentFiles = ['src/screens', 'src/components', 'src/lib']
  .flatMap(walk)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .filter((f) => !CONSOLE_DIRS.some((d) => f.startsWith(d)))
  .filter((f) => !CONSOLE_FILES.includes(f))
  .filter((f) => !LIB_EXCLUDED.includes(f))

const problems = []

// ---- 1. a locale nailed to one language -----------------------------------
for (const file of residentFiles) {
  readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
    if (/toLocale\w*String\(\s*['"](en|fil)-PH['"]/.test(line)) {
      problems.push(
        `${file}:${i + 1}  a date is formatted with a fixed locale — ` +
        `use \`locale\` from useT() so it follows the toggle`
      )
    }
    // A defaulted locale parameter is the same bug wearing a disguise: it
    // compiles everywhere and is passed nowhere.
    if (/\blocale\s*[:=]?[^,)]*=\s*['"](en|fil)[-\w]*['"]/.test(line)) {
      problems.push(
        `${file}:${i + 1}  a locale parameter defaults to a fixed language — ` +
        `make it required so every caller has to pass one`
      )
    }
  })
}

// ---- 2. English prose rendered without t() --------------------------------
//
// Deliberately a short list of the phrases that actually slipped through,
// rather than a general English detector: a heuristic that flags every capital
// letter gets switched off within a week.
const PROSE = [
  /return '(just now|yesterday|today|tomorrow)'/i,
  /`\$\{\w+\}[mhd] ago`/,
  /aria-label="(?!\s*$)[A-Z][a-z]+ ?[a-z]*"/,
]
for (const file of residentFiles) {
  readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
    for (const rule of PROSE) {
      if (rule.test(line)) {
        problems.push(`${file}:${i + 1}  English rendered without t(): ${line.trim().slice(0, 90)}`)
        break
      }
    }
  })
}

// ---- 3. a "translation" that is a copy ------------------------------------
const strings = readFileSync(join(ROOT, 'src/i18n/strings.ts'), 'utf8').split('\n')
const parse = (from, to) => {
  const out = {}
  for (let i = from; i < to; i++) {
    const m = /^\s*'([^']+)':\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),?\s*$/.exec(strings[i])
    if (m) out[m[1]] = m[2].slice(1, -1)
  }
  return out
}
const endOfEn = strings.findIndex((l) => l.startsWith('} as const'))
const startOfFil = strings.findIndex((l) => l.startsWith('export const fil'))
const en = parse(0, endOfEn)
const fil = parse(startOfFil, strings.length)

for (const key of Object.keys(en)) {
  if (fil[key] === en[key] && !SAME_IN_BOTH.has(key)) {
    problems.push(
      `src/i18n/strings.ts  '${key}' is the same in both dictionaries (${JSON.stringify(en[key]).slice(0, 60)}) — ` +
      `translate it, or add it to SAME_IN_BOTH with the reason it stays`
    )
  }
}
for (const key of SAME_IN_BOTH) {
  if (en[key] === undefined) {
    problems.push(`scripts/check-i18n.mjs  SAME_IN_BOTH lists '${key}', which no longer exists`)
  } else if (fil[key] !== en[key]) {
    problems.push(
      `scripts/check-i18n.mjs  '${key}' is on SAME_IN_BOTH but has been translated — remove it from the list`
    )
  }
}

// ---- 4. Filipino sitting in the English dictionary -------------------------
//
// The greeting read "Magandang araw," in `en` from the day the toggle was
// added, so the English screen opened in Filipino. Only a few markers, because
// the two languages share a great deal of vocabulary and a wide net here would
// flag "Barangay" on every other line.
const FILIPINO_MARKERS = /\b(magandang|mga |ang |ng |sa iyong|hindi|maaari|kailangan|iyong)\b/i
for (const [key, text] of Object.entries(en)) {
  if (FILIPINO_MARKERS.test(text) && !SAME_IN_BOTH.has(key)) {
    problems.push(`src/i18n/strings.ts  en['${key}'] looks like Filipino: ${JSON.stringify(text).slice(0, 70)}`)
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s) with the language toggle:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('')
  process.exit(1)
}
console.log(`i18n ok — ${Object.keys(en).length} keys, ${residentFiles.length} resident files checked`)
