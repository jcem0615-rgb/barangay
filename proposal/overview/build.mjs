/**
 * Builds the eLGU Citizen Portal overview as a PDF.
 *
 * Why a browser rather than a PDF library: the point of this document is that
 * every control is shown with *its own* icon, and those icons are lucide
 * vectors the app already imports. Reading lucide's own icon data and laying
 * it out in HTML means the picture in the overview is the picture on the
 * button — not a lookalike somebody redrew, which would drift the first time a
 * screen changed.
 *
 *   node proposal/overview/build.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { PORTALS } from './controls.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const ICONS = resolve(root, 'node_modules/lucide-react/dist/esm/icons')
const FONTS = resolve(root, 'proposal/fonts')
const OUT = resolve(root, 'proposal/eLGU-Overview.pdf')

// Chromium is preinstalled in this environment; fall back to Playwright's own
// lookup anywhere else.
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find((p) => existsSync(p))

// ---------------------------------------------------------------------------
// Icons, straight out of lucide-react's own data
// ---------------------------------------------------------------------------

/**
 * lucide ships each icon as `__iconNode` — an array of [tag, attrs] pairs its
 * React factory wraps in an <svg>. Importing the module and reading that
 * export is sturdier than parsing the source: an icon whose file is laid out
 * differently still resolves, and one that does not exist fails loudly here
 * rather than rendering as a blank square in a printed document.
 */
/**
 * lucide keeps its older names as alias modules that re-export the canonical
 * icon and carry no `__iconNode` of their own. The app still imports several
 * of those names (`AlertTriangle`, `CheckCircle2`, `BarChart3`), so following
 * the alias is what keeps the overview showing the same picture the button
 * does rather than failing on a name the code uses every day.
 */
async function iconNode(name, seen = new Set()) {
  if (seen.has(name)) return null
  seen.add(name)
  const file = resolve(ICONS, `${name}.mjs`)
  if (!existsSync(file)) return null
  const mod = await import(pathToFileURL(file).href)
  if (Array.isArray(mod.__iconNode)) return mod.__iconNode
  const alias = readFileSync(file, 'utf8').match(/export \{ default \} from '\.\/([a-z0-9-]+)\.mjs'/)
  return alias ? iconNode(alias[1], seen) : null
}

const iconCache = new Map()

export async function loadIcons(names) {
  const missing = []
  for (const name of new Set(names)) {
    if (!name || iconCache.has(name)) continue
    const nodes = await iconNode(name)
    if (!nodes) { missing.push(name); continue }
    iconCache.set(
      name,
      nodes
        .map(([tag, attrs]) => {
          const a = Object.entries(attrs)
            .filter(([k]) => k !== 'key')
            .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
            .join(' ')
          return `<${tag} ${a}/>`
        })
        .join('')
    )
  }
  if (missing.length) throw new Error(`lucide icons not found: ${missing.join(', ')}`)
}

export function icon(name, { size = 17, stroke = 1.9 } = {}) {
  if (!name) return `<span class="dot" aria-hidden="true"></span>`
  const body = iconCache.get(name)
  if (!body) throw new Error(`icon not loaded: ${name} — add it to loadIcons()`)
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${body}</svg>`
}

// ---------------------------------------------------------------------------
// The LogicGrid brand assets
// ---------------------------------------------------------------------------

/**
 * The real logo, supplied by LogicGrid and embedded as a data URI so the PDF
 * carries it rather than fetching it. Two files, because one size does not
 * work at both ends of this document:
 *
 *   logicgrid-logo.png   the full badge — circle, wordmark, tagline. Used on
 *                        the cover at a size where all three are legible.
 *   logicgrid-glyph.png  the circuit glyph alone, cut from the badge. The
 *                        running footer is about 10px tall, and the full badge
 *                        there would be a smudge with unreadable text inside
 *                        it, which reads worse than no logo at all.
 */
const ASSETS = resolve(root, 'proposal/overview/assets')

const dataUri = (file) => {
  const p = resolve(ASSETS, file)
  if (!existsSync(p)) throw new Error(`missing brand asset: ${file}`)
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`
}

/** The glyph alone, square. For small placements. */
export function logicGridMark(size = 40) {
  return `<img class="lg-glyph" src="${dataUri('logicgrid-glyph.png')}" width="${size}" height="${size}" alt="LogicGrid"/>`
}

/** The full badge: circle, wordmark and tagline, as supplied. */
export function logicGridWordmark(size = 96) {
  return `<img class="lg-badge" src="${dataUri('logicgrid-logo.png')}" width="${size}" height="${size}" alt="LogicGrid — Business Automation"/>`
}

// ---------------------------------------------------------------------------
// Fonts, embedded so the PDF renders the same anywhere
// ---------------------------------------------------------------------------

const font = (file, family, weight) => {
  const p = resolve(FONTS, file)
  if (!existsSync(p)) return ''
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;
    src:url(data:font/ttf;base64,${readFileSync(p).toString('base64')}) format('truetype');}`
}

const FACES = [
  font('Inter-Regular.ttf', 'InterP', 400),
  font('Inter-Medium.ttf', 'InterP', 500),
  font('Inter-SemiBold.ttf', 'InterP', 600),
  font('Inter-Bold.ttf', 'InterP', 700),
  font('Jakarta-Medium.ttf', 'JakartaP', 500),
  font('Jakarta-Bold.ttf', 'JakartaP', 700),
  font('Jakarta-ExtraBold.ttf', 'JakartaP', 800),
].join('\n')

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export { FACES, PORTALS, esc, CHROME, OUT, root }
