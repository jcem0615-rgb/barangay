import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { api, ApiError, type Attachment } from '../lib/api'
import { saveBlob } from '../lib/download'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const input = useRef<HTMLInputElement>(null)

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
    setBusy(pending.current ?? 'file')
    setError(null)
    try {
      await api.attach(requestId, file, pending.current)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not attach that file.')
    } finally {
      setBusy(null)
      pending.current = undefined
    }
  }

  function pick(requirement?: string) {
    pending.current = requirement
    input.current?.click()
  }

  const attachedFor = (requirement: string) => files.find((f) => f.requirement === requirement)
  const extras = files.filter((f) => !f.requirement || !requirements.includes(f.requirement))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-1 text-[13px] font-bold text-navy-950">Requirements</p>
      <p className="mb-3 text-[11.5px] text-slate-500">
        {editable
          ? 'Attach a photo or PDF of each requirement. Max 10 MB per file.'
          : 'Files submitted with this request.'}
      </p>

      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={onPicked} className="hidden" />

      <ul className="space-y-2">
        {requirements.map((requirement) => {
          const file = attachedFor(requirement)
          return (
            <li key={requirement} className="rounded-xl border border-slate-200 p-3">
              <p className="text-[12.5px] font-medium text-navy-950">{requirement}</p>
              {file ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Paperclip size={13} className="shrink-0 text-emerald-600" />
                  <button
                    onClick={async () => {
                      const { blob, fileName } = await api.attachmentFile(requestId, file.id)
                      saveBlob(blob, fileName)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[12px] text-navy-800 underline-offset-2 hover:underline"
                  >
                    {file.fileName}
                  </button>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatSize(file.byteSize)}</span>
                  {editable && (
                    <button
                      aria-label={`Remove ${file.fileName}`}
                      onClick={async () => {
                        await api.removeAttachment(requestId, file.id)
                        await load()
                      }}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ) : editable ? (
                <button
                  disabled={busy !== null}
                  onClick={() => pick(requirement)}
                  className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-navy-800 disabled:opacity-50"
                >
                  {busy === requirement ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                  {busy === requirement ? 'Uploading…' : 'Attach file'}
                </button>
              ) : (
                <p className="mt-1 text-[11.5px] text-amber-700">Not submitted</p>
              )}
            </li>
          )
        })}
      </ul>

      {extras.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {extras.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-1">
              <Paperclip size={13} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{file.fileName}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{formatSize(file.byteSize)}</span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <button
          disabled={busy !== null}
          onClick={() => pick(undefined)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-[12.5px] font-medium text-slate-500 disabled:opacity-50"
        >
          <FileUp size={14} /> Attach another file
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>
      )}
    </div>
  )
}
