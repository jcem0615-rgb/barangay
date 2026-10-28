import { qrSvg } from './qr.ts'
import { placeOf, productOf, type Deployment } from './registry.ts'

/**
 * The poster a customer tapes to the wall.
 *
 * A PWA has no store listing, which is most of why it suits this: nothing to
 * review, nothing to update through a store, and it runs on the cheap Android
 * phones the people it serves actually own. The cost is that **somebody has to
 * tell the resident the address** — and that somebody is whoever sold them the
 * portal, which is why this lives here rather than in the LGU's own console.
 *
 * It needs no setting and no step: a deployment's address is on its registry
 * row, so the code exists the moment the customer is added. There is nothing
 * for an office to configure and nothing for them to get wrong.
 *
 * Two routes side by side, because a resident following the wrong one of the
 * two gets nowhere: Android offers an Install button by itself, and iOS has no
 * install API at all — Safari does it from the Share menu and nothing in a
 * page can open that for them.
 */
export function posterHtml(d: Deployment): string {
  const url = d.public_url.replace(/\/+$/, '')
  const product = productOf(d.tier)
  const place = placeOf(d)
  const accent = d.tier === 'barangay' ? '#166534' : '#1e3a8a'
  const lead =
    d.tier === 'barangay'
      ? "Request your clearance, read the barangay's notices, and carry your ID on your phone."
      : 'Apply for permits and certificates, pay the fee, book a visit, and carry your ID on your phone.'
  const ask =
    d.tier === 'barangay'
      ? 'Ask at the barangay hall if you need a hand setting it up.'
      : 'Ask at the municipal hall if you need a hand setting it up.'

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(product)} — ${esc(place)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; color: #111c44;
         text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .place { font-size: 15pt; font-weight: 700; color: ${accent}; letter-spacing: .02em; }
  h1 { font-size: 34pt; font-weight: 800; letter-spacing: -.02em; margin-top: 6mm; line-height: 1.05; }
  .sub { font-family: 'Inter', sans-serif; font-size: 13pt; color: #44506a; margin-top: 4mm; }
  .qr { width: 92mm; height: 92mm; margin: 10mm auto 0; display: block; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .url { font-family: ui-monospace, 'Courier New', monospace; font-size: 14pt; font-weight: 600;
         margin-top: 7mm; word-break: break-all; }
  .steps { display: flex; gap: 8mm; margin-top: 11mm; text-align: left; }
  .step { flex: 1 1 0; border: 1pt solid #dde3ee; border-radius: 4mm; padding: 5mm 6mm; }
  .step h2 { font-size: 12pt; font-weight: 800; }
  .step ol { font-family: 'Inter', sans-serif; margin: 3mm 0 0 5mm; font-size: 10.5pt; line-height: 1.6; color: #3c465c; }
  .foot { font-family: 'Inter', sans-serif; margin-top: 10mm; font-size: 10pt; color: #5b6478; line-height: 1.5; }
  .bar { display: none; }
  @media screen {
    body { background: #f1f4f9; padding: 24px; }
    .sheet { background: #fff; max-width: 210mm; margin: 0 auto; padding: 16mm; border-radius: 10px;
             box-shadow: 0 1px 3px rgba(17,28,68,.12); }
    .bar { display: block; max-width: 210mm; margin: 0 auto 14px; text-align: left;
           font-family: 'Inter', sans-serif; font-size: 13px; }
    .bar a { color: #1e3a8a; font-weight: 600; text-decoration: none; }
    .bar button { font: inherit; font-weight: 600; background: #1e3a8a; color: #fff; border: 0;
                  border-radius: 8px; padding: 7px 14px; cursor: pointer; margin-left: 10px; }
  }
  @media print { .bar { display: none !important; } .sheet { box-shadow: none; padding: 0; } }
</style></head>
<body>
  <div class="bar"><a href="/d/${esc(d.id)}">&larr; Back to ${esc(place)}</a>
    <button onclick="window.print()">Print this poster</button></div>
  <div class="sheet">
    <p class="place">${esc(place)}</p>
    <h1>Get the ${esc(product)}</h1>
    <p class="sub">${esc(lead)}</p>
    <div class="qr">${qrSvg(url, { size: 340, ink: '#111c44' })}</div>
    <p class="url">${esc(url)}</p>
    <div class="steps">
      <div class="step">
        <h2>Android</h2>
        <ol>
          <li>Point your camera at the code, or type the address.</li>
          <li>Tap <b>Install</b> when it is offered.</li>
          <li>If it is not, open the browser menu and tap <b>Install app</b>.</li>
        </ol>
      </div>
      <div class="step">
        <h2>iPhone</h2>
        <ol>
          <li>Point your camera at the code and open it in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button at the bottom.</li>
          <li>Tap <b>Add to Home Screen</b>.</li>
        </ol>
      </div>
    </div>
    <p class="foot">Free to install. Nothing to download from a store.<br>${esc(ask)}</p>
  </div>
</body></html>`
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
