import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, TrendingUp } from 'lucide-react'
import { api, ApiError, type ReportSummary } from '../../lib/api'
import { saveBlob } from '../../lib/download'
import type { ServiceCategory } from '../../types'

/**
 * What the office did, over a period.
 *
 * Two turnaround figures rather than one, because either alone lies. **Office
 * days** run only while the office held the request; **resident days** run from
 * submission regardless. Showing only the first flatters the office, showing
 * only the second blames it for a permit that sat unpaid — and the gap between
 * them is itself the finding.
 *
 * The headline figures are stat tiles, not a chart: a single number reads better
 * as a number. The per-service breakdown is one series, so the bars carry no
 * legend and every row is labelled with its own value.
 */
export default function StaffReports({
  departments, isAdmin, ownDepartments,
}: {
  departments: ServiceCategory[]
  isAdmin: boolean
  ownDepartments: string[]
}) {
  const [range, setRange] = useState(() => defaultRange())
  const [departmentId, setDepartmentId] = useState('')
  const [report, setReport] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // An office only ever sees its own; an administrator can narrow to one.
  const selectable = useMemo(
    () => (isAdmin ? departments : departments.filter((d) => ownDepartments.includes(d.id))),
    [departments, isAdmin, ownDepartments]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await api.staffReport(range.from, range.to, departmentId || undefined))
    } catch (err) {
      setReport(null)
      setError(err instanceof ApiError ? err.message : 'Could not build that report.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, departmentId])

  useEffect(() => { void load() }, [load])

  const busiest = report ? Math.max(1, ...report.rows.map((r) => r.submitted)) : 1

  return (
    <div>
      {/* Filters in one row above the figures. */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
          />
        </Field>
        {selectable.length > 1 && (
          <Field label="Office">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
            >
              <option value="">{isAdmin ? 'All offices' : 'My offices'}</option>
              {selectable.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="ml-auto flex gap-2">
          {[['This month', thisMonth], ['This year', thisYear]].map(([label, make]) => (
            <button
              key={label as string}
              onClick={() => setRange((make as () => Range)())}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {label as string}
            </button>
          ))}
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                const { blob, fileName } = await api.staffReportCsv(range.from, range.to, departmentId || undefined)
                saveBlob(blob, fileName)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not download that report.')
              } finally {
                setDownloading(false)
              }
            }}
            disabled={downloading || !report}
            className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white active:bg-navy-900 disabled:opacity-40"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} CSV
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{error}</p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 py-16 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Building the report…
        </p>
      ) : !report || report.submitted === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <TrendingUp size={26} className="mx-auto text-slate-400" />
          <p className="mt-2.5 text-[13.5px] font-medium text-slate-600">
            Nothing was filed in this period.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Filed" value={report.submitted} />
            <Tile label="Released" value={report.completed} note={`${report.rejected} rejected · ${report.stillOpen} still open`} />
            <Tile
              label="Median office days"
              value={report.medianOfficeDays ?? '—'}
              note="while the office held it"
            />
            <Tile
              label="Median resident days"
              value={report.medianResidentDays ?? '—'}
              note="submission to release"
            />
          </div>

          <OnTime report={report} />

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="font-display text-[14px] font-bold text-navy-950">By service</h2>
              <p className="text-[12px] text-slate-500">Filed in this period, most first.</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <li key={`${row.departmentId}:${row.serviceId}`} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 truncate text-[13.5px] font-semibold text-navy-950">
                      {row.serviceName}
                    </p>
                    <p className="shrink-0 text-[13.5px] font-bold tabular-nums text-navy-950">
                      {row.submitted}
                    </p>
                  </div>
                  {/* One series, so no legend; every row carries its own value. */}
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-navy-800"
                      style={{ width: `${Math.max(2, (row.submitted / busiest) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-600">
                    {row.departmentName}
                    {' · '}
                    {row.completed} released
                    {row.medianOfficeDays !== null && ` · median ${row.medianOfficeDays}d in office`}
                    {row.p90OfficeDays !== null && row.p90OfficeDays !== row.medianOfficeDays &&
                      ` · slowest 10% ${row.p90OfficeDays}d`}
                    {row.metTarget + row.missedTarget > 0 &&
                      ` · ${row.metTarget}/${row.metTarget + row.missedTarget} on time`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

/**
 * On-time performance, as a status rather than a series colour — and always
 * with the words beside it, never the colour alone.
 */
function OnTime({ report }: { report: ReportSummary }) {
  const judged = report.metTarget + report.missedTarget
  if (judged === 0) return null

  const rate = report.onTimeRate ?? 0
  const tone =
    rate >= 90 ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', word: 'On target' }
    : rate >= 70 ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', word: 'Slipping' }
    : { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', word: 'Behind' }

  return (
    <div className={`mt-3 rounded-2xl border ${tone.border} ${tone.bg} px-5 py-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={`font-display text-[22px] font-extrabold tabular-nums ${tone.text}`}>{rate}%</p>
        <p className={`text-[13.5px] font-bold ${tone.text}`}>{tone.word}</p>
        <p className="text-[12.5px] text-slate-600">
          {report.metTarget} of {judged} released within the processing time the catalogue promises.
        </p>
      </div>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-display mt-0.5 text-[26px] font-extrabold leading-none tabular-nums text-navy-950">
        {value}
      </p>
      {note && <p className="mt-1 text-[11.5px] leading-snug text-slate-600">{note}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

interface Range { from: string; to: string }

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function thisMonth(): Range {
  const now = new Date()
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
}

function thisYear(): Range {
  const now = new Date()
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }
}

/** Opens on the current month, which is what a clerk checks most days. */
const defaultRange = thisMonth
