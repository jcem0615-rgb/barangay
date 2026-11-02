import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Which build this is, stamped in at build time.
 *
 * **The point is that it changes on its own.** A version somebody has to
 * remember to bump is a version that says 0.2.0 for six months, and the
 * question it exists to answer — "is the thing I just deployed actually the
 * thing I am looking at?" — is exactly the one this app has got wrong before:
 * `registerType: 'autoUpdate'` installs a new service worker without reloading
 * the page, so a deployed change can sit live for half a day and still look
 * missing. See *Getting a new version onto a phone* in CLAUDE.md. The commit
 * and the build time answer it without anybody's discipline; the semver in
 * package.json is the human-readable half beside them.
 *
 * The commit is read from three places in order, because the build does not
 * always happen where the git directory is:
 *
 *   1. `VERCEL_GIT_COMMIT_SHA` — on Vercel, which is authoritative there.
 *   2. `git rev-parse` — a normal checkout, including a local build.
 *   3. `'local'` — a tarball, a Docker context with no `.git`, anything else.
 *
 * Never throws. A build that cannot name its commit is still a build, and
 * failing one over a version string would be the tail wagging the dog.
 */
function buildCommit(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'local'
  }
}

const PKG_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

const BUILD = {
  version: PKG_VERSION,
  commit: buildCommit(),
  // Second precision: this is read by a person comparing two deploys, and
  // milliseconds are noise in that comparison.
  builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
}

// https://vite.dev/config/
/**
 * What the built app calls itself.
 *
 * **This repository is the barangay product, so `barangay` is the default.**
 * It used to be the other way round, and the flag had to be set on every
 * build — which is exactly the footgun the split was meant to remove: a
 * barangay build that forgot it shipped the municipal app's name and icon,
 * and an installed app's name cannot be corrected at runtime.
 *
 * `VITE_PRODUCT=municipal` still builds the municipal one, because the
 * municipal tier is present-but-switched-off here rather than deleted (see
 * SPLIT.md) and the test suite builds both.
 */
const PRODUCTS = {
  municipal: {
    id: 'municipal',
    name: 'eLGU Citizen Portal',
    shortName: 'eLGU Portal',
    description: 'Your Local Government Unit services, in your pocket.',
    // Where this product's home-screen icon lives. The two deployments are
    // already separate installed apps — install identity is per origin, so a
    // resident can hold both at once — and what decides whether they can tell
    // them apart on the home screen is this.
    icons: '/icons',
  },
  barangay: {
    id: 'barangay',
    name: 'eBarangay Portal',
    shortName: 'eBarangay',
    description: 'Your barangay — clearances, certificates and notices, in your pocket.',
    icons: '/icons/barangay',
  },
} as const

const PRODUCT = PRODUCTS[process.env.VITE_PRODUCT === 'municipal' ? 'municipal' : 'barangay']

/**
 * `index.html` is served before any JavaScript runs, so everything in its head
 * is build-time by nature — and three things in there name the product.
 *
 * `apple-mobile-web-app-title` is the one that actually bit: iOS has no
 * install API and no manifest `short_name` support worth relying on, so when a
 * resident adds the app from Safari's Share menu, *that meta tag* is what ends
 * up under the icon. A barangay app labelled "eLGU Portal" on an iPhone is the
 * wrong app on the home screen, and nothing the running app renders can
 * correct it.
 *
 * The title and the description are the same kind of fact: a link shared in
 * Messenger previews from the HTML, not from the catalogue.
 */
const htmlProduct = () => ({
  name: 'html-product',
  transformIndexHtml: (html: string) =>
    html
      .replaceAll('%PRODUCT_NAME%', PRODUCT.name)
      .replaceAll('%PRODUCT_SHORT%', PRODUCT.shortName)
      .replaceAll('%PRODUCT_DESC%', PRODUCT.description)
      .replaceAll('%PRODUCT_ICONS%', PRODUCT.icons),
})

export default defineConfig({
  // Injected as literals rather than read at runtime: there is no `process` in
  // the browser, and an import of package.json would pull its whole contents
  // — scripts, dependencies and all — into the bundle.
  define: {
    __APP_VERSION__: JSON.stringify(BUILD.version),
    __APP_COMMIT__: JSON.stringify(BUILD.commit),
    __APP_BUILT_AT__: JSON.stringify(BUILD.builtAt),
  },
  // The demo build is published as a single self-contained page, so its dynamic
  // import of the in-browser server has to be inlined rather than split out
  // into a chunk the page would try to fetch.
  build:
    process.env.VITE_DEMO === '1'
      ? { rollupOptions: { output: { inlineDynamicImports: true } } }
      : {},
  plugins: [
    react(),
    tailwindcss(),
    htmlProduct(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', `${PRODUCT.icons.slice(1)}/*.png`],
      // The two tiers are two products, and the manifest is the one piece of
      // branding that cannot be decided at runtime: an installed app's name
      // and icon are baked in when it is installed. So this is a build flag,
      // while everything the app renders comes off the catalogue — which means
      // a bundle built for one tier and pointed at the other still *reads*
      // correctly, it is only the home-screen label that would be wrong.
      //
      //   VITE_PRODUCT=municipal npm run build   # the other tier
      manifest: {
        // Stated rather than left to default to `start_url`, so the install
        // identity is a decision instead of a consequence of the path the
        // resident happened to be on when they installed.
        id: `/?app=${PRODUCT.id}`,
        name: PRODUCT.name,
        short_name: PRODUCT.shortName,
        description: PRODUCT.description,
        theme_color: '#1e3a8a',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: `${PRODUCT.icons}/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${PRODUCT.icons}/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${PRODUCT.icons}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Push and notification-click handling, kept as a static file so the
        // caching worker stays generated rather than hand-written.
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: { cacheName: 'elgu-pages' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
