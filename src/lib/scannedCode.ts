/**
 * The verification code a clerk arrived with, from scanning a resident's ID.
 *
 * The QR on the ID is a link to this app carrying `?verify=<code>`, so a clerk
 * scans with their phone's own camera and lands here with the code already in
 * hand. It is read once, at startup, and taken straight out of the address bar:
 * a code works exactly once, so leaving it in the URL would only give a reload
 * a code the server has already spent.
 *
 * Held in memory rather than consumed on read, because the clerk may still have
 * to sign in before the console can use it — and signing in does not reload the
 * page. (A 90-second code will usually have expired by then, which is the right
 * answer: the resident taps for a new one.)
 */
const params = new URLSearchParams(window.location.search)
let pending = params.get('verify')

if (pending !== null) {
  params.delete('verify')
  const rest = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
}

/** The scanned code, if this session started from one. Cleared once taken. */
export function takeScannedCode(): string | null {
  const code = pending
  pending = null
  return code
}

/** Whether a scanned code is still waiting to be used. */
export function hasScannedCode(): boolean {
  return pending !== null
}
