/**
 * The home-screen icons, for both products.
 *
 *   node scripts/build-icons.mjs
 *
 * Two deployments on two domains are already two separate installed apps —
 * install identity is per origin, so a resident can hold both at once. What
 * decides whether they can *tell them apart* is the icon and the label, and
 * those were shared: the barangay product installed with the municipal
 * portal's mark on it. An icon that belongs to another app is a wrong icon,
 * not a missing one.
 *
 * So both are generated here from one spec. The ring, the disc, the palette
 * and the proportions are identical; only the field colour and the glyph
 * differ, which is how a pair of government apps should look — obviously the
 * same family, never the same app.
 *
 * Green for the barangay is not a new colour: it is the one the app already
 * uses for that tier everywhere, on the barangay door, the hub tile and the
 * console. Navy stays the hall's.
 *
 * Chromium rasterises them, the same browser the proposal PDFs are rendered
 * with, so there is no second rendering path to disagree with the first.
 *
 * BOTH ARE STILL PLACEHOLDERS. A deployment replaces them with the LGU's own
 * seal — see the pre-launch checklist in DEPLOY.md. What this fixes is the
 * pair being indistinguishable, which no amount of replacing one of them
 * would have.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CHROME = (() => {
  const base = '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse())
    for (const e of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = resolve(base, d, e)
      if (existsSync(p)) return p
    }
  return undefined
})()

const GOLD = '#fbbf24'

/**
 * The shared frame, measured off the icon this project shipped from its first
 * commit so the new one joins a family rather than starting a second.
 */
const RING_R = 176.5
const RING_W = 17
const DISC_R = 144

/** A pitched house: the hall. Knocked out of the disc in the field colour. */
const house = (ink) => `
  <path fill="${ink}" d="
    M256 140 L348 248 L322 248 L322 362 L282 362 L282 296 L230 296 L230 362 L190 362 L190 248 L164 248 Z
  "/>`

/**
 * A barangay hall: a flat-roofed block with a slab overhanging it, windows and
 * a door. Deliberately not a second house — at 48px on a home screen the two
 * have to differ in silhouette, not in detail.
 */
const hall = (ink) => `
  <g fill="${ink}">
    <rect x="166" y="156" width="180" height="26" rx="5"/>
    <rect x="186" y="186" width="140" height="176" rx="4"/>
  </g>
  <g fill="${GOLD}">
    <rect x="208" y="210" width="28" height="28" rx="4"/>
    <rect x="276" y="210" width="28" height="28" rx="4"/>
    <rect x="208" y="258" width="28" height="28" rx="4"/>
    <rect x="276" y="258" width="28" height="28" rx="4"/>
    <rect x="238" y="306" width="36" height="56" rx="4"/>
  </g>`

const PRODUCTS = [
  { dir: 'icons', field: '#1e3a8a', glyph: house, label: 'municipal' },
  { dir: 'icons/barangay', field: '#166534', glyph: hall, label: 'barangay' },
]

const svg = (p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${p.field}"/>
  <circle cx="256" cy="256" r="${RING_R}" fill="none" stroke="${GOLD}" stroke-width="${RING_W}"/>
  <circle cx="256" cy="256" r="${DISC_R}" fill="${GOLD}"/>
  ${p.glyph(p.field)}
</svg>`

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
for (const p of PRODUCTS) {
  const out = resolve(root, 'public', p.dir)
  mkdirSync(out, { recursive: true })
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>
       ${svg(p)}`
    )
    const file = resolve(out, `icon-${size}.png`)
    await page.screenshot({ path: file, omitBackground: false })
    await page.close()
    console.log('wrote', file)
  }
}
await browser.close()
