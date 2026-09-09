import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, MessageSquareWarning, Send } from 'lucide-react'
import { api, ApiError, type StaffComplaint } from '../../lib/api'
import type { ServiceCategory } from '../../types'

/**
 * Complaints, the office's side.
 *
 * RA 11032 gives a complaint a deadline, so this list is ordered oldest-open
 * first — the one that has been waiting longest is the one to answer next — and
 * anything past its deadline is called out in words, not merely coloured.
 *
 * A reply, once given, stands: the server refuses a second one. An office
 * quietly rewriting what it told a resident is exactly what a complaints
 * mechanism exists to prevent.
 */
export default function StaffComplaints({
  departments, isAdmin, ownDepartments,
}: {
  departments: ServiceCategory[]
  isAdmin: boolean
  ownDepartments: string[]
}) {
  const [rows, setRows] = useState<StaffComplaint[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState<'' | 'open' | 'answered'>('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectable = isAdmin ? departments : departments.filter((d) => ownDepartments.includes(d.id))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.staffComplaints({
        departmentId: departmentId || undefined,
        status: status || undefined,
      }))
      setError(null)
    } catch (err) {
      setRows([])
      setError(err instanceof ApiError ? err.message : 'Could not load complaints.')
    } finally {
      setLoading(false)
    }
  }, [departmentId, status])

  useEffect(() => { void load() }, [load])

  const overdue = rows.filter((r) => r.overdue).length

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([['open', 'Awaiting reply'], ['answered', 'Answered'], ['', 'All']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition ${
              status === key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
        {selectable.length > 1 && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Office"
            className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px]"
          >
            <option value="">{isAdmin ? 'All offices' : 'My offices'}</option>
            {selectable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {overdue > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
          <AlertTriangle size={15} className="shrink-0" />
          {overdue === 1
            ? '1 complaint is past the date it was due a reply.'
            : `${overdue} complaints are past the date they were due a reply.`}
        </p>
      )}

      {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 py-16 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <MessageSquareWarning size={26} className="mx-auto text-slate-400" />
          <p className="mt-2.5 text-[13.5px] font-medium text-slate-600">
            {status === 'open' ? 'Nothing is waiting for a reply.' : 'No complaints here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => <Row key={row.id} row={row} onAnswered={load} />)}
        </ul>
      )}
    </div>
  )
}

const CATEGORY: Record<string, string> = {
  delay: 'Taking longer than promised',
  conduct: 'How they were treated',
  fees: 'A fee charged',
  requirements: 'Requirements asked for',
  other: 'Something else',
}

function Row({ row, onAnswered }: { row: StaffComplaint; onAnswered: () => Promise<void> }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-[14px] font-bold tabular-nums text-navy-950">{row.referenceNo}</p>
        <p className="text-[12.5px] text-slate-600">
          {row.residentName} · {new Date(row.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
          {row.requestRef && ` · ${row.requestRef}`}
        </p>
        {row.status === 'answered' ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-800">
            <CheckCircle2 size={12} /> Answered
          </span>
        ) : (
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
            row.overdue ? 'bg-amber-100 text-amber-900' : 'bg-navy-50 text-navy-800'
          }`}>
            {row.overdue ? `Overdue — was due ${row.dueOn}` : `Due ${row.dueOn}`}
          </span>
        )}
      </div>

      <p className="mt-1 text-[12.5px] font-medium text-slate-600">{CATEGORY[row.category] ?? row.category}</p>
      <p className="mt-2 whitespace-pre-line text-[13.5px] leading-snug text-navy-950">{row.body}</p>

      {row.status === 'answered' ? (
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Your office replied</p>
          <p className="mt-1 whitespace-pre-line text-[13.5px] leading-snug text-navy-950">{row.response}</p>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 4000))}
            rows={3}
            placeholder="What happened, and what the office is doing about it. This goes to the resident and cannot be edited afterwards."
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-slate-400 focus:border-navy-600"
          />
          {error && <p role="alert" className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
          <button
            disabled={sending || reply.trim().length === 0}
            onClick={async () => {
              setSending(true)
              setError(null)
              try { await api.respondToComplaint(row.id, reply.trim()); await onAnswered() }
              catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send that.') }
              finally { setSending(false) }
            }}
            className="mt-2 flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white active:bg-navy-900 disabled:opacity-40"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send the reply
          </button>
        </div>
      )}
    </li>
  )
}
