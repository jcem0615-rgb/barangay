/**
 * The document code somebody arrived with, from scanning the QR on a permit,
 * a receipt or a barangay certificate.
 *
 * **Deliberately a different parameter from the ID card's `?verify=`.** That
 * one opens a staff-only identity check against a code that is spent the first
 * time it is used; this one opens a public document check that anybody may run
 * as often as they like. Telling two checks apart by the shape of the code
 * would be exactly the kind of filter that eventually gets it wrong, so they do
 * not share a parameter.
 *
 * Unlike the ID code, this one is **left in the address bar**. A document code
 * is public and repeatable, so the link is worth being able to reload, bookmark
 * or send to a colleague — and a reload landing back on the same answer is the
 * honest behaviour. It is cleared when the check is closed, which is the point
 * at which the reader has moved on.
 */
const PARAM = 'doc'

/** The code this page was opened with, if any. */
export function scannedDocumentCode(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(PARAM)
}

/** Takes it back out of the address bar, once the reader has closed the check. */
export function clearScannedDocumentCode(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has(PARAM)) return
  params.delete(PARAM)
  const rest = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
}
