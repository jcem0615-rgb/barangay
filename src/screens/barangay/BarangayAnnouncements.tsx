import { useCallback, useEffect, useState } from 'react'
import { Loader2, Megaphone, Plus, RefreshCw, Trash2, TriangleAlert, X } from 'lucide-react'
import { api, ApiError, type Announcement } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/**
 * Putting a notice on the barangay's board.
 *
 * The one thing this console does that residents see. Everything else here is
 * the barangay's own book; a notice is worthless until the people it is about
 * have read it, so the rules invert — what is scoped is relevance rather than
 * secrecy, and the resident's own barangay is the whole of it.
 *
 * **Urgent is the only control that reaches a phone**, and it belongs to the
 * administrator. An app where any clerk can ring every phone in the barangay is
 * an app whose notifications get turned off, and then the one that mattered goes
 * unread. The form says how many people it will reach before it is pressed.
 */

const KINDS: Array<[Announcement['kind'], string]> = [
  ['general', 'General'],
  ['service', 'Water, power or road'],
  ['emergency', 'Emergency'],
  ['health', 'Health'],
  ['event', 'Event or assembly'],
]

const KIND_LABEL = Object.fromEntries(KINDS) as Record<string, string>

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

export default function BarangayAnnouncements() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'
  const [showArchived, setShowArchived] = useState(false)
  const [rows, setRows] = useState<Announcement[]>([])
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await api.staffAnnouncements(showArchived ? true : false))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the board.')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { void refresh() }, [refresh])

  const takeDown = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.takeDownAnnouncement(id)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not take that down.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([[false, 'On the board'], [true, 'Taken down']] as const).map(([value, label]) => (
          <button
            key={String(value)}
            onClick={() => setShowArchived(value)}
            className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
              showArchived === value ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => void refresh()}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={() => setPosting(true)}
          className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900"
        >
          <Plus size={14} /> New notice
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-16 text-center">
              <Megaphone size={28} className="text-slate-300" />
              <p className="mt-3 text-[13.5px] font-medium text-slate-400">
                {showArchived ? 'Nothing has been taken down' : 'Nothing on the board'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((notice) => (
                <li
                  key={notice.id}
                  className={`rounded-2xl border p-4 ${
                    notice.archivedAt
                      ? 'border-slate-200 bg-slate-50 opacity-75'
                      : notice.urgent
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {KIND_LABEL[notice.kind] ?? notice.kind}
                        </span>
                        {notice.urgent && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
                            <TriangleAlert size={11} /> Urgent
                          </span>
                        )}
                        {notice.archivedAt && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Taken down
                          </span>
                        )}
                      </p>
                      <h3 className="font-display mt-1.5 text-[15px] font-bold text-navy-950">{notice.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-slate-700">
                        {notice.body}
                      </p>
                      <p className="mt-2 text-[12px] text-slate-500">
                        {fullDate(notice.postedAt)}
                        {notice.postedBy && ` · ${notice.postedBy}`}
                        {notice.editedAt && ' · edited'}
                        {notice.expiresAt && ` · comes off ${fullDate(notice.expiresAt)}`}
                      </p>
                    </div>
                    {isAdmin && !notice.archivedAt && (
                      <button
                        onClick={() => void takeDown(notice.id)}
                        disabled={busy}
                        aria-label={`Take down ${notice.title}`}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {posting ? (
          <NewNotice
            isAdmin={isAdmin}
            onDone={() => { setPosting(false); setShowArchived(false); void refresh() }}
            onCancel={() => setPosting(false)}
          />
        ) : (
          <aside className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-[13px] font-bold text-navy-950">What goes on the board</h3>
            <p className="mt-2 text-[12.5px] leading-snug text-slate-600">
              Residents of this barangay see these in the app, newest first, with
              urgent ones lifted to the top. Nobody in another barangay sees them.
            </p>
            <p className="mt-2.5 text-[12.5px] leading-snug text-slate-600">
              A notice with an end date comes off the board on its own. One that
              is taken down stops showing but is kept, so "what did that notice
              say?" still has an answer.
            </p>
            {!isAdmin && (
              <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-[12px] leading-snug text-slate-500">
                You can put a notice up. Marking one urgent reaches every
                resident's phone, so the barangay administrator does that — and
                takes notices down.
              </p>
            )}
          </aside>
        )}
      </div>
    </>
  )
}

function NewNotice({
  isAdmin, onDone, onCancel,
}: { isAdmin: boolean; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    kind: 'general' as Announcement['kind'],
    title: '', body: '', urgent: false, expiresAt: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const posted = await api.postAnnouncement({
        kind: form.kind,
        title: form.title.trim(),
        body: form.body.trim(),
        urgent: form.urgent,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      })
      // Saying how many it reached, rather than only that it posted: "urgent"
      // is an action with a blast radius and the person who pressed it should
      // see what it was. Dismissed by hand rather than on a timer — a receipt
      // for having rung several hundred phones should not disappear while
      // somebody is still reading it.
      if (posted.notified > 0) setSent(posted.notified)
      else onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post that.')
      setBusy(false)
    }
  }

  if (sent !== null && sent > 0) {
    return (
      <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-[13.5px] font-bold text-emerald-900">Posted, and {sent} notified</p>
        <p className="mt-1 text-[12.5px] leading-snug text-emerald-800">
          It is on the board and reached {sent} {sent === 1 ? 'resident' : 'residents'} of
          this barangay who have notifications on.
        </p>
        <button
          onClick={onDone}
          className="mt-3 w-full rounded-xl bg-emerald-700 py-2 text-[12.5px] font-semibold text-white transition hover:bg-emerald-800"
        >
          Done
        </button>
      </aside>
    )
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[16px] font-bold text-navy-950">New notice</h2>
        <button onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">What kind</span>
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Announcement['kind'] }))}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          >
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">Title</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={160}
            placeholder="Water interruption, Tuesday"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">The notice</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={5}
            maxLength={4000}
            placeholder="Say what is happening, when, and what people should do."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">
            Comes off the board on <span className="font-normal text-slate-400">— optional</span>
          </span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
          />
          <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">
            A notice about Tuesday still at the top in December is how a board
            becomes something nobody reads.
          </span>
        </label>

        {isAdmin && (
          <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={form.urgent}
              onChange={(e) => setForm((f) => ({ ...f, urgent: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
            />
            <span>
              <span className="block text-[12.5px] font-bold text-amber-900">
                Urgent — notify every resident
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-amber-800">
                This reaches the phone of every resident of this barangay who has
                notifications on. Use it for what people need to act on today.
              </span>
            </span>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">{error}</p>
      )}

      <button
        onClick={() => void submit()}
        disabled={busy || form.title.trim().length < 4 || form.body.trim().length < 10}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60 ${
          form.urgent ? 'bg-amber-600 hover:bg-amber-700' : 'bg-navy-800 hover:bg-navy-900'
        }`}
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {form.urgent ? 'Post and notify everyone' : 'Put it on the board'}
      </button>
    </aside>
  )
}
