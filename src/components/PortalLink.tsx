import { useState } from 'react'
import { Check, Copy, Printer } from 'lucide-react'
import QrPattern from './QrPattern'
import { generateQrGrid } from '../lib/qrPattern'

/**
 * How a resident gets the app.
 *
 * There is no app store listing and there is not going to be one: this is a
 * progressive web app, so it installs from a link in a browser. That is the
 * right trade — nothing to review, nothing to update through a store, and it
 * works on the cheap Android phones most of a barangay actually owns — but it
 * has one failure the store version does not: **a resident has to be told the
 * link.** Nothing in the console gave an office any way to tell them, so the
 * honest state of the product was "it installs, if somebody happens to type
 * the address".
 *
 * So the office gets the link, a real QR of it, and something it can print and
 * tape to the wall — which is how a barangay has always told people anything.
 *
 * The URL comes from `window.location.origin` rather than from configuration.
 * Whoever is reading this screen reached it on the deployment's own address, so
 * the browser already knows the one thing a server-side setting could get
 * wrong; and a poster carrying an address that does not resolve is worse than
 * no poster, because somebody will print a hundred of them.
 */
/**
 * Which office is handing the poster out. It decides the colour and the two
 * lines of copy — a municipal poster promising "read the barangay's notices"
 * and a barangay one offering to take a payment both describe a different
 * app from the one the reader would install. The tier cannot answer this on
 * its own: a municipal deployment runs the barangay console too, and a poster
 * printed from there is a barangay's.
 */
type Kind = 'barangay' | 'municipal'

const TONE: Record<Kind, { accent: string; lead: string; foot: string }> = {
  barangay: {
    accent: '#166534',
    lead: "Request your clearance, read the barangay's notices, and carry your ID on your phone.",
    foot: 'Ask at the barangay hall if you need a hand setting it up.',
  },
  municipal: {
    accent: '#1e3a8a',
    lead: 'Apply for permits and certificates, pay the fee, book a visit, and carry your ID on your phone.',
    foot: 'Ask at the municipal hall if you need a hand setting it up.',
  },
}

export default function PortalLink({
  place, product, kind,
}: { place: string; product: string; kind: Kind }) {
  const url = typeof window === 'undefined' ? '' : window.location.origin
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright; the link is printed in full
      // beside the button, so there is always a way to get it by hand.
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-[14px] font-bold text-navy-950">Give residents the app</h3>
      <p className="mt-1.5 text-[12.5px] leading-snug text-slate-600">
        There is no app store to search &mdash; the app installs straight from this
        link, which is why it works on almost any phone. Residents have to be told
        the link, so print the poster and put it where you put everything else.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        <QrPattern content={url} dim={128} />

        <div className="min-w-[220px] flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            The address
          </p>
          <p className="mt-1 break-all font-mono text-[13px] font-medium text-navy-900">{url}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void copy()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50"
            >
              {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={() => printPoster({ url, place, product, kind })}
              className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900"
            >
              <Printer size={13} /> Print a poster
            </button>
          </div>

          <p className="mt-3 text-[12px] leading-snug text-slate-500">
            An iPhone installs it from Safari's Share menu; an Android phone offers
            an Install button by itself. The poster says both, because a resident
            holding the wrong one of the two gets nowhere.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * The poster, as its own document.
 *
 * It is built as a standalone page and printed rather than being the console
 * screen with a print stylesheet over it. A print stylesheet has to hide the
 * whole console around it, and every tab added later is one more thing that
 * can leak onto the paper — which on this console would mean a household
 * address or a blotter entry on something taped to a wall.
 *
 * The QR is drawn as SVG rects rather than an image, for the reason the
 * documents' codes are: it stays crisp at whatever resolution the barangay's
 * printer runs at, and a QR printed soft is a QR that does not scan.
 */
function printPoster({
  url, place, product, kind,
}: { url: string; place: string; product: string; kind: Kind }) {
  const tone = TONE[kind]
  const grid = generateQrGrid(url)
  const n = grid.length
  // Four modules of quiet zone on every side: the spec requires it and
  // scanners rely on it, and a code printed hard against a border is the
  // classic reason one will not read.
  const span = n + 8
  const rects = grid
    .flatMap((row, r) =>
      row.map((on, c) => (on ? `<rect x="${c + 4}" y="${r + 4}" width="1" height="1"/>` : ''))
    )
    .join('')

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(product)} — ${esc(place)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; color: #111c44;
         text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .place { font-size: 15pt; font-weight: 700; color: ${tone.accent}; letter-spacing: .02em; }
  h1 { font-size: 34pt; font-weight: 800; letter-spacing: -.02em; margin-top: 6mm; line-height: 1.05; }
  .sub { font-size: 13pt; color: #44506a; margin-top: 4mm; }
  svg { width: 92mm; height: 92mm; margin: 10mm auto 0; display: block; }
  .url { font-family: ui-monospace, 'Courier New', monospace; font-size: 14pt; font-weight: 600;
         margin-top: 7mm; word-break: break-all; }
  .steps { display: flex; gap: 8mm; margin-top: 11mm; text-align: left; }
  .step { flex: 1 1 0; border: 1pt solid #dde3ee; border-radius: 4mm; padding: 5mm 6mm; }
  .step h2 { font-size: 12pt; font-weight: 800; }
  .step ol { margin: 3mm 0 0 5mm; font-size: 10.5pt; line-height: 1.6; color: #3c465c; }
  .foot { margin-top: 10mm; font-size: 10pt; color: #5b6478; line-height: 1.5; }
</style></head>
<body>
  <p class="place">${esc(place)}</p>
  <h1>Get the ${esc(product)}</h1>
  <p class="sub">${esc(tone.lead)}</p>

  <svg viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img"
       aria-label="QR code for ${esc(url)}">
    <rect width="${span}" height="${span}" fill="#fff"/>
    <g fill="#111c44">${rects}</g>
  </svg>

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

  <p class="foot">Free to install. Nothing to download from a store.<br>
  ${esc(tone.foot)}</p>
</body></html>`

  // A new window rather than an iframe: printing an iframe is inconsistent
  // across browsers, and a popup the office can see before it prints is the
  // more honest behaviour anyway.
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) return
  w.document.write(html)
  w.document.close()
  // Give the layout a tick to settle before the print dialogue takes over;
  // printing an unlaid-out page is how a QR comes out the wrong size.
  w.addEventListener('load', () => setTimeout(() => w.print(), 150))
}
