import { useCallback, useEffect, useState } from 'react'
import { Loader2, Phone } from 'lucide-react'
import { api, ApiError, type BarangayOffice as Office } from '../../lib/api'
import MarkUpload, { SignatureCaveat } from '../../components/MarkUpload'

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

/** The editable text fields. The seal and the signatures are state, not fields. */
type EditableKey = 'captain' | 'secretary' | 'hallAddress' | 'officeHours' | 'phone' | 'email'

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
        The seal and the two signatures. They are on this tab rather than beside
        the certificate queue because they are facts about the hall, like its
        address and who holds its two offices — and like those, they are printed
        on every certificate this barangay releases.
      */}
      <div className="mb-4 space-y-4">
        <MarkUpload
          title="Barangay seal"
          blurb="Printed at the head of every certificate this barangay releases, and faintly behind it. PNG or JPEG only — those are the two a certificate can actually be printed with, so anything else is refused rather than accepted and silently left off. A transparent PNG looks best."
          present={office.hasSeal ?? false}
          updatedAt={office.sealUpdatedAt}
          keepsNote="Certificates released before now keep the seal they were printed with."
          readOnly={readOnly}
          readOnlyNote="The barangay administrator uploads this."
          load={api.barangaySeal}
          upload={(file) => api.uploadBarangaySeal(file)}
          remove={() => api.removeBarangaySeal()}
          onChanged={load}
        />

        <SignatureCaveat />

        <MarkUpload
          title="Punong Barangay's signature"
          shape="wide"
          blurb={`Printed above ${office.captain ?? 'the captain'}'s name under "Issued by". Scan it on white paper and upload a transparent PNG if you can — a photograph with a grey background prints as a grey box.`}
          present={office.hasCaptainSignature ?? false}
          updatedAt={office.captainSignatureUpdatedAt}
          keepsNote="Certificates released before now keep the signature they were printed with."
          readOnly={readOnly}
          readOnlyNote="The barangay administrator uploads this."
          load={() => api.barangaySignature('captain')}
          upload={(file) => api.uploadBarangaySignature('captain', file)}
          remove={() => api.removeBarangaySignature('captain')}
          onChanged={load}
        />

        <MarkUpload
          title="Barangay Secretary's signature"
          shape="wide"
          blurb={`Printed above ${office.secretary ?? 'the secretary'}'s name under "Attested by". Leave it empty and the certificate prints the rule and the title, so the paper can still be signed by hand.`}
          present={office.hasSecretarySignature ?? false}
          updatedAt={office.secretarySignatureUpdatedAt}
          keepsNote="Certificates released before now keep the signature they were printed with."
          readOnly={readOnly}
          readOnlyNote="The barangay administrator uploads this."
          load={() => api.barangaySignature('secretary')}
          upload={(file) => api.uploadBarangaySignature('secretary', file)}
          remove={() => api.removeBarangaySignature('secretary')}
          onChanged={load}
        />
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
