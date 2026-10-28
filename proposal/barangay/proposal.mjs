/**
 * The eBarangay Portal proposal: a covering letter to the Punong Barangay, a
 * short overview, then every control in every portal with the icon it actually
 * carries.
 *
 * It shares the municipal proposal's builder — the icons, the embedded fonts
 * and the LogicGrid marks — and nothing else. The control list is its own
 * (`./controls.mjs`), because this document tells somebody what they are
 * buying and a screen added to the hall must not appear in it by accident.
 */
import { icon, FACES, esc, logicGridWordmark } from '../overview/build.mjs'
import { FIRM } from '../overview/lgus.mjs'
import { PORTALS } from './controls.mjs'
import { PRODUCT, surnameOf } from './addressees.mjs'

const TODAY = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })

/** A ruled blank to be filled in by hand. `w` is in millimetres. */
const blank = (w = 62) => `<span class="blank" style="width:${w}mm"></span>`

/** The barangay's name, or a line to write it on. */
const brgy = (b) => (b.name ? `Barangay ${esc(b.name)}` : `Barangay ${blank(42)}`)
const where = (b) =>
  b.municipality
    ? `${esc(b.municipality)}, ${esc(b.province)}`
    : `${blank(38)}, ${blank(34)}`

const PILLARS = [
  {
    icon: 'badge-check',
    title: 'A certificate that can be checked',
    body: 'Every clearance, residency and indigency certificate comes out as a real PDF carrying your seal, the Punong Barangay’s and the Secretary’s signatures, and a QR. A bank or an employer scans it and sees what your office recorded — no account, no app.',
  },
  {
    icon: 'megaphone',
    title: 'The board, on every phone',
    body: 'A notice taped outside the hall works for whoever walks past it that week. The same notice here reaches every resident who has the app, and an urgent one rings their phone.',
  },
  {
    icon: 'book-text',
    title: 'The books the law asks you to keep',
    body: 'The Record of Barangay Inhabitants and the Katarungang Pambarangay blotter, with the summons it issues — kept as records rather than as a filing cabinet, and nothing readable outside this barangay.',
  },
  {
    icon: 'shield-check',
    title: 'Your records stay yours',
    body: 'The blotter and the household register are reachable from this barangay’s own console and nowhere else — not by the municipality, not by another barangay, not by any resident, and not by your own councillors.',
  },
]

function letterPage(b) {
  const named = Boolean(b.captain)
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
      ${named
        ? `<p>The Honorable <strong>${esc(b.captain)}</strong></p><p>Punong Barangay</p>`
        : `<p class="hon">The Honorable <span class="named">${blank()}<span class="under">Punong Barangay</span></span></p>`}
      <p class="place">${brgy(b)}</p>
      <p class="place">${where(b)}</p>
    </div>

    <p class="salutation">Dear Captain ${named ? `${esc(surnameOf(b))},` : `${blank(42)},`}</p>

    <p class="subject">Subject: &nbsp;Proposal &mdash; ${esc(PRODUCT.name)} for ${brgy(b)}</p>

    <div class="body">
      <p>We respectfully submit for your consideration the <strong>${esc(PRODUCT.name)}</strong>: a complete
      electronic records and services system built for a barangay, and for a barangay alone.</p>

      <p>The barangay issues the document most residents need in a given year &mdash; a clearance, a
      certificate of residency, a certificate of indigency &mdash; and it does so from a hall two streets
      away. What it does not have is any way to prove, afterwards, that the paper it handed over is the
      paper it actually issued. A clearance is retyped, a date is changed, and nothing in the barangay
      can tell. <strong>Every certificate this system releases carries a QR code</strong> that opens a
      public page showing what your office recorded: the type, the reference, whose it is, when it was
      issued and what it is valid until. The bank, the employer or the school checking it needs no
      account and installs nothing.</p>

      <p>It also carries the two books the Local Government Code asks a barangay to keep. The
      <strong>Record of Barangay Inhabitants</strong> is kept as a register that counts itself &mdash;
      population, households, age bands, per purok &mdash; so the figures a barangay is asked for are
      answered from the book rather than recompiled by hand, and a household with no date of birth on it
      is reported rather than quietly dropped from the count. The <strong>Katarungang Pambarangay
      blotter</strong> records a matter, the summons that call both sides, whether each one was actually
      served, and how it ended. Both stay inside this barangay: the municipality cannot read them, no
      other barangay can, and neither can any resident.</p>

      <p>The notice board is the part your residents will notice first. A sheet of paper taped outside
      the hall reaches whoever walks past it that week; the same notice posted here reaches every
      resident who has the app on their phone, and one marked urgent rings them. Nothing else in the
      system does that, deliberately &mdash; an app where any clerk can ring every phone in the barangay
      is an app whose notifications get switched off, and then the one that mattered goes unread.</p>

      <p><strong>And it is the barangay half of a system that also runs a municipal hall.</strong> If
      ${b.municipality ? `the Municipality of ${esc(b.municipality)}` : 'your municipality'} later adopts
      the eLGU Citizen Portal, this barangay joins it as a setting rather than a migration &mdash; the
      same software, the same records, nothing re-entered. That is not a promise about a future
      version; it is the reason the system is built the way it is.</p>

      <p>It is built and working today, with more than 1,600 automated checks running against a live
      database, and the pages that follow list every control in each of the four portals so you can see
      exactly what it does. <strong>We would be glad to demonstrate it to you and your Secretary at the
      hall, at no cost and with no obligation.</strong></p>

      <p>Thank you for your time and for your service to ${b.name ? brgy(b) : 'your barangay'}.</p>
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

function overviewPage(b) {
  const totals = PORTALS.map((p) => ({
    name: p.name,
    n: p.groups.reduce((a, g) => a + g.items.length, 0),
  }))
  return `
  <section class="page overview">
    <div class="ov-head">
      <div>
        <h2>${esc(PRODUCT.name)}</h2>
        <p class="lede">One system serves four portals: an app for residents of ${b.name ? brgy(b) : 'the barangay'},
        a console for the hall, a read-only view for the Sangguniang Barangay, and a public certificate
        check that needs no account at all.</p>
      </div>
      ${logicGridWordmark(104)}
    </div>

    <div class="pillars">
      ${PILLARS.map((p) => `<div class="pillar"><div class="ph">${icon(p.icon, { size: 17 })}<h4>${esc(p.title)}</h4></div><p>${p.body}</p></div>`).join('')}
    </div>

    <div class="toc">
      <div><span>The four portals</span><span>Controls</span></div>
      ${totals.map((t) => `<div><span>${esc(t.name)}</span><b>${t.n}</b></div>`).join('')}
    </div>

    <p class="note"><strong>What we would need from your office.</strong> The certificates you issue and
    what you charge for each; your hall’s address, hours and a number residents can ring; the names of
    the Punong Barangay and the Barangay Secretary; your barangay seal and the two signatures as scans;
    and the wording your own forms use on each certificate. Everything after that is set in the console
    by your administrator &mdash; no developer is needed to change a fee, correct a phone number or
    issue a clerk an account.</p>

    <p class="note plain"><strong>What it does not do, said plainly.</strong> No fee is paid online: the
    barangay takes its money at the hall on collection, exactly as it does now, and the system quotes
    the amount rather than collecting it. A signature on a certificate is a scan of a real one &mdash;
    it makes the paper look right and proves nothing by itself, which is what the QR code is for. Email
    and SMS need a mail and messaging service to be connected before they reach anybody. And nothing in
    the system checks what a certificate attests: a clearance says the holder has no pending case
    because the office releasing it says so.</p>
  </section>`
}

function portalPage(p, n) {
  const tone = {
    navy: ['#1e3a8a', '#eef2fb'], slate: ['#334155', '#eef1f5'], green: ['#166534', '#ecf5ee'],
    amber: ['#92400e', '#fdf4e7'], gold: ['#854d0e', '#fdf6e3'],
  }[p.tone]
  return `
  <section class="portal" style="--ink:${tone[0]};--wash:${tone[1]}">
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
          ${g.items.map((it) => `<li><span class="ic-box">${icon(it.icon)}</span><span class="c-text"><span class="c-label">${esc(it.label)}</span><span class="c-what">${it.what}</span></span></li>`).join('')}
        </ul>
      </div>`).join('')}
  </section>`
}

export function html(b) {
  const title = b.name ? `Barangay ${b.name}` : 'a barangay'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(PRODUCT.name)} — Proposal for ${esc(title)}</title>
<style>
${FACES}
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#1e3a8a;--navy950:#111c44;--gold:#b7791f;--line:#dde3ee;--mute:#5b6478;--ink:#166534}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'InterP',system-ui,sans-serif;font-size:9.6pt;line-height:1.5;color:#1b2235}
h1,h2,h3,h4,.disp{font-family:'JakartaP','InterP',sans-serif}
.ic{display:block}
.dot{display:block;width:7px;height:7px;border-radius:99px;background:currentColor;opacity:.45}

/* ---------- the letter ---------- */
.letter{page-break-after:always;display:flex;flex-direction:column}
.lh{display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2.5px solid var(--navy);padding-bottom:9px;margin-bottom:20px}
.firm{font-family:'JakartaP',sans-serif;font-weight:800;font-size:15.5pt;color:var(--navy);letter-spacing:-.01em}
.firm-sub{font-size:7.6pt;color:var(--mute);letter-spacing:.055em;text-transform:uppercase;font-weight:600;margin-top:2px}
.date{font-size:9.2pt;color:var(--mute);padding-top:5px}
.addressee p{font-size:10pt;line-height:1.55}
.addressee .hon{display:flex;align-items:flex-start;gap:5px;margin-bottom:7px}
.named{display:inline-block}
.blank{display:inline-block;border-bottom:1px solid #9aa3b5;height:1.05em;vertical-align:-2px}
.hon .blank{display:block}
.under{display:block;text-align:center;width:62mm;font-size:9.4pt;color:var(--navy950);
  font-weight:600;margin-top:2px;line-height:1.3}
.place{margin-top:3px}
.salutation{margin-top:15px;font-size:10pt}
.subject{margin-top:13px;font-size:10pt;font-weight:700;color:var(--navy950)}
.body{margin-top:11px}
.body p{font-size:9.5pt;line-height:1.55;margin-top:7px;text-align:justify}
.body strong{color:var(--navy950)}
.closing{margin-top:13px;font-size:9.9pt}
.signatories{display:flex;gap:26px;margin-top:22px;break-inside:avoid}
.sig{break-inside:avoid}
.sig{flex:1 1 0}
.sig .rule{border-top:1px solid #4a5568;margin-bottom:5px}
.sig-name{font-family:'JakartaP',sans-serif;font-weight:800;font-size:9.6pt;color:var(--navy950);letter-spacing:.01em}
.sig-title{font-size:8.6pt;color:var(--navy);font-weight:600;margin-top:1px}
.sig-contact{font-size:8.4pt;color:var(--mute);margin-top:1px}
.firm-foot{margin-top:11px;font-family:'JakartaP',sans-serif;font-weight:700;font-size:9pt;color:var(--navy);letter-spacing:.02em}

/* ---------- overview ---------- */
.page{page-break-before:always}
.ov-head{display:flex;gap:18px;align-items:flex-start;justify-content:space-between}
.ov-head .lg-badge{flex:0 0 auto;margin-top:2px}
h2{font-size:17pt;font-weight:800;color:var(--navy950);letter-spacing:-.018em;line-height:1.15}
.lede{font-size:9.8pt;color:#404a60;margin-top:9px;max-width:118mm;line-height:1.58}
.pillars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.pillar{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fbfcfe}
.pillar .ph{display:flex;align-items:center;gap:7px;color:var(--ink)}
.pillar h4{font-size:10pt;font-weight:700;color:var(--navy950)}
.pillar p{font-size:8.6pt;color:#44506a;margin-top:6px;line-height:1.5}
.toc{margin-top:15px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.toc div{display:flex;justify-content:space-between;padding:7px 13px;font-size:9pt;border-top:1px solid var(--line)}
.toc div:first-child{border-top:0;background:#f4f7fc;font-weight:700;color:var(--navy950);font-size:8.4pt;letter-spacing:.03em;text-transform:uppercase}
.toc b{color:var(--ink);font-weight:700}
.note{margin-top:14px;border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;
  padding:12px 14px;font-size:8.8pt;line-height:1.55;color:#44506a;background:#fdfbf6}
.note.plain{border-left-color:#64748b;background:#f8fafc}
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
${letterPage(b)}
${overviewPage(b)}
${PORTALS.map((p, i) => portalPage(p, i + 1)).join('')}
</body></html>`
}

/** Icons this document draws. */
export function iconNames() {
  const names = []
  for (const p of PORTALS) for (const g of p.groups) for (const i of g.items) names.push(i.icon)
  for (const p of PILLARS) names.push(p.icon)
  return names.filter(Boolean)
}
