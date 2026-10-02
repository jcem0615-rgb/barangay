import { useCallback, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Loader2, Trash2, Video, X,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError } from '../lib/api'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import type { StringKey } from '../i18n/strings'

/** Must match the server's enum; the labels are translated, the values are not. */
const KINDS: Array<{ id: string; label: StringKey }> = [
  { id: 'flood', label: 'incident.kind.flood' },
  { id: 'fire', label: 'incident.kind.fire' },
  { id: 'road', label: 'incident.kind.road' },
  { id: 'power', label: 'incident.kind.power' },
  { id: 'medical', label: 'incident.kind.medical' },
  { id: 'crime', label: 'incident.kind.crime' },
  { id: 'garbage', label: 'incident.kind.garbage' },
  { id: 'other', label: 'incident.kind.other' },
]

const MAX_VIDEO_SECONDS = 30 * 60
const MAX_FILES = 6

interface Pending {
  file: File
  url: string
  isVideo: boolean
  durationSeconds: number | null
}

/**
 * Reporting something that has gone wrong, with evidence.
 *
 * Capture hands the job to the phone's own camera app
 * (`capture="environment"`), the same reasoning as photographing a requirement:
 * the native camera focuses, uses the flash and applies the phone's processing,
 * and an in-page `getUserMedia` preview would be a worse picture and more code.
 *
 * **Video duration is checked here, before anything uploads.** Duration is only
 * cheaply knowable where the file and a decoder already are, and finding out a
 * clip was too long after pushing it over mobile data is not a usable answer.
 */
export default function ReportIncident() {
  const { replace } = useNav()
  const { t } = useT()
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState('flood')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ referenceNo: string } | null>(null)

  /** Reads duration off the file itself, which is the only honest way to know. */
  const videoDuration = (file: File) =>
    new Promise<number | null>((resolve) => {
      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => {
        const seconds = Number.isFinite(probe.duration) ? probe.duration : null
        URL.revokeObjectURL(probe.src)
        resolve(seconds)
      }
      // A container the browser cannot read tells us nothing; the server's byte
      // cap is what stops it either way.
      probe.onerror = () => resolve(null)
      probe.src = URL.createObjectURL(file)
    })

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      setError(null)
      const next: Pending[] = []
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/')
        const duration = isVideo ? await videoDuration(file) : null
        if (isVideo && duration !== null && duration > MAX_VIDEO_SECONDS) {
          setError(t('incident.videoTooLong'))
          continue
        }
        next.push({ file, url: URL.createObjectURL(file), isVideo, durationSeconds: duration })
      }
      setPending((current) => [...current, ...next].slice(0, MAX_FILES))
    },
    [t]
  )

  const remove = (index: number) =>
    setPending((current) => {
      const copy = [...current]
      const [gone] = copy.splice(index, 1)
      if (gone) URL.revokeObjectURL(gone.url)
      return copy
    })

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const report = await api.reportIncident({
        kind,
        description: description.trim(),
        location: location.trim() || undefined,
      })
      // Evidence goes up after the report exists, so a failed upload leaves a
      // filed report rather than losing the whole thing.
      for (const item of pending) {
        await api.addIncidentEvidence(report.id, item.file, item.durationSeconds)
      }
      setDone({ referenceNo: report.referenceNo })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('incident.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[calc(19px_*_var(--text-scale))] font-extrabold text-navy-950">
          {t('incident.sentTitle')}
        </h1>
        <p className="mt-2 max-w-xs text-[calc(14.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
          {t('incident.sentBlurb', { ref: done.referenceNo })}
        </p>
        <p className="mt-3 max-w-xs text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
          {t('incident.sentNotEmergency')}
        </p>
        <button
          onClick={() => replace({ name: 'emergency' })}
          className="mt-7 w-full max-w-xs rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          {t('common.done')}
        </button>
      </div>
    )
  }

  const canSubmit = description.trim().length >= 10 && !busy

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={t('incident.title')} />

      <div className="px-4 pt-4">
        {/* Said first and plainly: this is not how you reach somebody now. */}
        <p className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" />
          {t('incident.notEmergency')}
        </p>

        <p className="mb-2 mt-5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
          {t('incident.kindLabel')}
        </p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <button
              key={option.id}
              onClick={() => setKind(option.id)}
              className={`tap-target rounded-xl border px-3.5 text-[calc(13px_*_var(--text-scale))] font-semibold transition ${
                kind === option.id
                  ? 'border-navy-800 bg-navy-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        <label className="mt-5 block">
          <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
            {t('incident.descriptionLabel')}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t('incident.descriptionPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
            {t('incident.locationLabel')}
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={300}
            placeholder={t('incident.locationPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
          />
          <span className="mt-1 block text-[calc(12px_*_var(--text-scale))] text-slate-500">
            {t('incident.locationHint')}
          </span>
        </label>

        <p className="mb-2 mt-5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
          {t('incident.evidenceLabel')}
        </p>
        <p className="mb-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
          {t('incident.evidenceHint')}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {/* The phone's own camera, not an in-page preview. */}
          <button
            onClick={() => photoInput.current?.click()}
            disabled={pending.length >= MAX_FILES}
            className="tap-target flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50 disabled:opacity-50"
          >
            <Camera size={16} /> {t('incident.takePhoto')}
          </button>
          <button
            onClick={() => videoInput.current?.click()}
            disabled={pending.length >= MAX_FILES}
            className="tap-target flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50 disabled:opacity-50"
          >
            <Video size={16} /> {t('incident.recordVideo')}
          </button>
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }}
        />

        {pending.length > 0 && (
          <ul className="mt-3 space-y-2">
            {pending.map((item, index) => (
              <li
                key={item.url}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5"
              >
                {item.isVideo ? (
                  <video src={item.url} className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover" muted />
                ) : (
                  <img src={item.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[calc(13px_*_var(--text-scale))] font-medium text-navy-950">
                    {item.isVideo ? t('incident.videoFile') : t('incident.photoFile')}
                  </span>
                  <span className="block text-[calc(12px_*_var(--text-scale))] text-slate-500">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    {item.durationSeconds !== null &&
                      ` · ${Math.floor(item.durationSeconds / 60)}m ${Math.round(item.durationSeconds % 60)}s`}
                  </span>
                </span>
                <button
                  onClick={() => remove(index)}
                  aria-label={t('common.remove')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
            <X size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? t('incident.sending') : t('incident.send')}
        </button>
      </div>
    </div>
  )
}
