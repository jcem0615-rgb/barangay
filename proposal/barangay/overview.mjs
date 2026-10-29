/**
 * The eBarangay Portal overview: cover, what the system is, then every control
 * in every portal with the icon it actually carries.
 *
 * This is the feature reference, not the proposal. `proposal.mjs` wraps the
 * same control inventory in a covering letter to a Punong Barangay; this one
 * is the document you hand somebody who has already said yes and wants to know
 * what they are getting, or who is comparing it against what they run now.
 *
 * It shares the builder with the municipal overview — the lucide icon loader,
 * the embedded fonts, the LogicGrid marks — and nothing else. The control list
 * is `./controls.mjs`, which is the barangay product's own and deliberately
 * not a filter over the municipal one: a screen added to the hall must not
 * appear in a document describing a barangay's system.
 */
import { icon, logicGridMark, logicGridWordmark, FACES, esc } from '../overview/build.mjs'
import { PORTALS } from './controls.mjs'
import { PRODUCT } from './addressees.mjs'

const TODAY = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })

const total = PORTALS.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.items.length, 0), 0)

const FACTS = [
  [String(PORTALS.length), 'portals'],
  [String(total), 'controls, one by one'],
  ['6', 'certificates it issues'],
  ['2', 'books the law asks for'],
]

const PILLARS = [
  {
    icon: 'badge-check',
    title: 'A certificate that can be checked',
    body: 'Every clearance, residency and indigency certificate comes out as a real PDF carrying the barangay’s seal, both officials’ signatures and a QR. A bank or an employer scans it and sees what the office actually recorded — no account, no app.',
  },
  {
    icon: 'megaphone',
    title: 'The board, on every phone',
    body: 'A notice taped outside the hall works for whoever walks past it that week. The same notice posted here reaches every resident who has the app, and an urgent one rings their phone.',
  },
  {
    icon: 'book-text',
    title: 'The books the law asks you to keep',
    body: 'The Record of Barangay Inhabitants and the Katarungang Pambarangay blotter, with the summons it issues — kept as records that count themselves rather than as a filing cabinet.',
  },
  {
    icon: 'shield-check',
    title: 'Nothing here is readable outside',
    body: 'The blotter and the household register reach the barangay’s own console and nowhere else — not the municipality, not another barangay, not any resident, and not the barangay’s own councillors.',
  },
]

const tone = {
  navy: ['#1e3a8a', '#eef2fb'],
  slate: ['#334155', '#eef1f5'],
  green: ['#166534', '#ecf5ee'],
  amber: ['#92400e', '#fdf4e7'],
  gold: ['#854d0e', '#fdf6e3'],
}

function portalPage(p, n) {
  const [ink, wash] = tone[p.tone]
  return `
  <section class="portal" style="--ink:${ink};--wash:${wash}">
    <div class="p-head">
      <div class="p-num">${n}</div>
      <div>
        <h2>${esc(p.name)}</h2>
        <p class="p-who"><strong>Who uses it.</strong> ${p.who}</p>
        <p class="p-shape">${p.shape}</p>
      </div>
    </div>
    ${p.groups.map((g) => `
      <div class="group">
        <h3>${esc(g.name)}</h3>
        <p class="g-note">${g.note}</p>
        <ul class="controls">
          ${g.items.map((it) => `<li>
            <span class="ic-box">${icon(it.icon)}</span>
            <span class="c-text"><span class="c-label">${esc(it.label)}</span><span class="c-what">${it.what}</span></span>
          </li>`).join('')}
        </ul>
      </div>`).join('')}
  </section>`
}

/**
 * The closing page: what the system does not do.
 *
 * It is a page of its own rather than a footnote, and it is in the feature
 * reference rather than only in the proposal, because this is the document
 * somebody reads *after* buying. Every item on it is something a barangay
 * would otherwise discover in its first week — and discovering it then,
 * rather than here, is what makes a working system feel broken.
 */
function limitsPage() {
  const LIMITS = [
    ['philippine-peso', 'No fee is paid online',
      'The barangay takes its money at the hall on collection, exactly as it does now. The system quotes the amount and freezes it onto the request so a later change never rewrites what somebody was already told — it does not collect it.'],
    ['pen-line', 'A signature is a scan of a real one',
      'The official signs on paper once, an administrator uploads the picture once, and the renderer draws it on every certificate afterwards. It makes the paper look the way a counter expects; it makes nothing tamper-evident. The QR and its code are what prove a document.'],
    ['mail', 'Email and SMS need a service connected',
      'Password resets, the summons reminder and the urgent-notice fan-out all go through a mail and messaging service the deployment supplies. Without one they are recorded and not sent, which is worse than it sounds — so it is on the pre-launch list.'],
    ['scan-line', 'A photocopy still verifies',
      'It carries a genuine code and the data is genuine, so the check answers honestly. Nothing printed can do better. What the system adds is a count of how often a document has been checked, which is the only trace a circulating copy leaves.'],
    ['file-question', 'Nothing checks what a certificate attests',
      'A clearance saying the holder has no pending case says so because the office releasing it says so. The blotter names its parties as free text precisely so that it is not a lookup, so there is nothing to cross-check against — and the console says this where the officer presses release.'],
    ['scale', 'The blotter records the process, it does not conduct it',
      'There is no Pangkat ng Tagapagkasundo, no prescribed KP form and no Certificate to File Action. Those are paper instruments with legal effect; an app that printed one would be claiming a standing it does not have.'],
  ]

  return `
  <section class="portal limits" style="--ink:#334155;--wash:#eef1f5">
    <div class="p-head">
      <div class="p-num">&mdash;</div>
      <div>
        <h2>What it does not do</h2>
        <p class="p-who"><strong>Said here rather than found out later.</strong> Every item below is something a
        barangay would otherwise meet in its first week, and meeting it then is what makes a working system
        feel broken.</p>
      </div>
    </div>
    <ul class="controls" style="margin-top:14px">
      ${LIMITS.map(([ic, label, what]) => `<li>
        <span class="ic-box">${icon(ic)}</span>
        <span class="c-text"><span class="c-label">${esc(label)}</span><span class="c-what">${what}</span></span>
      </li>`).join('')}
    </ul>

    <div class="group">
      <h3>What the barangay supplies</h3>
      <p class="g-note">Everything after this is set in the console by the barangay administrator &mdash; no
      developer is needed to change a fee, correct a phone number or issue a clerk an account.</p>
      <ul class="controls">
        ${[
          ['file-text', 'The certificates you issue', 'And what you charge for each. The six seeded types and their fees are placeholders.'],
          ['pen-line', 'The wording on each certificate', 'The attestation goes out over the Punong Barangay’s name, so it has to be the barangay’s own form, not ours.'],
          ['landmark', 'The hall’s address, hours and number', 'Shown to a resident the moment a certificate is ready for pickup, so a wrong line here sends somebody to a closed hall.'],
          ['users', 'Who holds the two offices', 'The Punong Barangay and the Barangay Secretary. Both names are printed on every certificate.'],
          ['image-up', 'The seal and the two signatures', 'Scans, PNG or JPEG. Drawn onto every certificate from then on, and frozen into each one at issue.'],
          ['phone', 'Your emergency numbers', 'The seeded municipal hotlines are a sample town’s and apply nowhere else. 911 and 143 are correct nationwide.'],
        ].map(([ic, label, what]) => `<li>
          <span class="ic-box">${icon(ic)}</span>
          <span class="c-text"><span class="c-label">${esc(label)}</span><span class="c-what">${what}</span></span>
        </li>`).join('')}
      </ul>
    </div>

    <p class="note"><strong>It is one half of a two-tier system.</strong> The same software runs a municipal
    hall, so a barangay on this today joins its municipality’s deployment later as a setting rather than a
    migration &mdash; the same records, nothing re-entered. That is not a promise about a future version; it
    is why the system is built the way it is.</p>
  </section>`
}

export function html() {
  const totals = PORTALS.map((p) => ({
    name: p.name,
    n: p.groups.reduce((a, g) => a + g.items.length, 0),
  }))

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(PRODUCT.name)} — Overview</title>
<style>
${FACES}
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#1e3a8a;--navy950:#111c44;--green:#166534;--gold:#b7791f;--ink:#166534;--line:#dde3ee;--mute:#5b6478}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'InterP',system-ui,sans-serif;font-size:9.6pt;line-height:1.5;color:#1b2235}
h1,h2,h3,h4,.disp{font-family:'JakartaP','InterP',sans-serif}
.ic{display:block}
.dot{display:block;width:7px;height:7px;border-radius:99px;background:currentColor;opacity:.45}

/* ---------- LogicGrid brand ---------- */
.lg-badge{display:block}
.lg-glyph{display:inline-block;vertical-align:middle;border-radius:3px}

/* ---------- cover ---------- */
.cover{height:254mm;display:flex;flex-direction:column;page-break-after:always}
.cover-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.cover-head-text{flex:1 1 auto;padding-top:4px}
.cover-head .lg-badge{flex:0 0 auto}
.eyebrow{font-size:7.8pt;font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:var(--gold);margin-bottom:7px}
.cover h1{font-size:28.5pt;font-weight:800;line-height:1.05;letter-spacing:-.022em;color:var(--navy950)}
.cover .sub{font-size:11.4pt;color:var(--green);margin-top:9px;font-weight:500;max-width:118mm;line-height:1.4}
.cover .lede{font-size:10pt;color:#404a60;margin-top:14px;max-width:158mm;line-height:1.6}
.cover .lede strong{color:var(--navy950);font-weight:700}
.rule{height:4px;width:62px;background:var(--gold);border-radius:4px;margin:16px 0}

.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:20px}
.fact{border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:#fbfcfe}
.fact b{display:block;font-family:'JakartaP',sans-serif;font-size:17pt;font-weight:800;color:var(--green);line-height:1}
.fact span{display:block;font-size:7.6pt;color:var(--mute);margin-top:4px;line-height:1.3}

.pillars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.pillar{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#fbfcfe}
.pillar .ph{display:flex;align-items:center;gap:7px;color:var(--green)}
.pillar h4{font-size:9.8pt;font-weight:700;color:var(--navy950)}
.pillar p{font-size:8.5pt;color:#44506a;margin-top:5px;line-height:1.5}

.toc{margin-top:16px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.toc div{display:flex;justify-content:space-between;padding:7px 13px;font-size:9pt;border-top:1px solid var(--line)}
.toc div:first-child{border-top:0;background:#f4f7fc;font-weight:700;color:var(--navy950);font-size:8.4pt;letter-spacing:.03em;text-transform:uppercase}
.toc b{color:var(--green);font-weight:700}

.cover-foot{flex:1 1 auto;display:flex;justify-content:space-between;align-items:flex-end;
  border-top:1px solid var(--line);margin-top:18px;padding-top:10px;font-size:8pt;color:var(--mute)}

/* ---------- portals ---------- */
.portal{page-break-before:always}
.p-head{display:flex;gap:14px;align-items:flex-start;border-left:5px solid var(--ink);padding-left:14px;margin-bottom:6px}
.p-num{flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:var(--ink);color:#fff;
  font-family:'JakartaP',sans-serif;font-weight:800;font-size:13pt;display:flex;align-items:center;justify-content:center;margin-top:3px}
.p-head h2{font-size:17pt;font-weight:800;letter-spacing:-.018em;line-height:1.15;color:var(--ink)}
.p-who{font-size:9.4pt;color:#3c465c;margin-top:7px;max-width:158mm}
.p-shape{font-size:9.2pt;color:var(--mute);margin-top:5px;max-width:158mm;line-height:1.56}

.group{margin-top:16px;break-inside:avoid}
.group h3{font-size:11.4pt;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.g-note{font-size:8.9pt;color:var(--mute);margin-top:4px;max-width:160mm;line-height:1.52}
ul.controls{list-style:none;margin-top:9px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
ul.controls li{display:flex;gap:11px;padding:9px 12px;border-top:1px solid var(--line);break-inside:avoid;align-items:flex-start}
ul.controls li:first-child{border-top:0}
ul.controls li:nth-child(even){background:#fafbfd}
.ic-box{flex:0 0 auto;width:28px;height:28px;border-radius:7px;background:var(--wash);color:var(--ink);
  display:flex;align-items:center;justify-content:center;margin-top:1px}
.c-text{min-width:0}
.c-label{display:block;font-weight:700;font-size:9.4pt;color:#16203a}
.c-what{display:block;font-size:8.9pt;color:#4a5570;line-height:1.5;margin-top:2px}
.note{margin-top:16px;border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;
  padding:12px 14px;font-size:8.9pt;line-height:1.56;color:#44506a;background:#fdfbf6;break-inside:avoid}
.note strong{color:var(--navy950)}
</style></head>
<body>

<div class="cover">
  <div class="cover-head">
    <div class="cover-head-text">
      <p class="eyebrow">Feature reference</p>
      <h1>${esc(PRODUCT.name)}</h1>
      <p class="sub">A complete electronic records and services system for a Philippine barangay &mdash; and for a barangay alone.</p>
      <div class="rule"></div>
    </div>
    ${logicGridWordmark(132)}
  </div>
  <p class="lede">One system serves ${totals.length === 4 ? 'four' : String(totals.length)} portals. <strong>This document lists every control in each of
  them, one by one, with the icon it actually carries</strong> &mdash; and ends with what the system does not do.</p>

  <div class="facts">
    ${FACTS.map(([n, l]) => `<div class="fact"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}
  </div>

  <div class="pillars">
    ${PILLARS.map((p) => `<div class="pillar"><div class="ph">${icon(p.icon, { size: 17 })}<h4>${esc(p.title)}</h4></div><p>${p.body}</p></div>`).join('')}
  </div>

  <div class="toc">
    <div><span>The ${totals.length === 4 ? 'four' : String(totals.length)} portals</span><span>Controls</span></div>
    ${totals.map((t) => `<div><span>${esc(t.name)}</span><b>${t.n}</b></div>`).join('')}
    <div><span style="font-weight:700;color:var(--navy950)">What it does not do</span><b>&mdash;</b></div>
  </div>

  <div class="cover-foot">
    <span>Prepared by LogicGrid &middot; ${TODAY}</span>
    <span>Sample configuration: Barangay Poblacion, Malasiqui</span>
  </div>
</div>

${PORTALS.map((p, i) => portalPage(p, i + 1)).join('')}
${limitsPage()}

</body></html>`
}

/** Every icon this document draws, so they can all be loaded before rendering. */
export function iconNames() {
  const names = ['philippine-peso', 'pen-line', 'mail', 'scan-line', 'file-question', 'scale',
    'file-text', 'landmark', 'users', 'image-up', 'phone']
  for (const p of PORTALS) for (const g of p.groups) for (const i of g.items) names.push(i.icon)
  for (const p of PILLARS) names.push(p.icon)
  return names.filter(Boolean)
}

export { logicGridMark }
