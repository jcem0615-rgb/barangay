/**
 * The overview document: cover, system summary, then every control in every
 * portal with the icon it actually carries.
 */
import { icon, logicGridMark, logicGridWordmark, FACES, PORTALS, esc } from './build.mjs'

const TODAY = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })

const FACTS = [
  ['5', 'portals'],
  ['165', 'controls, one by one'],
  ['17', 'municipal services'],
  ['6', 'barangay certificates'],
]

const PILLARS = [
  {
    icon: 'landmark',
    title: 'Both tiers of government',
    body: 'The municipal hall and the barangay, each with its own console. The tier most residents deal with in a year is the one most portals leave out.',
  },
  {
    icon: 'map-pin',
    title: 'Built around the wasted trip',
    body: 'Ordered routes to every document, ready dates over the hall\u2019s own calendar, and a counter check anybody can run from a phone.',
  },
  {
    icon: 'shield-check',
    title: 'The server establishes its own facts',
    body: 'The browser never asserts a fee, a workflow position or a payment. Roles are server-side; the shell is only what gets drawn.',
  },
  {
    icon: 'wifi-off',
    title: 'It works on one bar of signal',
    body: 'Hotlines, the digital ID and search read from a device cache. Forms save on every keystroke and send themselves when the signal returns.',
  },
]

const CHANGED = [
  {
    icon: 'ban',
    title: 'No national-ID check is claimed',
    body: 'PhilSys was removed: the number was never verified against anything, while the card printed “PhilSys Verified” over it. What proves this ID is its own code — ninety seconds, consumed on first check, server-side.',
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

/* ---------- cover: the whole overview, one page ---------- */
.cover{height:254mm;display:flex;flex-direction:column;page-break-after:always}
.cover-top{flex:0 0 auto;margin-bottom:26px}
.eyebrow{font-size:7.8pt;font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:var(--gold);margin-bottom:7px}
.cover h1{font-size:30pt;font-weight:800;line-height:1.05;letter-spacing:-.022em;color:var(--navy950)}
.cover .sub{font-size:11.8pt;color:var(--navy);margin-top:10px;font-weight:500;max-width:150mm;line-height:1.4}
.cover .lede{font-size:10pt;color:#404a60;margin-top:14px;max-width:158mm;line-height:1.6}
.cover .lede strong{color:var(--navy950);font-weight:700}
.rule{height:4px;width:62px;background:var(--gold);border-radius:4px;margin:16px 0}

.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:20px}
.fact{border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:#fbfcfe}
.fact b{display:block;font-family:'JakartaP',sans-serif;font-size:17pt;font-weight:800;color:var(--navy);line-height:1}
.fact span{display:block;font-size:7.6pt;color:var(--mute);margin-top:4px;line-height:1.3}

.pillars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.pillar{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#fbfcfe}
.pillar .ph{display:flex;align-items:center;gap:7px;color:var(--navy)}
.pillar h4{font-size:9.8pt;font-weight:700;color:var(--navy950)}
.pillar p{font-size:8.5pt;color:#44506a;margin-top:5px;line-height:1.5}

.callout{border:1px solid #f0d9a8;background:#fdf8ec;border-radius:10px;padding:11px 13px;margin-top:10px}
.callout .ph{display:flex;align-items:center;gap:7px;color:#8a5a06}
.callout h4{font-size:9.8pt;font-weight:700;color:#6b4604}
.callout p{font-size:8.5pt;color:#5d4a2a;margin-top:5px;line-height:1.5}

.toc{margin-top:16px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.toc div{display:flex;justify-content:space-between;padding:7px 13px;font-size:9pt;border-top:1px solid var(--line)}
.toc div:first-child{border-top:0;background:#f4f7fc;font-weight:700;color:var(--navy950);font-size:8.4pt;letter-spacing:.03em;text-transform:uppercase}
.toc b{color:var(--navy);font-weight:700}

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
</style></head>
<body>

<div class="cover">
  <div class="cover-top">${logicGridWordmark(40)}</div>

  <p class="eyebrow">Feature reference</p>
  <h1>eLGU Citizen Portal</h1>
  <p class="sub">A two-tier electronic government system for a Philippine municipality &mdash; and for every barangay inside it.</p>
  <div class="rule"></div>
  <p class="lede">One codebase serves five portals. <strong>This document lists every control in each of them, one by one, with the icon it actually carries.</strong></p>

  <div class="facts">
    ${FACTS.map(([n, l]) => `<div class="fact"><b>${n}</b><span>${l}</span></div>`).join('')}
  </div>

  <div class="pillars">
    ${PILLARS.map(
      (p) => `<div class="pillar"><div class="ph">${icon(p.icon, { size: 17 })}<h4>${esc(p.title)}</h4></div><p>${p.body}</p></div>`
    ).join('')}
  </div>

  ${CHANGED.map(
    (c) => `<div class="callout"><div class="ph">${icon(c.icon, { size: 17 })}<h4>${esc(c.title)}</h4></div><p>${c.body}</p></div>`
  ).join('')}

  <div class="toc">
    <div><span>The five portals</span><span>Controls</span></div>
    ${totals.map((t) => `<div><span>${esc(t.name)}</span><b>${t.n}</b></div>`).join('')}
  </div>

  <div class="cover-foot">
    <span>Prepared by LogicGrid &middot; ${TODAY}</span>
    <span>Sample configuration: Malasiqui, Pangasinan</span>
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
