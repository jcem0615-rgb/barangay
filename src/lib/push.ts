import { api } from './api'

/**
 * Turning on push notifications, from the browser's side.
 *
 * **The permission prompt is never shown on load.** A cold prompt on first
 * visit is the one every guide tells you not to do, and for good reason: a
 * resident who has not yet filed anything has nothing to be notified about, so
 * the honest answer to "allow notifications?" is no — and a browser remembers a
 * no more or less forever. This is called from a button the resident pressed,
 * after they have something waiting on an office.
 */

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/**
 * The VAPID public key arrives base64url; the browser wants raw bytes.
 *
 * Returned as an ArrayBuffer rather than a typed array because
 * `applicationServerKey` is typed as a BufferSource, and a Uint8Array over a
 * SharedArrayBuffer-capable backing store does not satisfy it.
 */
function decodeKey(base64Url: string): ArrayBuffer {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const { enabled } = await api.pushKey()
    if (!enabled) return 'unconfigured'
  } catch {
    return 'unconfigured'
  }
  const registration = await navigator.serviceWorker.getRegistration()
  const existing = await registration?.pushManager.getSubscription()
  return existing ? 'on' : 'off'
}

/**
 * Asks, subscribes, and tells the server — in that order, and only as far as it
 * gets. A resident who declines leaves nothing behind on the server.
 */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'

  const { enabled, publicKey } = await api.pushKey()
  if (!enabled || !publicKey) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const registration = await navigator.serviceWorker.ready
  // Reuse whatever this browser already has: re-subscribing would hand back a
  // new endpoint and leave the old row on the server ringing into nothing.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by every browser that implements this: a push must always be
      // shown to the user, never delivered silently.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey),
    }))

  const raw = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return 'off'
  await api.savePushSubscription({
    endpoint: raw.endpoint,
    keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
  })
  return 'on'
}

/**
 * Off means off on this device: the browser subscription is dropped as well as
 * the server row, so a resident who turns it off does not keep a live
 * subscription the next sign-in would silently re-adopt.
 */
export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await api.removePushSubscription(subscription.endpoint).catch(() => undefined)
    await subscription.unsubscribe().catch(() => undefined)
  }
  return 'off'
}
