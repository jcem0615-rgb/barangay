import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
/**
 * What the built app calls itself. `VITE_PRODUCT=barangay` builds the barangay
 * product; anything else builds the municipal one.
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

const PRODUCT = PRODUCTS[process.env.VITE_PRODUCT === 'barangay' ? 'barangay' : 'municipal']

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
      //   VITE_PRODUCT=barangay npm run build
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
