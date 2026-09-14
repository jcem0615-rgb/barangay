import { useEffect, useState } from 'react'

/**
 * Installing the portal as an app.
 *
 * A resident who installs gets the thing they actually need: an icon on the
 * home screen, no address bar, and — because the service worker is already
 * precaching the shell — an app that opens to their hotlines and their ID with
 * no signal at all. The web page they were on can do none of that.
 *
 * The browser decides when this is possible, not us. Chromium fires
 * `beforeinstallprompt` once it judges the app installable and the resident
 * engaged enough to be asked; we hold that event and spend it when they tap.
 * There is no way to conjure one, so where it has not fired there is nothing
 * to offer and the button does not render.
 *
 * The listener is registered at module load rather than in a component,
 * because the event fires early — often before React has mounted — and is not
 * replayed. Miss it and the offer is gone for the whole visit.
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own bar, which on a government portal
    // reads as something the page is doing to you rather than an offer.
    event.preventDefault()
    deferred = event as InstallEvent
    emit()
  })
  // Fires whether they installed from our button or the browser's own menu, so
  // the offer disappears either way rather than inviting a second install.
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

/** Already running as an installed app — Chromium reports one, iOS the other. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS has no install event and no install API: Safari does it from the Share
 * menu and nothing in the page can open that. So the only honest thing to show
 * an iPhone is where the button is.
 *
 * iPadOS reports itself as a Mac, which is why the touch check is there.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export type InstallState =
  /** Running as an installed app already. */
  | 'installed'
  /** The browser has offered; tapping installs. */
  | 'ready'
  /** iOS: possible, but only by hand through the Share menu. */
  | 'manual-ios'
  /** Nothing to offer — no event, and not a browser we can instruct. */
  | 'unavailable'

function currentState(): InstallState {
  if (installed || isStandalone()) return 'installed'
  if (deferred) return 'ready'
  if (isIos()) return 'manual-ios'
  return 'unavailable'
}

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(currentState)
  useEffect(() => {
    const update = () => setState(currentState())
    listeners.add(update)
    // Installing from the browser's own menu does not always fire
    // `appinstalled` in the tab you installed from; the display mode change is
    // the one signal every engine agrees on.
    const media = window.matchMedia?.('(display-mode: standalone)')
    media?.addEventListener('change', update)
    update()
    return () => {
      listeners.delete(update)
      media?.removeEventListener('change', update)
    }
  }, [])
  return state
}

/**
 * Spend the held event. Resolves to whether they went through with it.
 *
 * The event is one-shot: a dismissed prompt cannot be shown again, so it is
 * dropped either way and the button stops offering something that would do
 * nothing the second time.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  } catch {
    return 'dismissed'
  } finally {
    emit()
  }
}
