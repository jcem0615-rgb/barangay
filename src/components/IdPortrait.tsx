import { useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, Trash2, UserRound } from 'lucide-react'
import { useResidentPhoto } from '../lib/useResidentPhoto'
import { useT } from '../lib/i18n'

/** Mirrors MAX_PORTRAIT_BYTES in server/src/uploads.ts. */
const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024

/**
 * The face on the digital ID, and the controls to set it.
 *
 * The selfie input uses `capture="user"` — the front camera — because that is
 * what someone photographing themselves wants, and a resident should not have
 * to flip the camera round every time.
 */
export default function IdPortrait({ name }: { name: string }) {
  const { url, busy, error, upload, remove, hasPhoto } = useResidentPhoto()
  const selfieInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const { t } = useT()

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Compression usually brings a selfie well under this, but a picked file
    // could be anything, and refusing here saves the upload.
    if (file.size > MAX_PORTRAIT_BYTES * 4) {
      setSizeError(t('id.photoTooLarge'))
      return
    }
    setSizeError(null)
    await upload(file)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('id.photoTitle')}</p>
      <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
        {t('id.photoBlurb')}
      </p>

      <input
        ref={selfieInput}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onPicked}
        className="hidden"
      />
      <input
        ref={fileInput}
        type="file"
        accept=".jpg,.jpeg,.png,.heic"
        onChange={onPicked}
        className="hidden"
      />

      <div className="mt-3 flex items-center gap-4">
        <IdPortraitFrame url={url} name={name} size={72} busy={busy} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            disabled={busy}
            onClick={() => selfieInput.current?.click()}
            className="tap-target flex items-center justify-center gap-1.5 rounded-xl bg-navy-800 px-3 text-[calc(13px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-50"
          >
            <Camera size={14} /> {hasPhoto ? t('id.retakeSelfie') : t('id.takeSelfie')}
          </button>
          <button
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="tap-target flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 text-[calc(13px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-slate-50 disabled:opacity-50"
          >
            <ImageUp size={14} /> {t('id.choosePhoto')}
          </button>
          {hasPhoto && (
            <button
              disabled={busy}
              onClick={() => void remove()}
              className="flex items-center justify-center gap-1.5 py-1 text-[calc(12.5px_*_var(--text-scale))] font-medium text-rose-600 hover:underline disabled:opacity-50"
            >
              <Trash2 size={12} /> {t('id.removePhoto')}
            </button>
          )}
        </div>
      </div>

      {(error || sizeError) && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[calc(13px_*_var(--text-scale))] text-rose-700">
          {sizeError ?? error}
        </p>
      )}
    </div>
  )
}

/**
 * The portrait itself, shown wherever the ID is. Falls back to the resident's
 * initials rather than an empty box — a card with a grey silhouette on it looks
 * broken, and initials at least identify the holder.
 */
export function IdPortraitFrame({
  url, name, size, busy = false, onDark = false,
}: {
  url: string | null
  name: string
  size: number
  busy?: boolean
  onDark?: boolean
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${
        onDark ? 'bg-white/10 ring-1 ring-white/25' : 'bg-slate-100 ring-1 ring-slate-200'
      }`}
    >
      {busy ? (
        <Loader2 size={Math.round(size / 3)} className={onDark ? 'animate-spin text-white' : 'animate-spin text-slate-500'} />
      ) : url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        <span
          style={{ fontSize: Math.round(size / 2.6) }}
          className={`font-display font-extrabold ${onDark ? 'text-white/80' : 'text-slate-500'}`}
        >
          {initials}
        </span>
      ) : (
        <UserRound size={Math.round(size / 2)} className={onDark ? 'text-white/70' : 'text-slate-500'} />
      )}
    </span>
  )
}
