import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookText, CalendarClock, CheckCircle2, Gavel, Loader2, Plus, RefreshCw, Search, X,
} from 'lucide-react'
import { api, ApiError, type BlotterEntry, type BlotterSummons } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/**
 * The barangay blotter, and the hearings called from it.
 *
 * Katarungang Pambarangay: a dispute is brought to the barangay, the Punong
 * Barangay calls both sides, and most civil and lesser criminal matters cannot
 * reach a court until that has been tried.
 *
 * **This screen exists only here.** A blotter entry names a respondent — a
 * person accused of something, who has been found to have done nothing — so
 * nothing in the resident app shows it, nothing notifies anybody about it, and
 * the API refuses it to every account outside this barangay. That is a
 * deliberate inversion of the rule the rest of the app follows, where a change
 * tells the resident it is about.
 *
 * It is not the legal record either. The prescribed forms, the Pangkat, the
 * ten-day finality of a settlement and the Certificate to File Action are paper
 * instruments that the barangay issues; this is the book saying what happened
 * and when.
 */

const NATURES = [
  'Dispute between neighbours', 'Family or domestic matter', 'Debt or unpaid obligation',
  'Property or boundary', 'Physical injury or altercation', 'Damage to property',
  'Noise or nuisance', 'Threat or harassment', 'Theft', 'Other',
]

const FILTERS = [
  { key: '', label: 'Open & recent' },
  { key: 'recorded', label: 'Recorded' },
  { key: 'mediation', label: 'In mediation' },
  { key: 'settled', label: 'Settled' },
  { key: 'unsettled', label: 'Unsettled' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'referred', label: 'Referred' },
] as const

const STATUS_STYLE: Record<string, string> = {
  recorded: 'bg-slate-100 text-slate-600',
  mediation: 'bg-amber-100 text-amber-800',
  settled: 'bg-emerald-100 text-emerald-800',
  unsettled: 'bg-rose-100 text-rose-700',
  withdrawn: 'bg-slate-100 text-slate-500',
  referred: 'bg-navy-50 text-navy-800',
}

const STATUS_LABEL: Record<string, string> = {
  recorded: 'Recorded',
  mediation: 'In mediation',
  settled: 'Settled',
  unsettled: 'Unsettled',
  withdrawn: 'Withdrawn',
  referred: 'Referred',
}

const SUMMONS_LABEL: Record<string, string> = {
  pending: 'Called',
  appeared: 'Appeared',
  failed_to_appear: 'Did not appear',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
}

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

export default function BarangayBlotter() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<BlotterEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await api.blotterEntries({ status: status || undefined, q: debounced || undefined }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the book.')
    } finally {
      setLoading(false)
    }
  }, [status, debounced])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
              status === f.key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-500'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference or a name"
            aria-label="Search the blotter"
            className="w-[240px] rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-navy-600"
          />
        </div>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={() => { setRecording(true); setSelectedId(null) }}
          className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900"
        >
          <Plus size={14} /> New entry
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <BookText size={28} className="text-slate-300" />
              <p className="mt-3 text-[13.5px] font-medium text-slate-400">Nothing in the book here</p>
            </div>
          ) : (
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.06em] text-slate-400">
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Complainant</th>
                  <th className="px-4 py-3 font-semibold">Respondent</th>
                  <th className="px-4 py-3 font-semibold">Nature</th>
                  <th className="px-4 py-3 font-semibold">Hearings</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => { setSelectedId(r.id); setRecording(false) }}
                    className={`cursor-pointer border-b border-slate-100 text-[13px] transition last:border-0 hover:bg-slate-50 ${
                      selectedId === r.id ? 'bg-navy-50' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-navy-800">{r.referenceNo}</td>
                    <td className="px-4 py-3 text-navy-950">{r.complainant}</td>
                    <td className="px-4 py-3 text-navy-950">{r.respondent}</td>
                    <td className="px-4 py-3 text-slate-600">{r.nature}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{r.summonsCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {recording ? (
          <NewEntry onDone={() => { setRecording(false); void refresh() }} onCancel={() => setRecording(false)} />
        ) : (
          <EntryPanel id={selectedId} isAdmin={isAdmin} onChanged={() => void refresh()} />
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------- writing it down

function NewEntry({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    complainant: '', complainantContact: '', respondent: '', respondentAddress: '',
    nature: NATURES[0]!, narrative: '', occurredAt: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.recordBlotterEntry({
        complainant: form.complainant.trim(),
        complainantContact: form.complainantContact.trim() || undefined,
        respondent: form.respondent.trim(),
        respondentAddress: form.respondentAddress.trim() || undefined,
        nature: form.nature,
        narrative: form.narrative.trim(),
        occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not write that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[16px] font-bold text-navy-950">New blotter entry</h2>
        <button onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>
      {/*
        Said once, here, where somebody is about to type a name into a record of
        an accusation. The parties are written as they gave them, not matched to
        resident accounts — this book is not a place to look somebody up.
      */}
      <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[12px] leading-snug text-slate-600">
        Write what the parties said, not a finding. Nobody here has been found to
        have done anything, and nothing in this entry is shown to either of them
        in the app.
      </p>

      <div className="mt-4 space-y-3">
        <Field label="Complainant" value={form.complainant} onChange={set('complainant')} />
        <Field label="Contact number" value={form.complainantContact} onChange={set('complainantContact')} optional />
        <Field label="Respondent" value={form.respondent} onChange={set('respondent')} />
        <Field label="Respondent's address" value={form.respondentAddress} onChange={set('respondentAddress')} optional />
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">Nature</span>
          <select
            value={form.nature}
            onChange={set('nature')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          >
            {NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">
            When it happened <span className="font-normal text-slate-400">— optional</span>
          </span>
          <input
            type="datetime-local"
            value={form.occurredAt}
            onChange={set('occurredAt')}
            max={new Date().toISOString().slice(0, 16)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">What happened</span>
          <textarea
            value={form.narrative}
            onChange={set('narrative')}
            rows={5}
            maxLength={4000}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">{error}</p>
      )}

      <button
        onClick={() => void submit()}
        disabled={busy || form.complainant.trim().length < 2 || form.respondent.trim().length < 2 || form.narrative.trim().length < 20}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
      >
        {busy && <Loader2 size={14} className="animate-spin" />} Write it in the book
      </button>
    </aside>
  )
}

function Field({
  label, value, onChange, optional,
}: { label: string; value: string; onChange: (e: { target: { value: string } }) => void; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">
        {label} {optional && <span className="font-normal text-slate-400">— optional</span>}
      </span>
      <input
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
      />
    </label>
  )
}

// ------------------------------------------------------------------ one matter

function EntryPanel({
  id, isAdmin, onChanged,
}: { id: string | null; isAdmin: boolean; onChanged: () => void }) {
  const [entry, setEntry] = useState<(BlotterEntry & { summons: BlotterSummons[] }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [hearing, setHearing] = useState({ hearingAt: '', venue: 'Barangay hall' })

  const load = useCallback(async () => {
    if (!id) { setEntry(null); return }
    setError(null)
    try {
      setEntry(await api.blotterEntry(id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that entry.')
    }
  }, [id])

  useEffect(() => { void load(); setNote(''); setHearing({ hearingAt: '', venue: 'Barangay hall' }) }, [load])

  const openSummons = useMemo(
    () => entry?.summons.find((s) => s.outcome === 'pending') ?? null,
    [entry]
  )
  const isOpen = entry ? ['recorded', 'mediation'].includes(entry.status) : false

  if (!id) {
    return (
      <aside className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-400">
        Pick an entry to see it, or write a new one.
      </aside>
    )
  }
  if (error) {
    return <aside className="rounded-2xl bg-rose-50 p-5 text-[13px] text-rose-700">{error}</aside>
  }
  if (!entry) {
    return <aside className="rounded-2xl border border-slate-200 bg-white p-5"><Loader2 size={18} className="animate-spin text-slate-400" /></aside>
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="font-mono text-[12px] text-slate-500">{entry.referenceNo}</p>
        <h2 className="font-display mt-1 text-[16px] font-bold text-navy-950">{entry.nature}</h2>
        <span className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_STYLE[entry.status]}`}>
          {STATUS_LABEL[entry.status]}
        </span>

        <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-[13px]">
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Complainant</dt>
            <dd className="mt-0.5 text-navy-950">
              {entry.complainant}
              {entry.complainantContact && (
                <span className="text-slate-500"> &middot; {entry.complainantContact}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Respondent</dt>
            <dd className="mt-0.5 text-navy-950">
              {entry.respondent}
              {entry.respondentAddress && (
                <span className="text-slate-500"> &middot; {entry.respondentAddress}</span>
              )}
            </dd>
          </div>
          {entry.occurredAt && (
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Happened</dt>
              <dd className="mt-0.5 text-navy-950">{fullDate(entry.occurredAt)}</dd>
            </div>
          )}
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">What was reported</dt>
            <dd className="mt-0.5 whitespace-pre-wrap leading-snug text-navy-950">{entry.narrative}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">Written by</dt>
            <dd className="mt-0.5 text-slate-600">
              {entry.recordedBy ?? '—'} &middot; {fullDate(entry.recordedAt)}
            </dd>
          </div>
        </dl>

        {entry.outcomeNote && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-snug text-emerald-900">
            {entry.outcomeNote}
          </p>
        )}
      </div>

      {/* ---- the hearings ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-navy-950">
          <Gavel size={14} /> Hearings called
        </h3>
        {/*
          Said where the summons is read, not only where it is issued: "did they
          get told?" is the question somebody has while looking at a hearing that
          is coming up, and the answer is that the barangay tells them in person
          or nobody does.
        */}
        {entry.summons.length > 0 && (
          <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
            The barangay serves these in person. Nobody is notified by the app.
          </p>
        )}

        {entry.summons.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-slate-500">None yet.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {entry.summons.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-navy-950">
                    Calling {s.sequence} &middot; {fullDate(s.hearingAt)}
                  </p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {SUMMONS_LABEL[s.outcome]}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-slate-500">{s.venue}</p>
                {s.note && <p className="mt-1 text-[12px] leading-snug text-slate-600">{s.note}</p>}
                {/*
                  Whether it was served is the fact the outcome depends on: a
                  respondent who never got the summons did not fail to appear,
                  and a barangay recording them as having done so is building on
                  a hole.
                */}
                <p className={`mt-1.5 text-[11.5px] font-medium ${s.servedAt ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {s.servedAt ? `Served ${fullDate(s.servedAt)}` : 'Not yet recorded as served'}
                </p>
                {s.outcome === 'pending' && isAdmin && (
                  <div className="mt-2.5 space-y-2">
                    {!s.servedAt && (
                      <button
                        onClick={() => void act(() => api.recordSummons(entry.id, s.id, {
                          servedAt: new Date().toISOString(), servedNote: 'Served personally.',
                        }))}
                        disabled={busy}
                        className="w-full rounded-lg border border-slate-200 py-1.5 text-[12px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Record as served
                      </button>
                    )}
                    <div className="flex gap-2">
                      {(['appeared', 'failed_to_appear'] as const).map((outcome) => (
                        <button
                          key={outcome}
                          onClick={() => void act(() => api.recordSummons(entry.id, s.id, { outcome }))}
                          disabled={busy}
                          className="flex-1 rounded-lg bg-navy-800 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
                        >
                          {SUMMONS_LABEL[outcome]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {isAdmin && isOpen && !openSummons && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-[12px] font-semibold text-slate-600">Call a hearing</p>
            <input
              type="datetime-local"
              value={hearing.hearingAt}
              onChange={(e) => setHearing((h) => ({ ...h, hearingAt: e.target.value }))}
              min={new Date().toISOString().slice(0, 16)}
              aria-label="Hearing date and time"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
            <input
              value={hearing.venue}
              onChange={(e) => setHearing((h) => ({ ...h, venue: e.target.value }))}
              aria-label="Venue"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
            <button
              onClick={() => void act(() => api.issueSummons(entry.id, {
                hearingAt: new Date(hearing.hearingAt).toISOString(), venue: hearing.venue.trim(),
              }))}
              disabled={busy || !hearing.hearingAt || hearing.venue.trim().length < 2}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-navy-800 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              <CalendarClock size={14} /> Issue summons
            </button>
          </div>
        )}
        {!isAdmin && isOpen && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500">
            A summons goes out over the Punong Barangay's name, so the barangay
            administrator calls the hearing and records what happened at it.
          </p>
        )}
      </div>

      {/* ---- closing it ---- */}
      {isOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-[13px] font-bold text-navy-950">How it ended</h3>
          <label className="mt-2 block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">
              The terms agreed, or where it was sent
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">{error}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([
              ['settled', 'Settled'],
              ['unsettled', 'Unsettled'],
              ['withdrawn', 'Withdrawn'],
              ['referred', 'Referred elsewhere'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void act(() => api.closeBlotterEntry(entry.id, value, note.trim()))}
                disabled={busy || note.trim().length === 0}
                className="rounded-xl border border-slate-200 py-2 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-snug text-slate-500">
            Closing is final here, and it cancels any hearing still called. The
            Certificate to File Action, where one is needed, is the barangay's own
            paper — this records that the matter went unsettled, not that one was
            issued.
          </p>
        </div>
      )}

      {!isOpen && (
        <p className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-[12.5px] text-slate-500">
          <CheckCircle2 size={14} className="text-emerald-600" /> This matter is closed.
        </p>
      )}
    </aside>
  )
}
