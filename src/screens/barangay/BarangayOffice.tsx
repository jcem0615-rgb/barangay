import { useCallback, useEffect, useState } from 'react'
import { Loader2, Phone, Trash2, Upload } from 'lucide-react'
import { api, ApiError, type BarangayOffice as Office } from '../../lib/api'

/**
 * The hall's own details, as residents read them.
 *
 * This is the only screen in the barangay console whose output is on a
 * resident's phone, apart from the notice board — and it exists because of one
 * status. "For pickup" asks somebody to travel, and for a long time it said
 * nothing about when the hall is open or what to ring first, which is how the
 * wasted trip this whole tier exists to prevent happens anyway.
 *
 * Both roles read it; only the administrator saves. An officer who cannot see
 * what residents are being told cannot notice that it is wrong, so hiding it
 * from them would buy nothing — and the API refuses their write regardless,
 * which is the half that matters.
 *
 * **The barangay's name is not editable here**, and that is the same rule that
 * stops a browser naming the municipality: what a place is called belongs to the
 * register. What a barangay corrects is who holds its offices and how to reach
 * it, which is what changes at every barangay election.
 */

/** The editable text fields. `hasSeal` is read-only state, not a form field. */
type EditableKey = keyof Omit<Office, 'id' | 'name' | 'hasSeal' | 'sealUpdatedAt'>

const FIELDS: Array<{
  key: EditableKey
  label: string
  help: string
  type?: 'tel' | 'email'
}> = [
  {
    key: 'captain',
    label: 'Punong Barangay',
    help: 'Printed on every certificate this barangay issues.',
  },
  {
    key: 'secretary',
    label: 'Barangay Secretary',
    help: 'Also printed on certificates, and the person residents are sent to.',
  },
  {
    key: 'hallAddress',
    label: 'Where the hall is',
    help: 'As somebody unfamiliar with the barangay would be told to find it.',
  },
  {
    key: 'officeHours',
    label: 'When it is open',
    help: 'The one line residents are shown when a certificate is ready for pickup. Write the real hours, including a lunch break if the counter closes for one.',
  },
  {
    key: 'phone',
    label: 'Phone',
    help: 'Shown as a tap-to-call button. Ring it yourself before you save it.',
    type: 'tel',
  },
  {
    key: 'email',
    label: 'Email',
    help: 'Optional. Leave it blank rather than giving one nobody reads.',
    type: 'email',
  },
]

export default function BarangayOffice({ readOnly }: { readOnly: boolean }) {
  const [office, setOffice] = useState<Office | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seal, setSeal] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const row = await api.barangayOffice()
      setOffice(row)
      setDrafts(
        Object.fromEntries(FIELDS.map((f) => [f.key, row[f.key] ?? '']))
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the hall details.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Fetched as a blob and handed to the DOM as an object URL, because <img src>
  // cannot carry the bearer token — the same reason the ID portrait is loaded
  // this way.
  useEffect(() => {
    if (!office?.hasSeal) { setSeal(null); return }
    let url: string | null = null
    let live = true
    void api.barangaySeal()
      .then((blob) => {
        if (!live || !blob) return
        url = URL.createObjectURL(blob)
        setSeal(url)
      })
      .catch(() => setSeal(null))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [office?.hasSeal, office?.sealUpdatedAt])

  const withSeal = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the seal.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      // Only what actually moved, so a save never rewrites a field somebody
      // else corrected while this form was open.
      const patch: Record<string, string | null> = {}
      for (const field of FIELDS) {
        const next = (drafts[field.key] ?? '').trim()
        const current = office?.[field.key] ?? ''
        if (next !== current) patch[field.key] = next === '' ? null : next
      }
      if (Object.keys(patch).length === 0) {
        setSaved(true)
        return
      }
      const updated = await api.updateBarangayOffice(patch)
      setOffice(updated)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  if (!office) {
    return error
      ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      : <Loader2 size={18} className="animate-spin text-slate-400" />
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
        What residents are told about this barangay. The hours below are shown on
        a resident's phone the moment a certificate is marked ready for pickup, so
        a wrong line here sends somebody to a closed hall — which is the trip this
        app exists to save them. Every change is recorded with the old value and
        who changed it.
      </p>

      {readOnly && (
        <p className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-[12.5px] leading-snug text-slate-600">
          The barangay administrator changes these. Tell them if something here is
          out of date — residents are acting on it.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      {/*
        The seal. It is on this tab rather than beside the certificate queue
        because it is a fact about the hall, like its address and who holds its
        two offices — and like those, it is printed on every certificate this
        barangay releases.
      */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="font-display text-[14px] font-bold text-navy-950">Barangay seal</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
          Printed at the head of every certificate this barangay releases, and faintly
          behind it. PNG or JPEG only — those are the two a certificate can actually be
          printed with, so anything else is refused rather than accepted and silently left
          off. A transparent PNG looks best.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {seal ? (
              <img src={seal} alt="This barangay's seal" className="max-h-20 max-w-20 object-contain" />
            ) : (
              <span className="px-2 text-center text-[11px] text-slate-500">No seal</span>
            )}
          </div>
          {readOnly ? (
            <p className="text-[12.5px] leading-snug text-slate-600">
              The barangay administrator uploads this.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-900">
                <Upload size={14} /> {office.hasSeal ? 'Replace seal' : 'Upload seal'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void withSeal(() => api.uploadBarangaySeal(file))
                  }}
                />
              </label>
              {office.hasSeal && (
                <button
                  onClick={() => void withSeal(() => api.removeBarangaySeal())}
                  disabled={busy}
                  className="tap-target inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 disabled:opacity-60"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
          )}
        </div>
        {office.sealUpdatedAt && (
          <p className="mt-3 text-[12px] text-slate-500">
            Uploaded {new Date(office.sealUpdatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.
            Certificates released before now keep the seal they were printed with.
          </p>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">{field.label}</span>
            <input
              value={drafts[field.key] ?? ''}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
              disabled={readOnly}
              type={field.type ?? 'text'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] text-navy-950 outline-none focus:border-navy-600 focus:bg-white disabled:text-slate-500"
            />
            <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">{field.help}</span>
          </label>
        ))}

        {!readOnly && (
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} Save
            </button>
            {saved && <span className="text-[12.5px] font-medium text-emerald-700">Saved.</span>}
            {office.phone && (
              <a
                href={`tel:${office.phone.replace(/[^\d+]/g, '')}`}
                className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-navy-800 underline"
              >
                <Phone size={13} /> Ring {office.phone}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
