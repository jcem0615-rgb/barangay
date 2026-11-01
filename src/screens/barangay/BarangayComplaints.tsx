import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Clock, Loader2, Paperclip, Phone, Play,
} from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { BarangayComplaint, ComplaintStatus } from '../../lib/api'

/**
 * The barangay's side of what residents have complained about.
 *
 * **English, like the rest of this console** — the resident side is
 * translated and this is not, the same rule the blotter and the register
 * follow.
 *
 * **Both roles read; only the administrator moves one.** That is the line the
 * blotter already draws: recording and reading is the clerk's work, and the
 * decision that tells a resident their complaint is finished is the captain's,
 * because `resolved` and `closed` are final. The clerk sees why rather than a
 * button that answers 403 — the API refuses it either way, which is the half
 * that matters.
 */

const LABEL: Record<ComplaintStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

/** A word and a tone, never a tone alone. Amber for closed, not red. */
const TONE: Record<ComplaintStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  acknowledged: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-amber-100 text-amber-900',
}

const CATEGORY: Record<string, string> = {
  garbage: 'Rubbish and collection',
  road: 'Road or pathway',
  water: 'Water supply',
  drainage: 'Drainage or flooding',
  streetlight: 'Street lighting',
  noise: 'Noise',
  animals: 'Stray animals',
  neighbour: 'A neighbour',
  peace: 'Peace and order',
  other: 'Something else',
}

/** Where a complaint may go from here. Must mirror the server's machine. */
const NEXT: Record<ComplaintStatus, ComplaintStatus[]> = {
  new: ['acknowledged', 'in_progress', 'resolved', 'closed'],
  acknowledged: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: [],
  closed: [],
}

type Row = BarangayComplaint & { residentName: string | null; evidenceCount: number }
type Figures = {
  total: number; open: number; new: number; acknowledged: number
  inProgress: number; resolved: number; closed: number; withProof: number
}

export default function BarangayComplaintsConsole() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'

  const [rows, setRows] = useState<Row[] | null>(null)
  const [figures, setFigures] = useState<Figures | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // Resolved and closed ones live behind a switch rather than in the queue:
  // the queue is what to work on, and the records are what the barangay did.
  const [showRecords, setShowRecords] = useState(false)

  const load = useCallback(async () => {
    try {
      const out = await api.staffBarangayComplaints()
      setRows(out.complaints as Row[])
      setFigures(out.figures)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load complaints.')
      setRows([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const queue = (rows ?? []).filter((r) => (showRecords ? r.final : !r.final))

  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-[13px] text-rose-900">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" /> {error}
      </p>
    )
  }

  return (
    <div>
      {/*
        The figures lead the screen, because what a barangay is asked at an
        assembly is a count: how many complaints, how many still open, how many
        came with proof. Computed on every read rather than stored — a stored
        count is wrong the moment anything moves.
      */}
      {figures && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Total', figures.total],
            ['Still open', figures.open],
            ['With proof', figures.withProof],
            ['Resolved', figures.resolved],
          ] as Array<[string, number]>).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-0.5 text-[20px] font-extrabold text-navy-950">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {([[false, `Queue (${(rows ?? []).filter((r) => !r.final).length})`],
           [true, `Records (${(rows ?? []).filter((r) => r.final).length})`]] as Array<[boolean, string]>)
          .map(([records, label]) => (
            <button
              key={label}
              onClick={() => { setShowRecords(records); setOpenId(null) }}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                showRecords === records
                  ? 'border-navy-800 bg-navy-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
      </div>

      {rows === null && (
        <p className="flex items-center gap-2 py-6 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading
        </p>
      )}

      {rows !== null && queue.length === 0 && (
        <p className="py-6 text-[13px] text-slate-500">
          {showRecords
            ? 'Nothing finished yet.'
            : 'No open complaints. Residents file these from the barangay hub in their app.'}
        </p>
      )}

      <ul className="space-y-2.5">
        {queue.map((row) => (
          <ComplaintCard
            key={row.id}
            row={row}
            isAdmin={isAdmin}
            open={openId === row.id}
            onToggle={() => setOpenId((c) => (c === row.id ? null : row.id))}
            onMoved={() => void load()}
          />
        ))}
      </ul>
    </div>
  )
}

function ComplaintCard({
  row, isAdmin, open, onToggle, onMoved,
}: {
  row: Row
  isAdmin: boolean
  open: boolean
  onToggle: () => void
  onMoved: () => void
}) {
  const [full, setFull] = useState<
    (BarangayComplaint & { residentName: string | null; residentPhone: string | null }) | null
  >(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<ComplaintStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || full) return
    api.staffBarangayComplaint(row.id).then(setFull, () => undefined)
  }, [open, full, row.id])

  const move = async (status: ComplaintStatus) => {
    setBusy(status)
    setError(null)
    try {
      await api.moveBarangayComplaint(row.id, { status, note: note.trim() || undefined })
      setNote('')
      onMoved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that.')
    } finally {
      setBusy(null)
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })

  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      <button onClick={onToggle} className="w-full p-3.5 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[row.status]}`}>
            {LABEL[row.status]}
          </span>
          <span className="text-[11.5px] font-semibold tracking-wide text-slate-500">
            {row.referenceNo}
          </span>
          {row.evidenceCount > 0 && (
            <span className="flex items-center gap-1 text-[11.5px] text-slate-500">
              <Paperclip size={11} /> {row.evidenceCount}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13.5px] font-semibold text-navy-950">
          {CATEGORY[row.category] ?? row.category}
          {row.location && <span className="font-normal text-slate-500"> · {row.location}</span>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-slate-600">{row.details}</p>
        <p className="mt-1 text-[11.5px] text-slate-400">
          {row.residentName} · {when(row.filedAt)}
        </p>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          <p className="whitespace-pre-wrap text-[13px] leading-snug text-navy-950">{row.details}</p>

          {full?.residentPhone && (
            <a
              href={`tel:${full.residentPhone}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-semibold text-navy-950 active:bg-slate-50"
            >
              <Phone size={13} /> {full.residentPhone}
            </a>
          )}

          {full?.evidence && full.evidence.length > 0 && (
            <>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Proof the resident sent
              </p>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {full.evidence.map((file) => (
                  <ProofTile key={file.id} complaintId={row.id} file={file} />
                ))}
              </div>
            </>
          )}

          {full?.history && full.history.length > 0 && (
            <>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                History
              </p>
              <ol className="mt-2 space-y-2">
                {full.history.map((step, i) => (
                  <li key={`${step.at}-${i}`} className="text-[12.5px] leading-snug">
                    <span className="font-semibold text-navy-950">{LABEL[step.to]}</span>
                    <span className="text-slate-400">
                      {' · '}{step.actorName}{' · '}{when(step.at)}
                    </span>
                    {step.note && <p className="whitespace-pre-wrap text-slate-600">{step.note}</p>}
                  </li>
                ))}
              </ol>
            </>
          )}

          {row.final ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[12.5px] leading-snug text-slate-600">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
              This complaint is finished, and that is final. If the resident reports it
              again it arrives as a new complaint with its own reference and its own history.
            </p>
          ) : isAdmin ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-navy-950">
                  What to tell the resident
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1500))}
                  rows={2}
                  placeholder="Shown to them as written. Required when closing."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-navy-950 outline-none focus:border-navy-600"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {NEXT[row.status].map((next) => (
                  <button
                    key={next}
                    onClick={() => void move(next)}
                    disabled={busy !== null}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                      next === 'resolved'
                        ? 'bg-emerald-700 text-white active:bg-emerald-800'
                        : next === 'closed'
                          ? 'bg-amber-600 text-white active:bg-amber-700'
                          : 'border border-slate-200 bg-white text-navy-950 active:bg-slate-100'
                    }`}
                  >
                    {busy === next ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                    {LABEL[next]}
                  </button>
                ))}
              </div>
              {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
            </div>
          ) : (
            // The clerk is told who moves it rather than shown a control that
            // answers 403. The API refuses it either way.
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[12.5px] leading-snug text-slate-600">
              The Punong Barangay or the Secretary answers and closes a complaint —
              it is what the resident is told happened, and resolving or closing is final.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Proof fetched as a blob and handed to the DOM as an object URL, because
 * neither <img src> nor <video src> can carry the bearer token. Video is
 * `controls` and the server serves it ranged, so a five-minute clip can be
 * scrubbed to the ten seconds that matter.
 */
function ProofTile({
  complaintId, file,
}: {
  complaintId: string
  file: { id: string; contentType: string; byteSize: number; durationSeconds: number | null }
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isVideo = file.contentType.startsWith('video/')

  useEffect(() => {
    let revoke: string | null = null
    let live = true
    api.staffComplaintProof(complaintId, file.id)
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
  }, [complaintId, file.id])

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
        <img src={url} alt="Proof the resident sent" className="h-32 w-48 rounded-lg object-cover" />
      )}
      <figcaption className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-500">
        {isVideo && <Play size={10} />} {size}{length}
      </figcaption>
    </figure>
  )
}
