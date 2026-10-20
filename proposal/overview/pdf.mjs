import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { CHROME, OUT, logicGridMark, loadIcons } from './build.mjs'
import { html, iconNames } from './render.mjs'

await loadIcons(iconNames())

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))
await page.setContent(html(), { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })

// The running footer carries the mark too, so a page photocopied out of the
// deck still says who wrote it.
const foot = `<div style="width:100%;font:500 7.4pt 'Helvetica',sans-serif;color:#7a8396;
  padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
  <span style="display:flex;align-items:center;gap:5px;">
    ${logicGridMark(15)}
    <span style="font-weight:700;color:#1e3a8a;">LogicGrid</span>
    <span>&middot; eLGU Citizen Portal — Overview</span>
  </span>
  <span class="pageNumber"></span>
</div>`

await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: foot,
  margin: { top: '14mm', bottom: '15mm', left: '14mm', right: '14mm' },
})
await browser.close()
console.log(problems.length ? `page errors: ${problems.slice(0, 3)}` : 'rendered with no page errors')
console.log('wrote', OUT)
