/**
 * Renders the eBarangay Portal proposal.
 *
 *   node proposal/barangay/build.mjs              # the blank, for any barangay
 *   node proposal/barangay/build.mjs poblacion    # a copy naming one
 *   node proposal/barangay/build.mjs --all        # all 73 in the roster
 *
 * Output lands in `proposal/barangay-lgu/`.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { CHROME, loadIcons, root } from '../overview/build.mjs'
import { FIRM } from '../overview/lgus.mjs'
import { html, iconNames } from './proposal.mjs'
import { BLANK, roster, PRODUCT } from './addressees.mjs'

const OUT_DIR = resolve(root, 'proposal/barangay-lgu')
mkdirSync(OUT_DIR, { recursive: true })

const args = process.argv.slice(2)
const targets = args.includes('--all')
  ? roster()
  : args.length
    ? (() => {
        const all = roster()
        const picked = args.map((slug) => {
          const row = all.find((b) => b.slug === slug)
          if (!row) throw new Error(`no barangay in the roster matched: ${slug}`)
          return row
        })
        return picked
      })()
    : [BLANK]

await loadIcons(iconNames())

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

for (const b of targets) {
  await page.setContent(html(b), { waitUntil: 'networkidle' })
  await page.emulateMedia({ media: 'print' })
  const file = b.name
    ? `eBarangay-Proposal-${b.name.replace(/\s+/g, '-')}.pdf`
    : 'eBarangay-Proposal.pdf'
  const out = resolve(OUT_DIR, file)
  const subject = b.name ? `proposal for Barangay ${b.name}` : 'proposal'
  const foot = `<div style="width:100%;font:500 7.4pt 'Helvetica',sans-serif;color:#7a8396;
    padding:0 14mm;display:flex;justify-content:space-between;">
    <span><b style="color:#1e3a8a;">${FIRM.name}</b> &middot; ${PRODUCT.name} — ${subject}</span>
    <span class="pageNumber"></span></div>`
  await page.pdf({
    path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>', footerTemplate: foot,
    margin: { top: '14mm', bottom: '15mm', left: '16mm', right: '16mm' },
  })
  console.log('wrote', out)
}
await browser.close()
console.log(problems.length ? `page errors: ${problems.slice(0, 3)}` : 'rendered with no page errors')
