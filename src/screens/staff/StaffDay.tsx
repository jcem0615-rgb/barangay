import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { api, ApiError, type StaffAppointment } from '../../lib/api'
import type { ServiceCategory } from '../../types'

/**
 * The counter's day.
 *
 * One office, one day, in time order — what a clerk actually works from at the
 * window. It carries the queue number, who is expected and what for, and
 * nothing else about the resident: the same rule the ID check follows, because
 * an appointment list is not a reason to hold somebody's contact details.
 *
 * Closing a visit is one tap and it is final. What happened at a window should
 * not be quietly rewritten later in the day, so the server refuses a second
 * close and the buttons go away once one lands.
 */
export default function StaffDay({
  departments, isAdmin, ownDepartments,
}: {
  departments: ServiceCategory[]
  isAdmin: boolean
  ownDepartments: string[]
}) {
  const [date, setDate] = useState(() => today())
  const [departmentId, setDepartmentId] = useState('')
  const [rows, setRows] = useState<StaffAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectable = isAdmin ? departments : departments.filter((d) => ownDepartments.includes(d.id))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows((await api.staffDay(date, departmentId || undefined)).appointments)
      setError(null)
    } catch (err) {
      setRows([])
      setError(err instanceof ApiError ? err.message : 'Could not load that day.')
    } finally {
      setLoading(false)
    }
  }, [date, departmentId])

  useEffect(() => { void load() }, [load])

  const mark = async (id: string, action: 'arrived' | 'served' | 'no-show') => {
    setError(null)
    try {
      const updated = await api.markAppointment(id, action)
      setRows((current) => current.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that.')
      void load()
    }
  }

  const expected = rows.filter((r) => r.status !== 'cancelled')
  const waiting = expected.filter((r) => r.status === 'booked' || r.status === 'arrived').length

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
          />
        </label>
        {selectable.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Office</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
            >
              <option value="">{isAdmin ? 'All offices' : 'My offices'}</option>
              {selectable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setDate(today())} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
            Today
          </button>
          <button onClick={() => void load()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
            Refresh
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 py-16 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading the day…
        </p>
      ) : expected.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <CalendarClock size={26} className="mx-auto text-slate-400" />
          <p className="mt-2.5 text-[13.5px] font-medium text-slate-600">Nobody is booked for this day.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-slate-600">
            <span className="font-semibold text-navy-950">{expected.length}</span> booked
            {waiting > 0 && <> · <span className="font-semibold text-navy-950">{waiting}</span> still to be seen</>}
          </p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {expected.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <p className="font-display w-14 shrink-0 text-[14px] font-bold tabular-nums text-navy-950">{row.startTime}</p>
                <p className="font-display w-24 shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-center text-[13px] font-bold tabular-nums text-navy-800">
                  {row.queueNo}
                </p>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-navy-950">{row.residentName}</p>
                  <p className="truncate text-[12.5px] text-slate-600">
                    {row.serviceName}
                    {row.referenceNo && ` · ${row.referenceNo}`}
                    {/* Named only when the list spans more than one office, since
                        otherwise it repeats down every row. */}
                    {!departmentId && selectable.length > 1 && ` · ${row.officeName}`}
                  </p>
                  {row.note && <p className="mt-0.5 truncate text-[12.5px] text-slate-500">“{row.note}”</p>}
                </div>

                {row.status === 'booked' || row.status === 'arrived' ? (
                  <div className="flex gap-2">
                    {row.status === 'booked' && (
                      <button onClick={() => void mark(row.id, 'arrived')} className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-1.5 text-[12.5px] font-semibold text-navy-800 hover:bg-navy-100">
                        Arrived
                      </button>
                    )}
                    <button onClick={() => void mark(row.id, 'served')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white active:bg-emerald-700">
                      Served
                    </button>
                    <button onClick={() => void mark(row.id, 'no-show')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700">
                      No-show
                    </button>
                  </div>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    row.status === 'served' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {row.status === 'served' ? 'Served' : 'No-show'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Today where the office is, not where the browser happens to be. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}
