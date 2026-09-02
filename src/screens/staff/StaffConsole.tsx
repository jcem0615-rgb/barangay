import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Inbox, LogOut, RefreshCw, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Application, ServiceCategory } from '../../types'
import StaffRequestPanel from './StaffRequestPanel'
import StaffAccounts from './StaffAccounts'
import { formatPeso } from '../../lib/money'

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'for_payment', label: 'Awaiting payment' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
] as const

export default function StaffConsole() {
  const { user, logout } = useAuth()
  const [departments, setDepartments] = useState<ServiceCategory[]>([])
  const [queue, setQueue] = useState<Application[]>([])
  const [status, setStatus] = useState<string>('')
  const [departmentId, setDepartmentId] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'queue' | 'accounts'>('queue')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.catalogue().then((c) => setDepartments(c.departments)).catch(() => undefined)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setQueue(await api.staffQueue(departmentId || undefined, status || undefined))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the queue.')
    } finally {
      setLoading(false)
    }
  }, [departmentId, status])

  useEffect(() => {
    if (view === 'queue') void refresh()
  }, [refresh, view])

  const myDepartments = useMemo(
    () => departments.filter((d) => user?.role === 'admin' || user?.departments.includes(d.id)),
    [departments, user]
  )
  const officeLabel =
    myDepartments.length === 1 ? myDepartments[0]!.officeName : 'Municipal offices'

  return (
    <div className="min-h-dvh bg-slate-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-800 text-white">
              <Building2 size={20} strokeWidth={1.9} />
            </span>
            <div>
              <p className="font-display text-[15px] font-bold text-navy-950">{officeLabel}</p>
              <p className="text-[12px] text-slate-500">
                {user?.fullName} &middot; {user?.role === 'admin' ? 'Administrator' : 'Staff'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.role === 'admin' && (
              <div className="flex rounded-xl bg-slate-100 p-1">
                {([['queue', 'Queue'], ['accounts', 'Accounts']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      view === key ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {key === 'accounts' ? <Users size={13} /> : <Inbox size={13} />} {label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {view === 'accounts' ? (
          <StaffAccounts departments={departments} />
        ) : (
        <>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {myDepartments.length > 1 && (
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-navy-950"
            >
              <option value="">All my offices</option>
              {myDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
                status === t.key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => void refresh()}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <QueueTable queue={queue} loading={loading} selectedId={selectedId} onSelect={setSelectedId} />
          <StaffRequestPanel
            requestId={selectedId}
            onChanged={() => void refresh()}
            onClose={() => setSelectedId(null)}
          />
        </div>
        </>
        )}
      </div>
    </div>
  )
}

function QueueTable({
  queue, loading, selectedId, onSelect,
}: {
  queue: Application[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!loading && queue.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-16 text-center">
        <Inbox size={28} className="text-slate-300" />
        <p className="mt-3 text-[13.5px] font-medium text-slate-400">Nothing in this queue</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[540px] text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.06em] text-slate-400">
            <th className="px-4 py-3 font-semibold">Reference</th>
            <th className="px-4 py-3 font-semibold">Resident</th>
            <th className="px-4 py-3 font-semibold">Service</th>
            <th className="px-4 py-3 text-right font-semibold">Fee</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer border-b border-slate-100 text-[13px] transition last:border-0 hover:bg-slate-50 ${
                selectedId === r.id ? 'bg-navy-50' : ''
              }`}
            >
              <td className="px-4 py-3 font-medium tabular-nums text-navy-800">{r.referenceNo}</td>
              <td className="px-4 py-3 text-navy-950">{(r as { residentName?: string }).residentName ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{r.serviceName}</td>
              <td className="px-4 py-3 text-right tabular-nums text-navy-950">
                {r.fee > 0 ? formatPeso(r.fee) : 'Free'}
              </td>
              <td className="px-4 py-3"><StatusTag status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-navy-50 text-navy-800',
  in_progress: 'bg-navy-50 text-navy-800',
  for_payment: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-700',
  draft: 'bg-slate-100 text-slate-500',
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'New',
  in_progress: 'In progress',
  for_payment: 'Awaiting payment',
  completed: 'Completed',
  rejected: 'Rejected',
  draft: 'Draft',
}

function StatusTag({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
