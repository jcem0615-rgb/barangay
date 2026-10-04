import { useCallback, useEffect, useState } from 'react'
import { Building, Landmark, Loader2, LogOut, Megaphone, Users } from 'lucide-react'
import { api, ApiError, type Announcement } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatPeso } from '../../lib/money'

/**
 * What a Sangguniang Barangay member sees.
 *
 * Its own shell, like the barangay console is its own shell beside the
 * municipal one, and for the same reason: a kagawad is not a clerk with fewer
 * tabs. They are elected, they legislate, they sit on committees and they
 * answer to the people who voted for them — so this screen is the barangay's
 * work in numbers, and there is no screen here for an individual resident
 * because there is no route behind one.
 *
 * The line it draws is **figures, never people**. How many live on which purok
 * is what a council plans a budget from; the names and addresses underneath are
 * the secretary's book. The blotter is not here at all, which is the one worth
 * saying plainly: it names people accused of things and cleared of nothing, and
 * a searchable book of accusations against constituents is not something seven
 * elected politicians should hold.
 *
 * Read-only, deliberately. The board is how the barangay speaks, and keeping
 * that with the captain and the clerk means a council seat is not a megaphone.
 */
export default function KagawadConsole() {
  const { user, logout } = useAuth()
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.kagawadSummary>> | null>(null)
  const [figures, setFigures] = useState<Awaited<ReturnType<typeof api.kagawadFigures>> | null>(null)
  const [notices, setNotices] = useState<Announcement[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, f, n] = await Promise.all([
        api.kagawadSummary(), api.kagawadFigures(), api.kagawadAnnouncements(),
      ])
      setSummary(s)
      setFigures(f)
      setNotices(n)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this barangay.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

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
                {summary ? `Barangay ${summary.barangay}` : 'Barangay'}
              </p>
              <p className="text-[12px] text-slate-500">
                {user?.fullName} &middot; Sangguniang Barangay member
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <p className="mb-5 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
          What the barangay has done, in figures. This is the council's view: it
          carries counts rather than names, so there is nothing here about any one
          resident &mdash; the register of inhabitants and the blotter stay with
          the secretary's office. Ask the Punong Barangay if you need a record
          about a named person.
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
        )}
        {!summary && !error && <Loader2 size={18} className="animate-spin text-slate-400" />}

        {summary && (
          <section className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              <Landmark size={13} /> Certificates
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="New" value={summary.counts.pending} />
              <Stat label="Being prepared" value={summary.counts.processing} />
              <Stat label="For pickup" value={summary.counts.ready} />
              <Stat label="Released" value={summary.counts.released} />
              <Stat label="Not issued" value={summary.counts.rejected} />
              {/* Only released requests, because a fee on a pending one is not
                  money the barangay has — a council reading it as income would
                  be budgeting against a number that may never arrive. */}
              <Stat label="Collected" value={formatPeso(summary.collected)} />
            </div>
          </section>
        )}

        {figures && (
          <section className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              <Users size={13} /> Inhabitants
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Households" value={figures.households} />
              <Stat label="Population" value={figures.population} />
              <Stat label="Children" value={figures.children} />
              <Stat label="Adults" value={figures.adults} />
              <Stat label="Seniors" value={figures.seniors} />
              <Stat label="Voters" value={figures.voters} />
            </div>

            {/* Reported rather than hidden, exactly as the secretary's screen
                reports it: a feeding programme planned off a silently short
                count is the harm, and the council is who plans one. */}
            {figures.withoutBirthDate > 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900">
                {figures.withoutBirthDate} {figures.withoutBirthDate === 1 ? 'person is' : 'people are'} recorded
                without a date of birth. They are counted in the population and in
                none of the age bands above, so plan from the population figure
                rather than by adding the bands together.
              </p>
            )}

            {figures.byPurok.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11.5px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Purok</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Households</th>
                      <th className="px-4 py-2.5 text-right font-semibold">People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {figures.byPurok.map((row) => (
                      <tr key={row.purok ?? 'unassigned'} className="border-t border-slate-100 text-[13px]">
                        <td className="px-4 py-2.5 text-navy-950">{row.purok ?? 'Not recorded'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-navy-950">{row.households}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-navy-950">{row.population}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            <Megaphone size={13} /> What the barangay has told residents
          </h2>
          {notices.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[13px] text-slate-500">
              Nothing is on the board right now.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {notices.map((notice) => (
                <li key={notice.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  {notice.urgent && (
                    <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Urgent</p>
                  )}
                  <p className="text-[13.5px] font-bold text-navy-950">{notice.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-slate-700">{notice.body}</p>
                  {notice.postedBy && (
                    <p className="mt-1.5 text-[11.5px] text-slate-500">Posted by {notice.postedBy}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-display mt-1 text-[20px] font-extrabold tabular-nums text-navy-950">{value}</p>
    </div>
  )
}
