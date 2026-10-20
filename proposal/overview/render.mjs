/**
 * The overview document: cover, system summary, then every control in every
 * portal with the icon it actually carries.
 */
import { icon, logicGridMark, logicGridWordmark, FACES, PORTALS, esc } from './build.mjs'

const TODAY = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })

const FACTS = [
  ['6', 'municipal offices'],
  ['17', 'municipal services'],
  ['6', 'barangay certificate types'],
  ['8', 'sectoral &amp; poverty programmes'],
  ['5', 'portals from one codebase'],
  ['165', 'controls, documented here'],
  ['50', 'database tables'],
  ['1,639', 'automated assertions'],
]

const PILLARS = [
  {
    icon: 'landmark',
    title: 'Both tiers of government',
    body: 'Most LGU portals stop at the municipal hall. This one also holds the barangay — the clearance, the certificate of residency, the record of inhabitants, the blotter, the board of notices. That is the tier most residents actually deal with in a given year, and the two constantly reference each other: the municipal business permit asks for the barangay clearance first.',
  },
  {
    icon: 'map-pin',
    title: 'Built around the wasted trip',
    body: 'The expensive part of dealing with an LGU is not the fee. It is turning up at the wrong counter, or at the right one without the document that had to come first. Every service carries an ordered, bilingual route; ready dates are computed over the municipality’s own holiday calendar; and the clock stops while a request waits on the resident to pay.',
  },
  {
    icon: 'shield-check',
    title: 'The server establishes its own facts',
    body: 'The browser never asserts a fee, a workflow position, a municipality or a payment. A fee is read off the request’s own assessment; a payment settles only on a signed callback from the gateway; the barangay is stamped from the register. Roles are a server-side fact — the shell a user gets is a rendering convenience, never a control.',
  },
  {
    icon: 'wifi-off',
    title: 'It works on one bar of signal',
    body: 'The emergency hotlines, the digital ID and service search all read from a device cache. A half-filled form is written to the phone on every keystroke, and a submission made offline queues and sends itself when the signal returns, carrying the time it was actually filled in.',
  },
]

const CHANGED = [
  {
    icon: 'ban',
    title: 'PhilSys has been removed',
    body: 'The number was typed at registration and stored, and nothing in this system ever called a PhilSys API — while the ID card printed “PhilSys Verified” over it, the profile showed a green tick, and the counter check returned its last four digits. A badge asserting an identity check nobody performed is worse than no badge, because a clerk reads it as one that happened. The claim, the database column and the masked digits are all gone. What remains is the verification this app really does perform: the ID’s own code, which lives ninety seconds, is consumed on first use and is checked server-side.',
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
    ${p.groups
      .map(
        (g) => `
      <div class="group">
        <h3>${esc(g.name)}</h3>
        <p class="g-note">${g.note}</p>
        <ul class="controls">
          ${g.items
            .map(
              (it) => `<li>
                <span class="ic-box">${icon(it.icon)}</span>
                <span class="c-text"><span class="c-label">${esc(it.label)}</span><span class="c-what">${it.what}</span></span>
              </li>`
            )
            .join('')}
        </ul>
      </div>`
      )
      .join('')}
  </section>`
}

export function html() {
  const totals = PORTALS.map((p) => ({
    name: p.name,
    n: p.groups.reduce((a, g) => a + g.items.length, 0),
  }))

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>eLGU Citizen Portal — Overview</title>
<style>
${FACES}
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#1e3a8a;--navy950:#111c44;--gold:#b7791f;--ink:#1e3a8a;--line:#dde3ee;--mute:#5b6478}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'InterP',system-ui,sans-serif;font-size:9.6pt;line-height:1.5;color:#1b2235}
h1,h2,h3,h4,.disp{font-family:'JakartaP','InterP',sans-serif}
.ic{display:block}
.dot{display:block;width:7px;height:7px;border-radius:99px;background:currentColor;opacity:.45}

/* ---------- LogicGrid lockup ---------- */
.lg{display:flex;align-items:center;gap:10px}
.lg-words{display:flex;flex-direction:column;line-height:1.12}
.lg-name{font-family:'JakartaP',sans-serif;font-weight:800;font-size:15pt;color:var(--navy);letter-spacing:-.015em}
.lg-tag{font-size:7.2pt;color:var(--mute);letter-spacing:.055em;text-transform:uppercase;font-weight:600}

/* ---------- cover ---------- */
.cover{height:252mm;display:flex;flex-direction:column;page-break-after:always}
.cover-top{flex:0 0 auto}
.cover-mid{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center}
.eyebrow{font-size:8pt;font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:var(--gold);margin-bottom:9px}
.cover h1{font-size:33pt;font-weight:800;line-height:1.07;letter-spacing:-.022em;color:var(--navy950)}
.cover .sub{font-size:13pt;color:var(--navy);margin-top:12px;font-weight:500;max-width:150mm}
.cover .lede{font-size:10.2pt;color:#404a60;margin-top:18px;max-width:152mm;line-height:1.62}
.rule{height:4px;width:68px;background:var(--gold);border-radius:4px;margin:24px 0}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:26px}
.fact{border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:#fbfcfe}
.fact b{display:block;font-family:'JakartaP',sans-serif;font-size:17pt;font-weight:800;color:var(--navy);line-height:1}
.fact span{display:block;font-size:7.6pt;color:var(--mute);margin-top:4px;line-height:1.3}
.cover-foot{flex:0 0 auto;border-top:1px solid var(--line);padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:8.2pt;color:var(--mute)}

/* ---------- generic page ---------- */
.page{page-break-before:always}
h2{font-size:18pt;font-weight:800;color:var(--navy950);letter-spacing:-.018em;line-height:1.15}
.sec-lede{font-size:10pt;color:#404a60;margin-top:9px;max-width:160mm;line-height:1.6}

.pillars{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
.pillar{border:1px solid var(--line);border-radius:11px;padding:14px 15px;background:#fbfcfe;break-inside:avoid}
.pillar .ph{display:flex;align-items:center;gap:8px;color:var(--navy)}
.pillar h4{font-size:10.6pt;font-weight:700;color:var(--navy950)}
.pillar p{font-size:9pt;color:#44506a;margin-top:7px;line-height:1.56}

.callout{border:1px solid #f0d9a8;background:#fdf8ec;border-radius:11px;padding:14px 16px;margin-top:18px;break-inside:avoid}
.callout .ph{display:flex;align-items:center;gap:8px;color:#8a5a06}
.callout h4{font-size:10.6pt;font-weight:700;color:#6b4604}
.callout p{font-size:9pt;color:#5d4a2a;margin-top:7px;line-height:1.58}

.toc{margin-top:20px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.toc div{display:flex;justify-content:space-between;padding:9px 14px;font-size:9.4pt;border-top:1px solid var(--line)}
.toc div:first-child{border-top:0;background:#f4f7fc;font-weight:700;color:var(--navy950)}
.toc b{color:var(--navy);font-weight:700}

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

<div class="cover">
  <div class="cover-top">${logicGridWordmark(42)}</div>
  <div class="cover-mid">
    <p class="eyebrow">System overview &amp; feature reference</p>
    <h1>eLGU Citizen Portal</h1>
    <p class="sub">A two-tier electronic government system for a Philippine municipality — and for every barangay inside it.</p>
    <div class="rule"></div>
    <p class="lede">One codebase serves five portals: a mobile-first app for residents, a console for each municipal office, a console for each barangay, a read-only view for the barangay council, and a public document check that needs no account at all. This document is the complete reference — what the system is, who may do what, and what every control on every screen does, shown with the icon it actually carries.</p>
    <div class="facts">
      ${FACTS.map(([n, l]) => `<div class="fact"><b>${n}</b><span>${l}</span></div>`).join('')}
    </div>
  </div>
  <div class="cover-foot">
    <span>Prepared by LogicGrid &middot; ${TODAY}</span>
    <span>Sample configuration: Malasiqui, Pangasinan</span>
  </div>
</div>

<div class="page">
  <h2>What this is, and what it is built around</h2>
  <p class="sec-lede">A working system, not a prototype: a Node and PostgreSQL API with 50 tables, a React progressive web app, real PDF documents with scannable verification, and 1,639 automated assertions run against a live database.</p>
  <div class="pillars">
    ${PILLARS.map(
      (p) => `<div class="pillar"><div class="ph">${icon(p.icon, { size: 19 })}<h4>${esc(p.title)}</h4></div><p>${p.body}</p></div>`
    ).join('')}
  </div>
  ${CHANGED.map(
    (c) => `<div class="callout"><div class="ph">${icon(c.icon, { size: 19 })}<h4>${esc(c.title)}</h4></div><p>${c.body}</p></div>`
  ).join('')}
  <div class="toc">
    <div><span>The five portals</span><span>Controls</span></div>
    ${totals.map((t) => `<div><span>${esc(t.name)}</span><b>${t.n}</b></div>`).join('')}
  </div>
</div>

${PORTALS.map((p, i) => portalPage(p, i + 1)).join('')}

</body></html>`
}

/** Every icon this document draws, so they can all be loaded before rendering. */
export function iconNames() {
  const names = []
  for (const p of PORTALS) for (const g of p.groups) for (const i of g.items) names.push(i.icon)
  for (const p of PILLARS) names.push(p.icon)
  for (const c of CHANGED) names.push(c.icon)
  return names.filter(Boolean)
}
