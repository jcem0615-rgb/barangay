/**
 * Reloading the page when a new version takes over.
 *
 * `registerType: 'autoUpdate'` already installs and activates a new service
 * worker in the background — what it does not do is reload the page you are
 * looking at. So a returning visitor renders the *old* precached shell, the new
 * worker quietly takes over behind it, and the new version only appears on the
 * next load. That is how a deployed change can sit live for half a day and
 * still look missing, which is exactly what it did.
 *
 * **This reloads under the resident's fingers, which is a real cost.** It is
 * survivable here because of something the app already does: a half-filled form
 * is written to IndexedDB on every keystroke (`saveLocalDraft` in `db.ts`), and
 * the offline outbox is persisted and resumes on load, so neither is lost to a
 * refresh. What *is* lost is the in-memory navigation stack — the app reopens on
 * the dashboard rather than where you were — which is the documented cost of
 * having no router. If that becomes the complaint, the fix is a prompt bar
 * rather than making the reload cleverer.
 */

let reloading = false

export function reloadOnNewVersion(): void {
  if (!('serviceWorker' in navigator)) return

  /**
   * Whether this page was already under a worker when it loaded.
   *
   * This is the whole correctness of the thing. `clientsClaim` makes
   * `controllerchange` fire on a *first* install too — the page started with no
   * controller and one took over — and reloading for that is both pointless and
   * the classic way to build an infinite refresh loop. An update is only an
   * update when there was something to update from.
   */
  const hadController = navigator.serviceWorker.controller !== null

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
}
