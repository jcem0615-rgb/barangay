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
    name: 'eLGU Citizen Portal',
    shortName: 'eLGU Portal',
    description: 'Your Local Government Unit services, in your pocket.',
  },
  barangay: {
    name: 'eBarangay Portal',
    shortName: 'eBarangay',
    description: 'Your barangay — clearances, certificates and notices, in your pocket.',
  },
} as const

const PRODUCT = PRODUCTS[process.env.VITE_PRODUCT === 'barangay' ? 'barangay' : 'municipal']

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      // The two tiers are two products, and the manifest is the one piece of
      // branding that cannot be decided at runtime: an installed app's name
      // and icon are baked in when it is installed. So this is a build flag,
      // while everything the app renders comes off the catalogue — which means
      // a bundle built for one tier and pointed at the other still *reads*
      // correctly, it is only the home-screen label that would be wrong.
      //
      //   VITE_PRODUCT=barangay npm run build
      manifest: {
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
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
