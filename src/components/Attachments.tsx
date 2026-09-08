import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, FileUp, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { api, ApiError, type Attachment } from '../lib/api'
import { saveBlob } from '../lib/download'
import { useT } from '../lib/i18n'

/** Mirrors MAX_FILE_BYTES in server/src/uploads.ts. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Whether to offer the camera at all.
 *
 * `enumerateDevices` reports the kind of each device without needing permission
 * first, so this asks nothing of the resident. It is unavailable outside a
 * secure context, and there a phone is still overwhelmingly likely to have a
 * camera — so a touch device gets the button rather than losing the feature to
 * a failed capability check.
 */
function useHasCamera(): boolean {
  const [hasCamera, setHasCamera] = useState(false)

  useEffect(() => {
    let cancelled = false
    const devices = navigator.mediaDevices
    if (!devices?.enumerateDevices) {
      setHasCamera(navigator.maxTouchPoints > 0)
      return
    }
    devices
      .enumerateDevices()
      .then((list) => {
        if (!cancelled) setHasCamera(list.some((d) => d.kind === 'videoinput'))
      })
      .catch(() => {
        if (!cancelled) setHasCamera(navigator.maxTouchPoints > 0)
      })
    return () => { cancelled = true }
  }, [])

  return hasCamera
}

/**
 * The requirement checklist for a request. Residents attach a file against each
 * stated requirement so the office can see what has and hasn't been supplied.
 */
export default function Attachments({
  requestId, requirements, editable,
}: {
  requestId: string
  requirements: string[]
  editable: boolean
}) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<string | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const hasCamera = useHasCamera()
  const { t } = useT()

  const load = useCallback(async () => {
    try {
      setFiles(await api.attachments(requestId))
    } catch {
      // A request the resident can't read would already have failed upstream.
    }
  }, [requestId])

  useEffect(() => { void load() }, [load])

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after an error
    if (!file) return

    // The server refuses this too, but only after the whole file has crossed a
    // mobile connection. Checking here costs nothing and saves the upload.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      pending.current = undefined
      setError(t('files.tooLarge', { size: formatSize(file.size) }))
      return
    }

    setBusy(pending.current ?? 'file')
    setError(null)
    try {
      await api.attach(requestId, file, pending.current)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('files.failed'))
    } finally {
      setBusy(null)
      pending.current = undefined
    }
  }

  /** `source` decides which input opens: the file picker or the camera. */
  function pick(requirement: string | undefined, source: 'file' | 'camera') {
    pending.current = requirement
    ;(source === 'camera' ? cameraInput : fileInput).current?.click()
  }

  const attachedFor = (requirement: string) => files.find((f) => f.requirement === requirement)
  const extras = files.filter((f) => !f.requirement || !requirements.includes(f.requirement))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-1 text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('files.title')}</p>
      <p className="mb-3 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
        {editable
          ? t('files.helpEditable')
          : t('files.helpReadOnly')}
      </p>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        onChange={onPicked}
        className="hidden"
      />
      {/*
        `capture` hands the phone's own camera app the job rather than a
        getUserMedia preview in the page: it focuses, uses the flash, and
        produces a document photo an office can actually read.
      */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPicked}
        className="hidden"
      />

      <ul className="space-y-2">
        {requirements.map((requirement) => {
          const file = attachedFor(requirement)
          return (
            <li key={requirement} className="rounded-xl border border-slate-200 p-3">
              <p className="text-[calc(13.5px_*_var(--text-scale))] font-medium text-navy-950">{requirement}</p>
              {file ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Paperclip size={13} className="shrink-0 text-emerald-600" />
                  <button
                    onClick={async () => {
                      const { blob, fileName } = await api.attachmentFile(requestId, file.id)
                      saveBlob(blob, fileName)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[calc(13px_*_var(--text-scale))] text-navy-800 underline-offset-2 hover:underline"
                  >
                    {file.fileName}
                  </button>
                  <span className="shrink-0 text-[calc(12px_*_var(--text-scale))] text-slate-500">{formatSize(file.byteSize)}</span>
                  {editable && (
                    <button
                      aria-label={`Remove ${file.fileName}`}
                      onClick={async () => {
                        await api.removeAttachment(requestId, file.id)
                        await load()
                      }}
                      className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ) : editable ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {busy === requirement ? (
                    <span className="flex items-center gap-1.5 text-[calc(13px_*_var(--text-scale))] font-semibold text-slate-600">
                      <Loader2 size={14} className="animate-spin" /> {t('files.uploading')}
                    </span>
                  ) : (
                    <>
                      {hasCamera && (
                        <button
                          disabled={busy !== null}
                          onClick={() => pick(requirement, 'camera')}
                          className="tap-target flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 text-[calc(13px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-50"
                        >
                          <Camera size={14} /> {t('files.takePhoto')}
                        </button>
                      )}
                      <button
                        disabled={busy !== null}
                        onClick={() => pick(requirement, 'file')}
                        className="tap-target flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-[calc(13px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-slate-50 disabled:opacity-50"
                      >
                        <FileUp size={14} /> {t('files.attach')}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] text-amber-700">{t('files.notSubmitted')}</p>
              )}
            </li>
          )
        })}
      </ul>

      {extras.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {extras.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-1">
              <Paperclip size={13} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-[calc(13px_*_var(--text-scale))] text-slate-600">{file.fileName}</span>
              <span className="shrink-0 text-[calc(12px_*_var(--text-scale))] text-slate-500">{formatSize(file.byteSize)}</span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-3 flex gap-2">
          {hasCamera && (
            <button
              disabled={busy !== null}
              onClick={() => pick(undefined, 'camera')}
              className="tap-target flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600 disabled:opacity-50"
            >
              <Camera size={14} /> {t('files.takePhoto')}
            </button>
          )}
          <button
            disabled={busy !== null}
            onClick={() => pick(undefined, 'file')}
            className="tap-target flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600 disabled:opacity-50"
          >
            <FileUp size={14} /> {t('files.attachAnother')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">{error}</p>
      )}
    </div>
  )
}
