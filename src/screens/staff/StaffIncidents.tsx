import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, MapPin, Play } from 'lucide-react'
import { api, ApiError } from '../../lib/api'

type Incident = Awaited<ReturnType<typeof api.staffIncidents>>[number]

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
] as const

const KIND_LABEL: Record<string, string> = {
  flood: 'Flood', fire: 'Fire', road: 'Road or bridge', power: 'Power or live wire',
  medical: 'Medical', crime: 'Peace and order', garbage: 'Rubbish', other: 'Other',
}

/**
 * What residents have reported.
 *
 * Open ones first and oldest first within that, because the queue should read
 * as the order somebody works it rather than the order things arrived. The
 * evidence is watched here rather than downloaded — a file a clerk has to open
 * from their downloads folder is a file nobody looks at.
 */
export default function StaffIncidents() {
  const [status, setStatus] = useState<string>('')
  const [items, setItems] = useState<Incident[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setItems(await api.staffIncidents(status || undefined))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load reports.')
    } finally {
      setBusy(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  const act = async (id: string, next: string) => {
    try {
      await api.updateIncident(id, { status: next, note: note.trim() || undefined })
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that report.')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatus(f.id)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
              status === f.id ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {f.label}
          </button>
        ))}
        {busy && <Loader2 size={15} className="animate-spin text-slate-400" />}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-700">{error}</p>
      )}

      {!busy && items.length === 0 && (
        <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-[13.5px] text-slate-500">
          Nothing reported in this view.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-slate-200 bg-white">
            <button
              onClick={() => { setOpen(open === item.id ? null : item.id); setNote('') }}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  item.status === 'new' ? 'bg-rose-100' : 'bg-slate-100'
                }`}
              >
                <AlertTriangle size={16} className={item.status === 'new' ? 'text-rose-600' : 'text-slate-500'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-display text-[14.5px] font-bold text-navy-950">
                    {KIND_LABEL[item.kind] ?? item.kind}
                  </span>
                  <span className="font-mono text-[12px] text-slate-500">{item.referenceNo}</span>
                  {/* In words, not only a colour. */}
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-600">
                    {item.status}
                  </span>
                  {item.evidence.length > 0 && (
                    <span className="text-[11.5px] font-semibold text-navy-800">
                      {item.evidence.length} file{item.evidence.length === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-slate-600">{item.description}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-slate-500">
                  {item.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {item.location}
                    </span>
                  )}
                  <span>{new Date(item.reportedAt).toLocaleString()}</span>
                  <span>{item.reportedBy}</span>
                </span>
              </span>
            </button>

            {open === item.id && (
              <div className="border-t border-slate-100 p-4">
                {item.evidence.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-3">
                    {item.evidence.map((file) => (
                      <EvidenceTile key={file.id} incidentId={item.id} file={file} />
                    ))}
                  </div>
                )}

                {item.officeNote && (
                  <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                    <span className="font-semibold">Note:</span> {item.officeNote}
                    {item.handledBy && <span className="text-slate-500"> — {item.handledBy}</span>}
                  </p>
                )}

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="What was done about it (sent to the resident)"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] text-navy-950 outline-none focus:border-navy-600 focus:bg-white"
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => void act(item.id, 'acknowledged')}
                    className="rounded-lg bg-navy-800 px-3.5 py-2 text-[13px] font-semibold text-white active:bg-navy-900"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => void act(item.id, 'resolved')}
                    className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white active:bg-emerald-700"
                  >
                    Resolved
                  </button>
                  <button
                    onClick={() => void act(item.id, 'closed')}
                    className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-600 active:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Evidence is fetched as a blob and handed to the DOM as an object URL, because
 * neither <img src> nor <video src> can carry the bearer token.
 */
function EvidenceTile({
  incidentId, file,
}: {
  incidentId: string
  file: { id: string; contentType: string; byteSize: number; durationSeconds: number | null }
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isVideo = file.contentType.startsWith('video/')

  useEffect(() => {
    let revoke: string | null = null
    let live = true
    api.incidentEvidence(incidentId, file.id)
      .then((blob) => {
        if (!blob || !live) return
        revoke = URL.createObjectURL(blob)
        setUrl(revoke)
      })
      .catch(() => undefined)
    return () => {
      live = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [incidentId, file.id])

  const size = `${(file.byteSize / 1024 / 1024).toFixed(1)} MB`
  const length =
    file.durationSeconds !== null
      ? ` · ${Math.floor(file.durationSeconds / 60)}m ${Math.round(file.durationSeconds % 60)}s`
      : ''

  return (
    <figure className="w-48">
      {url === null ? (
        <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-slate-100">
          <Loader2 size={16} className="animate-spin text-slate-400" />
        </div>
      ) : isVideo ? (
        <video src={url} controls preload="metadata" className="h-32 w-48 rounded-lg bg-black object-contain" />
      ) : (
        <img src={url} alt="Reported evidence" className="h-32 w-48 rounded-lg object-cover" />
      )}
      <figcaption className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-500">
        {isVideo && <Play size={10} />} {size}{length}
      </figcaption>
    </figure>
  )
}
