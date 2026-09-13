import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
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
      manifest: {
        name: 'eLGU Citizen Portal',
        short_name: 'eLGU Portal',
        description: 'Your Local Government Unit services, in your pocket.',
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
