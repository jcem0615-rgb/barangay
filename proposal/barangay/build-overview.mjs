/**
 * Renders the eBarangay Portal overview.
 *
 *   node proposal/barangay/build-overview.mjs   -> proposal/eBarangay-Overview.pdf
 */
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { CHROME, loadIcons, logicGridMark, root } from '../overview/build.mjs'
import { html, iconNames } from './overview.mjs'
import { PRODUCT } from './addressees.mjs'

const OUT = resolve(root, 'proposal/eBarangay-Overview.pdf')

await loadIcons(iconNames())

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))
await page.setContent(html(), { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })

// The mark rides in the running footer too, so a page photocopied out of the
// document still says who wrote it.
const foot = `<div style="width:100%;font:500 7.4pt 'Helvetica',sans-serif;color:#7a8396;
  padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
  <span style="display:flex;align-items:center;gap:5px;">
    ${logicGridMark(15)}
    <span style="font-weight:700;color:#1e3a8a;">LogicGrid</span>
    <span>&middot; ${PRODUCT.name} — Overview</span>
  </span>
  <span class="pageNumber"></span>
</div>`

await page.pdf({
  path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<div></div>', footerTemplate: foot,
  margin: { top: '14mm', bottom: '15mm', left: '14mm', right: '14mm' },
})
await browser.close()
console.log(problems.length ? `page errors: ${problems.slice(0, 3)}` : 'rendered with no page errors')
console.log('wrote', OUT)
