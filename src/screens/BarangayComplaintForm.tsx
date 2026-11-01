import { useCallback, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Loader2, Trash2, Video,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError } from '../lib/api'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import type { StringKey } from '../i18n/strings'

/** Must match the server's list; the labels are translated, the values are not. */
const CATEGORIES: Array<{ id: string; label: StringKey }> = [
  { id: 'garbage', label: 'brgyComplaint.cat.garbage' },
  { id: 'road', label: 'brgyComplaint.cat.road' },
  { id: 'water', label: 'brgyComplaint.cat.water' },
  { id: 'drainage', label: 'brgyComplaint.cat.drainage' },
  { id: 'streetlight', label: 'brgyComplaint.cat.streetlight' },
  { id: 'noise', label: 'brgyComplaint.cat.noise' },
  { id: 'animals', label: 'brgyComplaint.cat.animals' },
  { id: 'neighbour', label: 'brgyComplaint.cat.neighbour' },
  { id: 'peace', label: 'brgyComplaint.cat.peace' },
  { id: 'other', label: 'brgyComplaint.cat.other' },
]

/**
 * Five minutes, and it has to agree with the server's
 * `MAX_COMPLAINT_VIDEO_SECONDS` — this is the copy that saves the upload, and
 * the server's is the copy that is true.
 */
const MAX_VIDEO_SECONDS = 5 * 60
const MAX_FILES = 6
const MAX_CHARS = 1500

interface Pending {
  file: File
  url: string
  isVideo: boolean
  durationSeconds: number | null
}

/**
 * A resident complaining to their own barangay, with proof.
 *
 * **Capture hands the job to the phone's own camera app**
 * (`capture="environment"`), the same reasoning as photographing a requirement
 * or an incident: the native camera focuses, uses the flash and applies the
 * phone's processing, and an in-page `getUserMedia` preview would be a worse
 * picture and more code.
 *
 * **Duration is checked here, before anything uploads.** It is only cheaply
 * knowable where the file and a decoder already are, and finding out a clip was
 * too long after pushing it over mobile data is the answer nobody can use. The
 * server bounds what it is told rather than trusting it, and the byte cap is
 * the limit that does not depend on this screen at all.
 *
 * **The character count counts down rather than cutting off.** `maxLength`
 * alone silently swallows the end of a long account, and the details field is
 * the whole point of the screen — it is the only place the resident says what
 * is actually wrong.
 */
export default function BarangayComplaintForm() {
  const { replace, push } = useNav()
  const { t } = useT()
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const [category, setCategory] = useState('garbage')
  const [details, setDetails] = useState('')
  const [location, setLocation] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ referenceNo: string } | null>(null)

  const left = MAX_CHARS - details.length

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
      // cap stops it either way.
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
          // Says how long it actually is, not just that it is too long — a
          // resident who has to guess how much to cut records it twice.
          setError(
            t('brgyComplaint.videoTooLong', {
              seconds: String(Math.round(duration)),
              minutes: String(MAX_VIDEO_SECONDS / 60),
            })
          )
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
      const complaint = await api.fileBarangayComplaint({
        category,
        details: details.trim(),
        location: location.trim() || undefined,
      })
      // Proof goes up after the complaint exists, so a failed upload leaves a
      // filed complaint rather than losing what they wrote.
      for (const item of pending) {
        await api.addComplaintProof(complaint.id, item.file, item.durationSeconds)
      }
      setDone({ referenceNo: complaint.referenceNo })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('brgyComplaint.failed'))
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
          {t('brgyComplaint.sentTitle')}
        </h1>
        <p className="mt-2 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
          {t('brgyComplaint.sentBody')}
        </p>
        <p className="font-display mt-3 text-[calc(16px_*_var(--text-scale))] font-extrabold tracking-wide text-navy-800">
          {done.referenceNo}
        </p>
        <button
          onClick={() => replace({ name: 'barangay-complaints' })}
          className="tap-target mt-7 w-full max-w-xs rounded-xl bg-navy-800 px-5 text-[calc(14px_*_var(--text-scale))] font-semibold text-white active:bg-navy-950"
        >
          {t('brgyComplaint.mineTitle')}
        </button>
        <button
          onClick={() => push({ name: 'barangay' })}
          className="tap-target mt-2 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-5 text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50"
        >
          {t('common.done')}
        </button>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={t('brgyComplaint.navTitle')} />

      <div className="px-4 pt-4">
        <p className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
          {t('brgyComplaint.intro')}
        </p>

        {/* Said plainly and early: this is not how you reach somebody now. */}
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" />
          {t('brgyComplaint.notEmergency')}
        </p>

        <p className="mb-2 mt-5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
          {t('brgyComplaint.categoryLabel')}
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((option) => (
            <button
              key={option.id}
              onClick={() => setCategory(option.id)}
              className={`tap-target rounded-xl border px-3.5 text-[calc(13px_*_var(--text-scale))] font-semibold transition ${
                category === option.id
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        <label className="mt-5 block">
          <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
            {t('brgyComplaint.detailsLabel')}
          </span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, MAX_CHARS))}
            rows={6}
            placeholder={t('brgyComplaint.detailsHint')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
          />
          <span
            className={`mt-1 block text-right text-[calc(12px_*_var(--text-scale))] ${
              left <= 100 ? 'font-semibold text-amber-700' : 'text-slate-500'
            }`}
          >
            {t('brgyComplaint.charsLeft', { n: String(left) })}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
            {t('brgyComplaint.locationLabel')}
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={300}
            placeholder={t('brgyComplaint.locationHint')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
          />
        </label>

        <p className="mb-1 mt-5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
          {t('brgyComplaint.addProofTitle')}
        </p>
        <p className="mb-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
          {t('brgyComplaint.addProofHint', {
            minutes: String(MAX_VIDEO_SECONDS / 60),
            files: String(MAX_FILES),
          })}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {/* The phone's own camera, not an in-page preview. */}
          <button
            onClick={() => photoInput.current?.click()}
            disabled={pending.length >= MAX_FILES}
            className="tap-target flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50 disabled:opacity-50"
          >
            <Camera size={16} /> {t('brgyComplaint.takePhoto')}
          </button>
          <button
            onClick={() => videoInput.current?.click()}
            disabled={pending.length >= MAX_FILES}
            className="tap-target flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50 disabled:opacity-50"
          >
            <Video size={16} /> {t('brgyComplaint.recordVideo')}
          </button>
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />

        {pending.length > 0 && (
          <ul className="mt-3 space-y-2">
            {pending.map((item, index) => (
              <li
                key={item.url}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5"
              >
                {item.isVideo ? (
                  <video src={item.url} className="h-12 w-12 rounded-lg object-cover" muted />
                ) : (
                  <img src={item.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
                  {item.file.name}
                  {item.durationSeconds !== null &&
                    ` · ${Math.floor(item.durationSeconds / 60)}m ${Math.round(item.durationSeconds % 60)}s`}
                </span>
                <button
                  onClick={() => remove(index)}
                  aria-label={t('common.remove')}
                  className="tap-target shrink-0 rounded-lg px-2 text-slate-400 active:bg-slate-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-900">
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={busy || details.trim().length < 10}
          className="tap-target mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-[calc(14.5px_*_var(--text-scale))] font-semibold text-white active:bg-emerald-800 disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? t('brgyComplaint.sending') : t('brgyComplaint.submit')}
        </button>
      </div>
    </div>
  )
}
