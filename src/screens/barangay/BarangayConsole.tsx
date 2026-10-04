import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, BookText, Building, Home, CheckCircle2, Inbox, Loader2, LogOut, PhilippinePeso,
  RefreshCw, Users,
} from 'lucide-react'
import { api, ApiError, type BarangayRequest } from '../../lib/api'
import BarangayBlotter from './BarangayBlotter'
import BarangayHouseholds from './BarangayHouseholds'
import { useAuth } from '../../lib/auth'
import { formatPeso } from '../../lib/money'

/**
 * The barangay's own desk.
 *
 * Deliberately a separate shell from the municipal console rather than another
 * tab inside it. A barangay secretary does not work a municipal queue and has no
 * business seeing one, so the two consoles share no screen — which also means
 * there is no filter to get wrong. What the barangay sees is its own barangay's
 * work, scoped server-side by the account's own row; nothing here can name
 * another barangay.
 *
 * Two roles, one console. The officer processes certificates. The administrator
 * — the captain or the secretary — does that too, plus the three things that are
 * the barangay's to decide: what it charges, who works here, and what it has
 * done. Those tabs are hidden for an officer and refused by the API for one, in
 * that order of importance.
 */

const STATUS_TABS = [
  { key: '', label: 'Open & recent' },
  { key: 'pending', label: 'New' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready', label: 'For pickup' },
  { key: 'released', label: 'Released' },
  { key: 'rejected', label: 'Not issued' },
] as const

/** The same order the server enforces, so the console offers only real moves. */
const NEXT: Record<BarangayRequest['status'], Array<{ status: string; label: string }>> = {
  pending: [{ status: 'processing', label: 'Start processing' }, { status: 'rejected', label: 'Do not issue' }],
  processing: [{ status: 'ready', label: 'Ready for pickup' }, { status: 'rejected', label: 'Do not issue' }],
  ready: [{ status: 'released', label: 'Released to resident' }, { status: 'rejected', label: 'Do not issue' }],
  released: [],
  rejected: [],
}

type View = 'queue' | 'blotter' | 'households' | 'summary' | 'fees' | 'officers'

export default function BarangayConsole() {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'
  const [view, setView] = useState<View>('queue')
  const [barangay, setBarangay] = useState<{ name: string; captain: string | null } | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

  useEffect(() => {
    api.barangayStaffMe()
      .then((me) => setBarangay(me.barangay))
      .catch((err) => setSetupError(err instanceof ApiError ? err.message : 'Could not load this barangay.'))
  }, [])

  const tabs: Array<[View, string, typeof Inbox]> = [
    ['queue', 'Requests', Inbox],
    // Both roles: the clerk writes the book, the administrator calls hearings
    // on it. The split lives inside the screen rather than in who may open it.
    ['blotter', 'Blotter', BookText],
    // Both roles again: the clerk keeps the register, the administrator decides
    // when a household leaves it.
    ['households', 'Households', Home],
    ...(isAdmin
      ? ([
          ['summary', 'Summary', BadgeCheck],
          ['fees', 'Fees', PhilippinePeso],
          ['officers', 'Officers', Users],
        ] as Array<[View, string, typeof Inbox]>)
      : []),
  ]

  return (
    <div className="min-h-dvh bg-slate-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Building size={20} strokeWidth={1.9} />
            </span>
            <div>
              <p className="font-display text-[15px] font-bold text-navy-950">
                {barangay ? `Barangay ${barangay.name}` : 'Barangay'}
              </p>
              <p className="text-[12px] text-slate-500">
                {user?.fullName} &middot; {isAdmin ? 'Barangay administrator' : 'Barangay officer'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* An officer has one view, and a tab strip with one tab in it says
                nothing — so it is not drawn at all. */}
            {tabs.length > 1 && (
            <div className="flex rounded-xl bg-slate-100 p-1">
              {tabs.map(([key, label, Icon]) => (
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

      <div className="mx-auto max-w-5xl px-6 py-6">
        {setupError && (
          <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{setupError}</p>
        )}
        {view === 'queue' && <Queue />}
        {view === 'blotter' && <BarangayBlotter />}
        {view === 'households' && <BarangayHouseholds />}
        {view === 'summary' && <Summary />}
        {view === 'fees' && <Fees />}
        {view === 'officers' && <Officers />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ requests

function Queue() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<BarangayRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await api.barangayQueue(status || undefined))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the queue.')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void refresh() }, [refresh])

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
              status === tab.key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-500'
            }`}
          >
            {tab.label}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Inbox size={28} className="text-slate-300" />
              <p className="mt-3 text-[13.5px] font-medium text-slate-400">Nothing here</p>
            </div>
          ) : (
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.06em] text-slate-400">
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Certificate</th>
                  <th className="px-4 py-3 text-right font-semibold">Fee</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-b border-slate-100 text-[13px] transition last:border-0 hover:bg-slate-50 ${
                      selectedId === r.id ? 'bg-navy-50' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-navy-800">{r.referenceNo}</td>
                    <td className="px-4 py-3 text-navy-950">{r.residentName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.typeName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-navy-950">
                      {r.fee > 0 ? formatPeso(r.fee) : 'Free'}
                    </td>
                    <td className="px-4 py-3"><Tag status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <RequestPanel request={selected} onChanged={() => void refresh()} />
      </div>
    </>
  )
}

function RequestPanel({ request, onChanged }: { request: BarangayRequest | null; onChanged: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A note typed against one request must not follow the clerk to the next.
  useEffect(() => { setNote(''); setError(null) }, [request?.id])

  if (!request) {
    return (
      <aside className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-400">
        Pick a request to act on it.
      </aside>
    )
  }

  const act = async (status: string) => {
    setBusy(status)
    setError(null)
    try {
      await api.advanceCertificate(request.id, status, note.trim() || undefined)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  const moves = NEXT[request.status]

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-mono text-[12px] text-slate-500">{request.referenceNo}</p>
      <h2 className="font-display mt-1 text-[16px] font-bold text-navy-950">{request.typeName}</h2>
      <p className="mt-0.5 text-[13px] text-slate-600">{request.residentName ?? '—'}</p>

      <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-[13px]">
        <div>
          <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Purpose</dt>
          <dd className="mt-0.5 text-navy-950">{request.purpose}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Fee</dt>
          <dd className="tabular-nums font-semibold text-navy-950">
            {request.fee > 0 ? formatPeso(request.fee) : 'Free'}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Status</dt>
          <dd><Tag status={request.status} /></dd>
        </div>
      </dl>

      {request.note && (
        <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[12.5px] leading-snug text-slate-600">
          {request.note}
        </p>
      )}

      {moves.length === 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-slate-500">
          <CheckCircle2 size={14} className="text-emerald-600" /> This request is closed.
        </p>
      ) : (
        <>
          {/*
            One box, used by whichever button is pressed. Rejection needs a reason
            the resident can read — the server refuses one without it — and a note
            on the way through is worth having too ("collect after 3pm").
          */}
          <label className="mt-4 block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">
              Note to the resident <span className="font-normal text-slate-400">— required if not issuing</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">{error}</p>
          )}

          <div className="mt-3 space-y-2">
            {moves.map((move) => (
              <button
                key={move.status}
                onClick={() => void act(move.status)}
                disabled={busy !== null}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition disabled:opacity-60 ${
                  move.status === 'rejected'
                    ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                    : 'bg-navy-800 text-white hover:bg-navy-900'
                }`}
              >
                {busy === move.status && <Loader2 size={14} className="animate-spin" />}
                {move.label}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

// ------------------------------------------------------------------- summary

function Summary() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.barangaySummary>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.barangaySummary()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the summary.'))
  }, [])

  if (error) return <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
  if (!data) return <Loader2 size={18} className="animate-spin text-slate-400" />

  const cards: Array<[string, string]> = [
    ['New', String(data.counts.pending)],
    ['Processing', String(data.counts.processing)],
    ['For pickup', String(data.counts.ready)],
    ['Released', String(data.counts.released)],
    ['Not issued', String(data.counts.rejected)],
    // Only released requests: a fee on a pending one is not money the barangay
    // has, and a figure that counted it would overstate the day's take.
    ['Collected on released', formatPeso(data.collected)],
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-slate-400">{label}</p>
          <p className="font-display mt-1 text-[22px] font-extrabold tabular-nums text-navy-950">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------- fees

function Fees() {
  const [types, setTypes] = useState<Array<{ id: string; name: string; fee: number }>>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.barangayFees()
      setTypes(list)
      setDrafts(Object.fromEntries(list.map((t) => [t.id, String(t.fee)])))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the fees.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (id: string) => {
    setError(null)
    setSaved(null)
    const fee = Number(drafts[id])
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Give a fee in pesos, 0 or more.')
      return
    }
    try {
      await api.setBarangayFee(id, fee)
      setSaved(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that fee.')
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
        What this barangay charges. A fee is frozen onto a request when it is
        filed, so changing one here never rewrites what somebody was already
        quoted — it applies from the next request on. Set it to 0 for a
        certificate your barangay issues free.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {types.map((type) => (
          <div key={type.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-navy-950">{type.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-slate-400">₱</span>
              <input
                value={drafts[type.id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [type.id]: e.target.value }))}
                inputMode="decimal"
                aria-label={`Fee for ${type.name}`}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-navy-600 focus:bg-white"
              />
            </div>
            <button
              onClick={() => void save(type.id)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50"
            >
              Save
            </button>
            {saved === type.id && <CheckCircle2 size={15} className="text-emerald-600" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ officers

function Officers() {
  const [rows, setRows] = useState<Array<{ id: string; fullName: string; email: string; role: string; active: boolean }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.barangayOfficers()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the officers.'))
  }, [])

  return (
    <div className="max-w-2xl">
      {/*
        Read-only on purpose. Issuing an account is a municipal act — the hall
        knows who actually holds a barangay office — so this answers "who can
        sign in as us", which is the question a captain needs, without making the
        barangay an account authority of its own.
      */}
      <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
        Who can sign in for this barangay. Accounts are issued by the municipal
        administrator — ask the hall to add or revoke one.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-navy-950">{row.fullName}</p>
              <p className="text-[12px] text-slate-500">{row.email}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
              {row.role === 'barangay_admin' ? 'Administrator' : 'Officer'}
            </span>
            {!row.active && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700">
                Revoked
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------- bits

const TAG_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  processing: 'bg-navy-50 text-navy-800',
  ready: 'bg-amber-100 text-amber-800',
  released: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-700',
}

const TAG_LABEL: Record<string, string> = {
  pending: 'New',
  processing: 'Processing',
  ready: 'For pickup',
  released: 'Released',
  rejected: 'Not issued',
}

function Tag({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TAG_STYLE[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {TAG_LABEL[status] ?? status}
    </span>
  )
}
