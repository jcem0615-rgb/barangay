import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, Ban, BookText, Building, FileDown, Home, Landmark, Megaphone, CheckCircle2, Inbox,
  Loader2, LogOut, PhilippinePeso, RefreshCw, UserPlus, Users,
} from 'lucide-react'
import { api, ApiError, type BarangayRequest, type CertificateType } from '../../lib/api'
import BarangayBlotter from './BarangayBlotter'
import BarangayHouseholds from './BarangayHouseholds'
import BarangayAnnouncements from './BarangayAnnouncements'
import BarangayOffice from './BarangayOffice'
import CertificateCatalogue, { type CatalogueDraft } from '../../components/CertificateCatalogue'
import { useAuth } from '../../lib/auth'
import { saveBlob } from '../../lib/download'
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

/**
 * Three roles now, so the pill has to say which — "Officer" covering both a
 * clerk and an elected councillor would hide the only thing about the row that
 * decides what the account can read.
 */
const ROLE_LABEL: Record<string, string> = {
  barangay_admin: 'Administrator',
  barangay_officer: 'Clerk',
  barangay_kagawad: 'Kagawad',
}

type View =
  | 'queue' | 'announcements' | 'blotter' | 'households' | 'office'
  | 'summary' | 'fees' | 'officers'

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
    // The only tab here residents see the output of, so it sits second —
    // close to the work rather than buried with the administrator's tools.
    ['announcements', 'Notices', Megaphone],
    // Both roles: the clerk writes the book, the administrator calls hearings
    // on it. The split lives inside the screen rather than in who may open it.
    ['blotter', 'Blotter', BookText],
    // Both roles again: the clerk keeps the register, the administrator decides
    // when a household leaves it.
    ['households', 'Households', Home],
    // Both roles read the hall's own details; only the administrator saves
    // them. An officer who cannot see what residents are told cannot notice
    // that it is wrong.
    ['office', 'The hall', Landmark],
    ...(isAdmin
      ? ([
          ['summary', 'Summary', BadgeCheck],
          ['fees', 'Certificates', PhilippinePeso],
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
        {view === 'announcements' && <BarangayAnnouncements />}
        {view === 'blotter' && <BarangayBlotter />}
        {view === 'households' && <BarangayHouseholds />}
        {view === 'office' && <BarangayOffice readOnly={!isAdmin} />}
        {view === 'summary' && <Summary />}
        {view === 'fees' && <Fees />}
        {view === 'officers' && <Officers />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ requests

function Queue() {
  // Who may withdraw a released certificate. Hidden here and refused by the
  // API, in that order of importance — the rule the rest of this console
  // already follows.
  const { user } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'
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

        <RequestPanel request={selected} onChanged={() => void refresh()} isAdmin={isAdmin} />
      </div>
    </>
  )
}

function RequestPanel({
  request, onChanged, isAdmin,
}: {
  request: BarangayRequest | null
  onChanged: () => void
  isAdmin: boolean
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Withdrawing is kept behind its own reason field rather than reusing the
  // note: a note is a remark for the file, and this is a message the resident
  // receives saying their certificate is no longer good.
  const [revoking, setRevoking] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')

  // A note typed against one request must not follow the clerk to the next.
  useEffect(() => {
    setNote(''); setError(null); setRevoking(false); setRevokeReason('')
  }, [request?.id])

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

      {/*
        Releasing is the moment the barangay's own statement goes out over the
        Punong Barangay's name. Nothing in the app checks it — the blotter names
        its parties as free text precisely so that it is not a lookup — so the
        person pressing the button is the one making the statement, and the
        console says so rather than letting them find out afterwards.
      */}
      {request.status === 'ready' && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] leading-snug text-amber-900">
          <strong className="font-semibold">Releasing prints this barangay's attestation.</strong>{' '}
          A clearance saying the holder has no pending case says so because this office says
          so — check the blotter and your own records first. The app does not.
        </p>
      )}

      {/*
        A copy of what was handed over, for the resident who lost theirs. It
        reprints the stored PDF rather than making a second, differently coded
        certificate — the same reasoning as the treasury reprinting a receipt.
      */}
      {request.hasCertificate && (
        <button
          onClick={async () => {
            setBusy('certificate')
            setError(null)
            try {
              const { blob, fileName } = await api.barangayStaffCertificate(request.id)
              saveBlob(blob, fileName)
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not open that certificate.')
            } finally {
              setBusy(null)
            }
          }}
          disabled={busy !== null}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-navy-800 px-4 py-2.5 text-[13px] font-semibold text-navy-800 transition hover:bg-navy-50 disabled:opacity-60"
        >
          <FileDown size={14} />
          {busy === 'certificate' ? 'Preparing…' : 'Print the certificate'}
        </button>
      )}

      {/*
        Withdrawing one that has been released.
        
        Both roles release a certificate, because handing one over is counter
        work. Saying that something this barangay issued is no longer good is
        the administrator's — it is the barangay's word being taken back — and
        the API refuses the officer's regardless.
        
        It does not touch the paper: the PDF was frozen at issue and still looks
        exactly as valid as it did. What changes is the answer the public check
        gives, which is why the code is what proves a certificate.
      */}
      {request.hasCertificate && request.revoked && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-800">
            <Ban size={14} /> Withdrawn. It no longer passes a check.
          </p>
          {request.revokedReason && (
            <p className="mt-1 text-[12px] leading-snug text-rose-700">{request.revokedReason}</p>
          )}
        </div>
      )}

      {request.hasCertificate && !request.revoked && isAdmin && (
        revoking ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3.5">
            <p className="text-[12.5px] font-semibold text-rose-800">Withdraw this certificate</p>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">
              It stops passing the public check and the resident is told, with the reason
              below. This cannot be undone &mdash; if it was a mistake, issue a fresh one.
            </p>
            <input
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Why it is being withdrawn — the resident reads this"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-rose-500"
            />
            <div className="mt-2 flex gap-2">
              <button
                disabled={busy !== null || revokeReason.trim().length < 3}
                onClick={async () => {
                  setBusy('revoke')
                  setError(null)
                  try {
                    await api.revokeBarangayCertificate(request.id, revokeReason.trim())
                    setRevoking(false)
                    setRevokeReason('')
                    onChanged()
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Could not withdraw that.')
                  } finally {
                    setBusy(null)
                  }
                }}
                className="flex-1 rounded-lg bg-rose-700 px-3 py-2 text-[12.5px] font-semibold text-white transition active:bg-rose-800 disabled:opacity-40"
              >
                {busy === 'revoke' ? 'Withdrawing…' : 'Withdraw it'}
              </button>
              <button
                onClick={() => { setRevoking(false); setRevokeReason('') }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-medium text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setRevoking(true)}
            className="mt-3 w-full rounded-lg border border-rose-200 px-3 py-2 text-[12.5px] font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Withdraw this certificate
          </button>
        )
      )}

      {/* An officer sees who does it rather than a button that answers 403. */}
      {request.hasCertificate && !request.revoked && !isAdmin && (
        <p className="mt-3 text-[12px] leading-snug text-slate-500">
          The barangay administrator withdraws a released certificate.
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
  const [rows, setRows] = useState<CertificateType[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.barangayCertificateCatalogue()
      setRows(list)
      setDrafts(Object.fromEntries(list.map((t) => [t.id, String(t.fee)])))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the certificates.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await work()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const toBody = (draft: CatalogueDraft) => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    fee: Number(draft.fee),
    validityDays: draft.validityDays.trim() === '' ? null : Number(draft.validityDays),
    // Blank clears it back to the plain sentence, which is a change rather than
    // "leave it alone" — the same shape validityDays has one line up.
    attestation: draft.attestation.trim() === '' ? null : draft.attestation,
  })

  const saveFee = async (id: string) => {
    const fee = Number(drafts[id])
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Give a fee in pesos, 0 or more.')
      return
    }
    await run(async () => {
      await api.setBarangayFee(id, fee)
      setSaved(id)
    })
  }

  return (
    <div className="space-y-8">
      <CertificateCatalogue
        rows={rows}
        // Shared documents are the municipality's. A barangay prices them and
        // nothing else, which is why only its own rows carry Edit and Withdraw.
        canEdit={(row) => row.own === true}
        busy={busy}
        error={error}
        note={
          <>
            What this barangay issues. The ones marked <strong>Shared</strong> come from
            the municipal hall and every barangay issues them &mdash; you set what you
            charge for those below, and nothing else, so a Barangay Clearance means the
            same thing on every street. The ones marked <strong>Ours</strong> are
            documents only this barangay issues: yours to add, edit and withdraw, and
            invisible to every other barangay. Withdrawing takes a certificate off the
            resident&rsquo;s list without deleting it, so anything already issued keeps
            its name.
          </>
        }
        onAdd={(draft) => run(() => api.addBarangayCertificate(toBody(draft)))}
        onEdit={(id, draft) => run(() => api.editBarangayCertificate(id, toBody(draft)))}
        onWithdraw={(id, restore) => run(() => api.withdrawBarangayCertificate(id, restore))}
      />

      <div className="max-w-3xl">
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
          What this barangay charges
        </h3>
        <p className="mb-3 text-[12.5px] leading-snug text-slate-600">
          A fee is frozen onto a request when it is filed, so changing one here never
          rewrites what somebody was already quoted &mdash; it applies from the next
          request on. The municipal treasury sees every change you make here.
        </p>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {rows.filter((t) => t.active).map((type) => (
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
                <button
                  onClick={() => void saveFee(type.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-navy-800 hover:bg-slate-50"
                >
                  Save
                </button>
                {saved === type.id && (
                  <span className="text-[12px] font-medium text-emerald-700">Saved</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Officers() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Array<{ id: string; fullName: string; email: string; role: string; active: boolean }>>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ fullName: '', email: '', role: 'barangay_kagawad' as 'barangay_officer' | 'barangay_kagawad' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await api.barangayOfficers())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the officers.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const issue = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const created = await api.issueBarangayAccount({
        email: draft.email.trim(), fullName: draft.fullName.trim(), role: draft.role,
      })
      // An invitation that did not send is the thing somebody must act on, so
      // it is said rather than assumed — the same honesty the municipal screen
      // shows. Nobody here ever sees a password.
      setNotice(
        created.invited
          ? `Invitation sent to ${created.email}. They choose their own password from the link; it is good for a week.`
          : `Account created, but the invitation to ${created.email} did not send. Use "Send link again" once mail is working.`
      )
      setAdding(false)
      setDraft({ fullName: '', email: '', role: 'barangay_kagawad' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue that account.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, what: 'revoke' | 'restore' | 'resend') => {
    setError(null)
    setNotice(null)
    try {
      if (what === 'revoke') await api.revokeBarangayAccount(id)
      if (what === 'restore') await api.restoreBarangayAccount(id)
      if (what === 'resend') {
        const { sent } = await api.resendBarangayInvite(id)
        setNotice(sent ? 'A fresh link is on its way.' : 'That link did not send — check the mail settings.')
      }
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.')
    }
  }

  const ready = draft.fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(draft.email.trim())

  return (
    <div className="max-w-2xl">
      <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
        Who can sign in for this barangay. You issue clerks and kagawads
        yourself &mdash; the hall does not know who holds a barangay office this
        term, and you do. <strong>An administrator account is still the municipal
        administrator&rsquo;s to issue</strong>, which is what stops this screen
        from being a way to hand out your own authority. You never see or set
        anybody&rsquo;s password: they choose it from an emailed link.
      </p>

      {notice && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] leading-snug text-emerald-900">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      {adding ? (
        <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">Full name</span>
            <input
              value={draft.fullName}
              onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">Email</span>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] outline-none focus:border-navy-600 focus:bg-white"
            />
            <span className="mt-1 block text-[11.5px] text-slate-500">
              The invitation goes here, so it has to be an address they read.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">What they are</span>
            <select
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as typeof d.role }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] outline-none focus:border-navy-600 focus:bg-white"
            >
              <option value="barangay_kagawad">Kagawad &mdash; sees the figures only</option>
              <option value="barangay_officer">Clerk &mdash; works the certificates, the register and the blotter</option>
            </select>
            {/* Said before the choice is made rather than discovered after: the
                difference between these two is the whole of what the account
                can read, and a kagawad is the lighter one on purpose. */}
            <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">
              {draft.role === 'barangay_kagawad'
                ? 'A kagawad sees counts — certificates issued, money collected, how many people live on each purok — and no individual resident. No register, no blotter, no queue.'
                : 'A clerk does the day\u2019s work: certificates, the register of inhabitants and the blotter. That is a great deal about named residents, so issue it to somebody who works here.'}
            </span>
          </label>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => void issue()}
              disabled={!ready || busy}
              className="flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} Issue the account
            </button>
            <button
              onClick={() => { setAdding(false); setError(null) }}
              className="text-[13px] font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setNotice(null) }}
          className="mb-4 flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900"
        >
          <UserPlus size={15} /> Add an account
        </button>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-navy-950">{row.fullName}</p>
              <p className="text-[12px] text-slate-500">{row.email}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
              {ROLE_LABEL[row.role] ?? row.role}
            </span>
            {!row.active && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700">
                Revoked
              </span>
            )}
            {/* An administrator's row carries no buttons: making and unmaking
                one is the hall's, so there is nothing here to press — and the
                API refuses it regardless, which is the half that matters. */}
            {row.role !== 'barangay_admin' && row.id !== user?.id && (
              <div className="flex items-center gap-2">
                {row.active ? (
                  <>
                    {/* Named for a screen reader: a column of identical
                        "Revoke" buttons says nothing about which account it
                        acts on, and this one closes somebody's access. */}
                    <button
                      onClick={() => void act(row.id, 'resend')}
                      aria-label={`Send ${row.fullName} a fresh link`}
                      className="text-[12px] font-medium text-navy-800 hover:underline"
                    >
                      Send link again
                    </button>
                    <button
                      onClick={() => void act(row.id, 'revoke')}
                      aria-label={`Revoke ${row.fullName}`}
                      className="text-[12px] font-medium text-rose-700 hover:underline"
                    >
                      Revoke
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => void act(row.id, 'restore')}
                    aria-label={`Restore ${row.fullName}`}
                    className="text-[12px] font-medium text-navy-800 hover:underline"
                  >
                    Restore
                  </button>
                )}
              </div>
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
