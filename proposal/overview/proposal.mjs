/**
 * The proposal: a covering letter to the mayor, a short overview, then every
 * control in every portal with the icon it actually carries.
 *
 * One document per local government. What changes between them is the
 * addressee and a handful of words; the system described is the same one.
 */
import { icon, FACES, PORTALS, esc } from './build.mjs'
import { FIRM, titleFor, placeFor } from './lgus.mjs'

const TODAY = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })

const PILLARS = [
  {
    icon: 'landmark',
    title: 'Both tiers of government',
    body: 'The hall and every barangay in it, each with its own console. The tier residents deal with most in a year is the one most portals leave out.',
  },
  {
    icon: 'map-pin',
    title: 'Built around the wasted trip',
    body: 'An ordered route to every document, ready dates computed over your own holiday calendar, and a counter check anybody can run from a phone.',
  },
  {
    icon: 'shield-check',
    title: 'The server establishes its own facts',
    body: 'The browser never asserts a fee, a workflow position or a payment. Roles are enforced server-side, so a hidden tab is a courtesy and the refusal is the control.',
  },
  {
    icon: 'wifi-off',
    title: 'It works on one bar of signal',
    body: 'Hotlines, the digital ID and search read from a device cache. Forms save on every keystroke and send themselves when the signal returns.',
  },
]

/**
 * The control inventory describes the reference catalogue — Malasiqui's 17
 * services across 6 offices. In a proposal those numbers read as a statement
 * about the reader's own LGU, which they are not: every LGU publishes its own
 * Citizen's Charter and the catalogue is seeded from it. So the counts come
 * out and the wording stays true for whoever is reading.
 *
 * A city is not a municipality either, and a City Mayor reading "Municipal
 * staff console" is being handed somebody else's document.
 */
function forLgu(text, lgu) {
  let t = text
    .replace(/17 services across the hall\u2019s 6 offices/g, 'Every service the hall publishes, by office')
    .replace(/the hall\u2019s 6 offices/g, 'each of the hall\u2019s offices')
  if (lgu.kind === 'city') t = t.replace(/\bMunicipal staff console\b/g, 'City staff console')
  return t
}

function letterPage(lgu) {
  const mayorTitle = titleFor(lgu)
  const place = placeFor(lgu)
  const rosterLine = lgu.barangays
    ? `Your ${lgu.barangays} barangays are already loaded and checked against the ${place}'s own listing.`
    : `Your barangay roster is loaded from the PSGC listing for ${lgu.name} at setup.`

  return `
  <section class="letter">
    <header class="lh">
      <div>
        <p class="firm">${esc(FIRM.name)}</p>
        <p class="firm-sub">Business Automation &middot; Local Government Systems</p>
      </div>
      <p class="date">${TODAY}</p>
    </header>

    <div class="addressee">
      <p>The Honorable <span class="blank"></span></p>
      <p>${esc(mayorTitle)}</p>
      <p>${esc(lgu.name)}, Pangasinan</p>
    </div>

    <p class="salutation">Dear Mayor <span class="blank short"></span>,</p>

    <p class="subject">Subject: &nbsp;Proposal &mdash; eLGU Citizen Portal for ${esc(lgu.name)}</p>

    <div class="body">
      <p>We respectfully submit for your consideration the <strong>eLGU Citizen Portal</strong>: a complete
      electronic government system for ${esc(lgu.name)} and for every barangay within it.</p>

      <p>The expensive part of transacting with a local government is rarely the fee. It is the wasted
      trip &mdash; arriving at the wrong counter, or at the right one without the document that had to
      come first. Every part of this system is built to remove that trip. Each document carries an
      ordered, bilingual route telling a resident what to get first and where it comes from. Expected
      release dates are computed over your own holiday calendar, and the clock stops while a request
      waits on the resident to pay, so your offices are never reported late for a delay that was not
      theirs.</p>

      <p><strong>It covers both tiers of government, which is unusual.</strong> Most portals stop at the
      hall. This one also runs the barangay &mdash; the clearance, the certificate of residency, the
      certificate of indigency, the record of inhabitants, the blotter and the board of notices &mdash;
      because that is the tier residents deal with most, and because the two constantly reference each
      other. ${rosterLine}</p>

      <p>Every document the system issues is a real PDF carrying your seal, the signatures of the
      officials who released it, and a QR code. A bank, an employer or a clerk at another counter can
      scan it and see what your office actually recorded, without needing an account. Residents can
      file, attach requirements by photo, pay, book an appointment with a queue number, and carry a
      digital ID that a counter can verify with a single-use code.</p>

      <p>The system is built and working today, with 1,645 automated checks running against a live
      database. <strong>We would be glad to demonstrate it to you and your department heads at your
      convenience, at no cost and with no obligation.</strong></p>

      <p>The pages that follow give a short overview and then list every control in each of the five
      portals, so your offices can see exactly what the system does before deciding anything.</p>

      <p>Thank you for your time and for your service to ${esc(lgu.name)}.</p>
    </div>

    <p class="closing">Respectfully yours,</p>

    <div class="signatories">
      ${FIRM.people.map((p) => `
        <div class="sig">
          <div class="rule"></div>
          <p class="sig-name">${esc(p.name.toUpperCase())}</p>
          <p class="sig-title">${esc(p.title)}</p>
          <p class="sig-contact">${esc(p.phone)}</p>
          <p class="sig-contact">${esc(p.email)}</p>
        </div>`).join('')}
    </div>

    <p class="firm-foot">${esc(FIRM.name)}</p>
  </section>`
}

function overviewPage(lgu) {
  const totals = PORTALS.map((p) => ({ name: forLgu(p.name, lgu), n: p.groups.reduce((a, g) => a + g.items.length, 0) }))
  return `
  <section class="page overview">
    <h2>What the system is</h2>
    <p class="lede">One system serves five portals: a mobile app for residents, a console for each of your
    offices, a console for each barangay, a read-only view for the barangay council, and a public document
    check that needs no account at all.</p>

    <div class="pillars">
      ${PILLARS.map((p) => `<div class="pillar"><div class="ph">${icon(p.icon, { size: 17 })}<h4>${esc(p.title)}</h4></div><p>${p.body}</p></div>`).join('')}
    </div>

    <div class="toc">
      <div><span>The five portals</span><span>Controls</span></div>
      ${totals.map((t) => `<div><span>${esc(t.name)}</span><b>${t.n}</b></div>`).join('')}
    </div>

    <p class="note"><strong>What we would need from your office.</strong> The list of services with their
    fees, requirements and processing times as published in your Citizen's Charter; your emergency
    hotline numbers; this year's holiday proclamation and your own local holidays; your barangay roster
    and the officials who sign for each; and your seal. Everything else is configured in the system
    itself by your administrator &mdash; no developer is needed to correct a phone number or declare a
    holiday.</p>
  </section>`
}

function portalPage(p, n, lgu) {
  const tone = {
    navy: ['#1e3a8a', '#eef2fb'], slate: ['#334155', '#eef1f5'], green: ['#166534', '#ecf5ee'],
    amber: ['#92400e', '#fdf4e7'], gold: ['#854d0e', '#fdf6e3'],
  }[p.tone]
  return `
  <section class="portal" style="--ink:${tone[0]};--wash:${tone[1]}">
    <div class="p-head">
      <div class="p-num">${n}</div>
      <div>
        <h2>${esc(forLgu(p.name, lgu))}</h2>
        <p class="p-who"><strong>Who uses it.</strong> ${forLgu(p.who, lgu)}</p>
        <p class="p-shape">${forLgu(p.shape, lgu)}</p>
      </div>
    </div>
    ${p.groups.map((g) => `
      <div class="group">
        <h3>${esc(g.name)}</h3>
        <p class="g-note">${forLgu(g.note, lgu)}</p>
        <ul class="controls">
          ${g.items.map((it) => `<li><span class="ic-box">${icon(it.icon)}</span><span class="c-text"><span class="c-label">${esc(it.label)}</span><span class="c-what">${forLgu(it.what, lgu)}</span></span></li>`).join('')}
        </ul>
      </div>`).join('')}
  </section>`
}

export function html(lgu) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>eLGU Citizen Portal — Proposal for ${esc(lgu.name)}</title>
<style>
${FACES}
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#1e3a8a;--navy950:#111c44;--gold:#b7791f;--line:#dde3ee;--mute:#5b6478;--ink:#1e3a8a}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'InterP',system-ui,sans-serif;font-size:9.6pt;line-height:1.5;color:#1b2235}
h1,h2,h3,h4,.disp{font-family:'JakartaP','InterP',sans-serif}
.ic{display:block}
.dot{display:block;width:7px;height:7px;border-radius:99px;background:currentColor;opacity:.45}

/* ---------- the letter ---------- */
.letter{page-break-after:always;min-height:252mm;display:flex;flex-direction:column}
.lh{display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2.5px solid var(--navy);padding-bottom:9px;margin-bottom:22px}
.firm{font-family:'JakartaP',sans-serif;font-weight:800;font-size:15.5pt;color:var(--navy);letter-spacing:-.01em}
.firm-sub{font-size:7.6pt;color:var(--mute);letter-spacing:.055em;text-transform:uppercase;font-weight:600;margin-top:2px}
.date{font-size:9.2pt;color:var(--mute);padding-top:5px}
.addressee p{font-size:10pt;line-height:1.55}
.blank{display:inline-block;width:62mm;border-bottom:1px solid #9aa3b5;height:1em;vertical-align:-2px}
.blank.short{width:42mm}
.salutation{margin-top:16px;font-size:10pt}
.subject{margin-top:14px;font-size:10pt;font-weight:700;color:var(--navy950)}
.body{margin-top:12px}
.body p{font-size:9.9pt;line-height:1.62;margin-top:9px;text-align:justify}
.body strong{color:var(--navy950)}
.closing{margin-top:18px;font-size:9.9pt}
.signatories{display:flex;gap:26px;margin-top:30px}
.sig{flex:1 1 0}
.sig .rule{border-top:1px solid #4a5568;margin-bottom:5px}
.sig-name{font-family:'JakartaP',sans-serif;font-weight:800;font-size:9.6pt;color:var(--navy950);letter-spacing:.01em}
.sig-title{font-size:8.6pt;color:var(--navy);font-weight:600;margin-top:1px}
.sig-contact{font-size:8.4pt;color:var(--mute);margin-top:1px}
.firm-foot{margin-top:16px;font-family:'JakartaP',sans-serif;font-weight:700;font-size:9pt;color:var(--navy);letter-spacing:.02em}

/* ---------- overview ---------- */
.page{page-break-before:always}
h2{font-size:17pt;font-weight:800;color:var(--navy950);letter-spacing:-.018em;line-height:1.15}
.lede{font-size:10pt;color:#404a60;margin-top:9px;max-width:162mm;line-height:1.6}
.pillars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
.pillar{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fbfcfe}
.pillar .ph{display:flex;align-items:center;gap:7px;color:var(--navy)}
.pillar h4{font-size:10pt;font-weight:700;color:var(--navy950)}
.pillar p{font-size:8.7pt;color:#44506a;margin-top:6px;line-height:1.52}
.toc{margin-top:16px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.toc div{display:flex;justify-content:space-between;padding:7px 13px;font-size:9pt;border-top:1px solid var(--line)}
.toc div:first-child{border-top:0;background:#f4f7fc;font-weight:700;color:var(--navy950);font-size:8.4pt;letter-spacing:.03em;text-transform:uppercase}
.toc b{color:var(--navy);font-weight:700}
.note{margin-top:16px;border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;
  padding:12px 14px;font-size:8.9pt;line-height:1.56;color:#44506a;background:#fdfbf6}
.note strong{color:var(--navy950)}

/* ---------- portals ---------- */
.portal{page-break-before:always}
.p-head{display:flex;gap:14px;align-items:flex-start;border-left:5px solid var(--ink);padding-left:14px;margin-bottom:6px}
.p-num{flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:var(--ink);color:#fff;
  font-family:'JakartaP',sans-serif;font-weight:800;font-size:13pt;display:flex;align-items:center;justify-content:center;margin-top:3px}
.p-head h2{color:var(--ink)}
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
</style></head>
<body>
${letterPage(lgu)}
${overviewPage(lgu)}
${PORTALS.map((p, i) => portalPage(p, i + 1, lgu)).join('')}
</body></html>`
}

/** Icons this document draws. */
export function iconNames() {
  const names = []
  for (const p of PORTALS) for (const g of p.groups) for (const i of g.items) names.push(i.icon)
  for (const p of PILLARS) names.push(p.icon)
  return names.filter(Boolean)
}
