import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, MapPin, Plus } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError, type Appointment } from '../lib/api'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import { longDate } from './BookAppointment'

/**
 * A resident's appointments.
 *
 * What is coming sits at the top and carries the queue number large enough to
 * read at a window without unlocking anything further — that number is the
 * whole point of the booking, and a resident showing it should not have to
 * hunt. Past visits stay below, because "did I actually go" is a question
 * people ask.
 */
export default function Appointments() {
  const { push } = useNav()
  const { t } = useT()
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.myAppointments())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your appointments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const upcoming = rows.filter((r) => r.status === 'booked' || r.status === 'arrived')
  const past = rows.filter((r) => !upcoming.includes(r))

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={t('appt.title')} subtitle={t('appt.subtitle')} />

      <div className="space-y-4 px-4 pt-4">
        <button
          onClick={() => push({ name: 'book-appointment' })}
          className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          <Plus size={16} /> {t('appt.book')}
        </button>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[calc(13.5px_*_var(--text-scale))] text-rose-800">{error}</p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 py-10 text-[calc(13.5px_*_var(--text-scale))] text-slate-500">
            <Loader2 size={15} className="animate-spin" /> {t('common.loading')}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center">
            <CalendarClock size={26} className="mx-auto text-slate-400" />
            <p className="mt-2 px-6 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('appt.empty')}
            </p>
          </div>
        ) : (
          <>
            {upcoming.map((row) => (
              <Card key={row.id} row={row} onCancelled={load} />
            ))}
            {past.length > 0 && (
              <>
                <h2 className="pt-2 text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
                  {t('appt.past')}
                </h2>
                {past.map((row) => <Card key={row.id} row={row} onCancelled={load} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Card({ row, onCancelled }: { row: Appointment; onCancelled: () => Promise<void> }) {
  const { t, locale } = useT()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = row.status === 'booked' || row.status === 'arrived'

  return (
    <div className={`rounded-2xl border p-4 ${live ? 'border-navy-100 bg-white' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">{row.serviceName}</p>
          <p className="text-[calc(13px_*_var(--text-scale))] text-slate-600">{row.officeName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[calc(11.5px_*_var(--text-scale))] font-bold ${STATUS[row.status].tone}`}>
          {t(STATUS[row.status].key)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-950">
          {longDate(row.scheduledOn, locale)} · {row.startTime}
        </p>
      </div>

      {live && (
        <div className="mt-3 rounded-xl bg-navy-50 px-4 py-3">
          <p className="text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
            {t('book.queueNo')}
          </p>
          <p className="font-display text-[calc(22px_*_var(--text-scale))] font-extrabold tabular-nums text-navy-950">
            {row.queueNo}
          </p>
        </div>
      )}

      {row.officeAddress && (
        <p className="mt-2 flex items-start gap-1.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
          <MapPin size={13} className="mt-0.5 shrink-0" /> {row.officeAddress}
        </p>
      )}

      {row.note && (
        <p className="mt-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">“{row.note}”</p>
      )}

      {error && <p role="alert" className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-rose-700">{error}</p>}

      {row.status === 'booked' && (
        <div className="mt-3">
          {confirming ? (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try { await api.cancelAppointment(row.id); await onCancelled() }
                  catch (err) { setError(err instanceof ApiError ? err.message : 'Could not cancel that.') }
                  finally { setBusy(false) }
                }}
                className="tap-target flex-1 rounded-xl bg-rose-600 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-white disabled:opacity-60"
              >
                {t('appt.confirmCancel')}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="tap-target flex-1 rounded-xl border border-slate-200 text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600"
              >
                {t('appt.keep')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="tap-target w-full rounded-xl border border-slate-200 text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600"
            >
              {t('appt.cancel')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS = {
  booked:    { key: 'appt.statusBooked',    tone: 'bg-navy-100 text-navy-900' },
  arrived:   { key: 'appt.statusArrived',   tone: 'bg-gold-100 text-navy-900' },
  served:    { key: 'appt.statusServed',    tone: 'bg-emerald-100 text-emerald-800' },
  no_show:   { key: 'appt.statusMissed',    tone: 'bg-rose-100 text-rose-800' },
  cancelled: { key: 'appt.statusCancelled', tone: 'bg-slate-200 text-slate-600' },
} as const
