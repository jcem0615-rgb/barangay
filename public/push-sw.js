/*
 * Push handling, imported by the generated service worker.
 *
 * Kept as a separate static file rather than folded into a custom service
 * worker: vite-plugin-pwa generates the caching worker from the build manifest,
 * and switching to a hand-written one to add twenty lines would mean owning
 * that precache logic by hand forever. `workbox.importScripts` pulls this in
 * instead, so the caching stays generated and this stays readable.
 */

self.addEventListener('push', (event) => {
  // A push with no readable payload still means something happened. Saying so
  // is better than staying silent, because the resident can open the app and
  // find out what.
  let payload = { title: 'eLGU Citizen Portal', body: 'You have a new notification.' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Not JSON; keep the neutral default.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapses repeats from the same notification instead of stacking a
      // column of them on the lock screen.
      tag: payload.tag || 'elgu',
      renotify: false,
      data: { url: payload.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  // Focus the app if it is already open rather than opening a second copy —
  // a resident who taps a notification expects to land in the app they have,
  // with whatever they were doing still there.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
