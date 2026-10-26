/**
 * Renders one proposal PDF per local government.
 *
 *   node proposal/overview/build-proposals.mjs            # all of them
 *   node proposal/overview/build-proposals.mjs malasiqui  # just one
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { CHROME, loadIcons, root } from './build.mjs'
import { html, iconNames } from './proposal.mjs'
import { LGUS, FIRM } from './lgus.mjs'

const OUT_DIR = resolve(root, 'proposal/lgu')
mkdirSync(OUT_DIR, { recursive: true })

await loadIcons(iconNames())

const only = process.argv.slice(2)
const targets = only.length ? LGUS.filter((l) => only.includes(l.slug)) : LGUS
if (!targets.length) throw new Error(`no LGU matched: ${only.join(', ')}`)

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

for (const lgu of targets) {
  await page.setContent(html(lgu), { waitUntil: 'networkidle' })
  await page.emulateMedia({ media: 'print' })
  const out = resolve(OUT_DIR, `eLGU-Proposal-${lgu.name.replace(/\s+/g, '-')}.pdf`)
  const foot = `<div style="width:100%;font:500 7.4pt 'Helvetica',sans-serif;color:#7a8396;
    padding:0 14mm;display:flex;justify-content:space-between;">
    <span><b style="color:#1e3a8a;">${FIRM.name}</b> &middot; eLGU Citizen Portal — proposal for ${lgu.name}</span>
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
