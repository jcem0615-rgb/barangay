import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, Inbox, Landmark, LogOut, RefreshCw, ScanLine, Search, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Application, ServiceCategory } from '../../types'
import StaffRequestPanel from './StaffRequestPanel'
import StaffAccounts from './StaffAccounts'
import StaffVerifyId from './StaffVerifyId'
import StaffReports from './StaffReports'
import StaffMunicipality from './StaffMunicipality'
import { hasScannedCode } from '../../lib/scannedCode'
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
  // A clerk who arrived by scanning a resident's ID opens on the check, not the
  // queue — that scan is the errand.
  const [view, setView] = useState<'queue' | 'verify' | 'reports' | 'accounts' | 'municipality'>(
    hasScannedCode() ? 'verify' : 'queue'
  )
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  // Typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    api.catalogue().then((c) => setDepartments(c.departments)).catch(() => undefined)
  }, [])

  /** Loads the first page. Any filter change starts over from the top. */
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.staffQueue({
        departmentId: departmentId || undefined,
        status: status || undefined,
        q: debouncedSearch || undefined,
      })
      setQueue(page.items)
      setCursor(page.nextCursor)
      setTotal(page.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the queue.')
    } finally {
      setLoading(false)
    }
  }, [departmentId, status, debouncedSearch])

  const loadMore = useCallback(async () => {
    if (!cursor) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await api.staffQueue({
        departmentId: departmentId || undefined,
        status: status || undefined,
        q: debouncedSearch || undefined,
        cursor,
      })
      // Appended, not replaced: the cursor guarantees no overlap with what is
      // already on screen.
      setQueue((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
      setTotal(page.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more.')
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, departmentId, status, debouncedSearch])

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
            {/*
              Verifying an ID is counter work, so every office gets it — a clerk
              anywhere may be handed a senior-citizen discount to check.
              Accounts stays with administrators.
            */}
            <div className="flex rounded-xl bg-slate-100 p-1">
              {([
                ['queue', 'Queue', Inbox],
                ['verify', 'Verify ID', ScanLine],
                ['reports', 'Reports', BarChart3],
                ...(user?.role === 'admin'
                  ? [['accounts', 'Accounts', Users] as const, ['municipality', 'Municipality', Landmark] as const]
                  : []),
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                    view === key ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
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
        {view === 'verify' ? (
          <StaffVerifyId />
        ) : view === 'reports' ? (
          <StaffReports
            departments={departments}
            isAdmin={user?.role === 'admin'}
            ownDepartments={user?.departments ?? []}
          />
        ) : view === 'accounts' ? (
          <StaffAccounts departments={departments} />
        ) : view === 'municipality' ? (
          <StaffMunicipality />
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
          <div className="relative ml-auto">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference, resident, or service"
              aria-label="Search the queue"
              className="w-[260px] rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-navy-600"
            />
          </div>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <QueueTable queue={queue} loading={loading} selectedId={selectedId} onSelect={setSelectedId} />
            {queue.length > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[12px] text-slate-500">
                  Showing {queue.length} of {total}
                  {debouncedSearch ? ` matching “${debouncedSearch}”` : ''}
                </p>
                {cursor && (
                  <button
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>
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
        <p className="mt-1 text-[12px] text-slate-400">Try clearing the search or the status filter.</p>
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
