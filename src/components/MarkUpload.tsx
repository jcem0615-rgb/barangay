import { useEffect, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'

/**
 * A seal or a signature, as a console shows it: the picture on file, a button
 * to replace it and one to take it away.
 *
 * One component for all six of them — the municipal seal and the treasurer's
 * signature in the Municipality tab, each office head's signature beside that
 * office, and the barangay's seal and its two officials' signatures in the Hall
 * tab. They behave identically because they *are* identical: the same narrow
 * type set, the same 2 MB cap, the same freeze into whatever was issued while
 * they were on file.
 *
 * The image is fetched as a blob and handed to the DOM as an object URL,
 * because `<img src>` cannot carry the bearer token — the same reason the ID
 * portrait is loaded this way.
 */
export default function MarkUpload({
  title,
  blurb,
  present,
  updatedAt,
  keepsNote,
  readOnly,
  readOnlyNote,
  load,
  upload,
  remove,
  onChanged,
  shape = 'square',
}: {
  title: string
  blurb: string
  present: boolean
  updatedAt: string | null | undefined
  /** What happens to documents already issued, said in that document's words. */
  keepsNote: string
  readOnly?: boolean
  readOnlyNote?: string
  load: () => Promise<Blob | null>
  upload: (file: File) => Promise<unknown>
  remove: () => Promise<unknown>
  onChanged: () => Promise<void> | void
  /** A signature is wide and short; a seal is round. */
  shape?: 'square' | 'wide'
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!present) { setUrl(null); return }
    let live = true
    let objectUrl: string | null = null
    void load()
      .then((blob) => {
        // Null where the row says there is one and the stored file has gone.
        if (!live || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => setUrl(null))
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [present, updatedAt, load])

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const box = shape === 'wide' ? 'h-24 w-44' : 'h-24 w-24'
  const image = shape === 'wide' ? 'max-h-20 max-w-40' : 'max-h-20 max-w-20'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-display text-[14px] font-bold text-navy-950">{title}</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{blurb}</p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className={`flex ${box} shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50`}>
          {url ? (
            <img src={url} alt={title} className={`${image} object-contain`} />
          ) : (
            <span className="px-2 text-center text-[11px] text-slate-500">Nothing on file</span>
          )}
        </div>

        {readOnly ? (
          <p className="text-[12.5px] leading-snug text-slate-600">{readOnlyNote}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <label className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-900">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {present ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void run(() => upload(file))
                }}
              />
            </label>
            {present && (
              <button
                onClick={() => void run(remove)}
                disabled={busy}
                className="tap-target inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 disabled:opacity-60"
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        )}
      </div>

      {updatedAt && (
        <p className="mt-3 text-[12px] text-slate-500">
          Uploaded {new Date(updatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.
          {' '}{keepsNote}
        </p>
      )}
    </div>
  )
}

/**
 * The line that goes above every signature upload in both consoles.
 *
 * It is the same sentence everywhere on purpose. A picture of a signature makes
 * the paper look the way a counter expects and makes nothing tamper-evident,
 * and somebody uploading one is exactly the person who might assume otherwise.
 */
export function SignatureCaveat() {
  return (
    <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900">
      A signature here is a <strong>picture</strong> of one, not a digital signature. It makes
      the document look the way a counter expects; it does not make a forged copy
      detectable — the verification code printed beside it is what proves the document.
      Only upload a signature its owner has agreed to, and know that every upload and
      removal is recorded with your name against it.
    </p>
  )
}
