import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Loader2, ScanLine, ShieldX } from 'lucide-react'
import { api, ApiError, type IdCheck } from '../../lib/api'
import { useCatalogue } from '../../lib/catalogue'
import { takeScannedCode } from '../../lib/scannedCode'

/**
 * Checking a digital ID a resident is showing at the counter.
 *
 * The clerk types the code from the resident's screen. What comes back is only
 * what the check is for: a face to compare, a name, where they live, and the
 * entitlements that are live right now — read from the record, not from
 * whatever the card was showing when it was screenshotted.
 *
 * This is not a lookup. The only way in is a code the resident chose to show,
 * which dies in ninety seconds and works once, so every check is one the
 * resident started.
 */
export default function StaffVerifyId() {
  const { programs } = useCatalogue()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<IdCheck | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBroken, setPhotoBroken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrl = useRef<string | null>(null)

  const showPhoto = useCallback((blob: Blob | null) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = blob ? URL.createObjectURL(blob) : null
    setPhoto(objectUrl.current)
  }, [])

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])

  // A clerk who arrived by scanning the resident's QR has the code already;
  // running it here is the whole point of the scan. Taken rather than read, so
  // a re-render cannot spend the same single-use code twice.
  useEffect(() => {
    const scanned = takeScannedCode()
    if (scanned) void check(scanned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function check(scanned?: string) {
    const entered = (scanned ?? code).trim()
    if (!entered) return
    setBusy(true)
    setError(null)
    setResult(null)
    showPhoto(null)
    setPhotoBroken(false)
    try {
      const found = await api.verifyId(entered)
      setResult(found)
      setCode('')
      if (found.hasPhoto) showPhoto(await api.verifiedPhoto(found.residentId).catch(() => null))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check that code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-2.5">
          <ScanLine size={18} className="mt-0.5 shrink-0 text-navy-800" />
          <div>
            <h2 className="font-display text-[15px] font-bold text-navy-950">Verify a digital ID</h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
              Scan the QR on the resident's ID screen with your phone, or type the code printed
              under it. Either way it works once and expires after 90 seconds, so a screenshot of
              someone else's ID will not check out.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') void check() }}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-label="Verification code"
            className="font-display min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[16px] font-bold tracking-[0.08em] tabular-nums outline-none focus:border-navy-600 focus:bg-white"
          />
          <button
            onClick={() => void check()}
            disabled={busy || code.trim().length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-5 text-[13.5px] font-semibold text-white active:bg-navy-900 disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Check
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3">
            <ShieldX size={16} className="mt-0.5 shrink-0 text-rose-600" />
            <p className="text-[13px] leading-snug text-rose-800">{error}</p>
          </div>
        )}
      </div>

      {result && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-300 bg-white">
          <p className="flex items-center gap-2 bg-emerald-50 px-5 py-3 text-[13.5px] font-bold text-emerald-800">
            <BadgeCheck size={17} /> Valid — issued by this municipality
          </p>

          <div className="flex items-start gap-4 p-5">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
              {photo && !photoBroken ? (
                <img
                  src={photo}
                  alt=""
                  // A file that will not decode must read as a missing photo,
                  // not as a broken page — a clerk should reach for the
                  // physical ID, not wonder whether the app is working.
                  onError={() => setPhotoBroken(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-2 text-center text-[11.5px] leading-snug text-slate-500">
                  {result.hasPhoto && (photoBroken || !photo)
                    ? 'Photo unavailable — check the physical ID'
                    : 'No photo on file'}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] font-extrabold leading-tight text-navy-950">
                {result.fullName}
              </p>
              <p className="mt-0.5 text-[13px] text-slate-600">
                {[result.barangay, result.municipality, result.province].filter(Boolean).join(', ')}
              </p>
              {result.philSysLast4 && (
                <p className="mt-1 text-[12.5px] text-slate-500">
                  PhilSys ending <span className="font-semibold tabular-nums text-navy-950">{result.philSysLast4}</span>
                </p>
              )}
              <p className="mt-1 text-[11.5px] text-slate-500">
                Checked {new Date(result.checkedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              Entitlements on record now
            </p>
            {result.programs.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-slate-600">
                None. No municipal discount or assistance applies.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {result.programs.map((p) => {
                  const def = programs.find((d) => d.code === p.code)
                  return (
                    <li key={p.code} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-navy-950">
                          {def?.name ?? p.code}
                          {p.expired && (
                            <span className="ml-1.5 text-[11.5px] font-medium text-amber-800">expired</span>
                          )}
                        </span>
                        {def && (
                          <span className="block text-[12px] leading-snug text-slate-600">{def.benefit}</span>
                        )}
                      </span>
                      {p.referenceNo && (
                        <span className="shrink-0 text-[12px] tabular-nums text-slate-500">{p.referenceNo}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
