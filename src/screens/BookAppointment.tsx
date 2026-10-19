import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Loader2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError, type BookingDay, type BookingSlot, type OfficeBooking } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * Booking a place at the counter.
 *
 * The app already saves a resident the paperwork; this is what saves them the
 * queue. Three choices in order — what for, which day, what time — because
 * each one narrows the next: the service decides the office, the office decides
 * which days are open, and the day decides which times are left.
 *
 * A full or past slot is shown greyed rather than hidden. A resident looking at
 * a half-empty morning needs to see that 8:30 has gone, not to wonder whether
 * the office opens at nine.
 */
export default function BookAppointment({ serviceId, requestId }: { serviceId?: string; requestId?: string }) {
  const { services, findCategory } = useCatalogue()
  const { replace } = useNav()
  const { t, locale } = useT()

  const [chosenService, setChosenService] = useState(serviceId ?? '')
  const service = services.find((s) => s.id === chosenService)
  const office = service ? findCategory(service.categoryId) : undefined

  const [days, setDays] = useState<BookingDay[]>([])
  const [rules, setRules] = useState<OfficeBooking | null>(null)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [loadingDays, setLoadingDays] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking] = useState(false)
  // Two errors, because they belong in different places on the screen. A
  // calendar that will not load is a problem with the whole page; a slot that
  // was taken while the resident was deciding is a problem with the tap they
  // just made, and telling them about it seven hundred pixels above the time
  // grid reads as the button simply not working.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)
  const [done, setDone] = useState<{ queueNo: string; date: string; time: string } | null>(null)

  // The office changes when the service does, so the calendar has to be reloaded
  // rather than filtered — a different office keeps different hours.
  useEffect(() => {
    if (!service) return
    let cancelled = false
    setLoadingDays(true)
    setDate('')
    setSlots([])
    api.bookingDays(service.categoryId)
      .then((res) => { if (!cancelled) { setDays(res.days); setRules(res.office) } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load that office’s calendar.') })
      .finally(() => { if (!cancelled) setLoadingDays(false) })
    return () => { cancelled = true }
  }, [service?.categoryId])

  const loadSlots = useCallback(async (day: string) => {
    if (!service) return
    setLoadingSlots(true)
    setLoadError(null)
    try {
      const res = await api.bookingSlots(service.categoryId, day)
      setSlots(res.slots)
      setClosedReason(res.closedReason)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load that day.')
    } finally {
      setLoadingSlots(false)
    }
  }, [service?.categoryId])

  const openDays = useMemo(() => days.filter((d) => d.open), [days])

  async function book(startTime: string) {
    if (!service || !date) return
    setBooking(true)
    setBookError(null)
    try {
      const made = await api.bookAppointment({
        serviceId: service.id, scheduledOn: date, startTime,
        requestId, note: note.trim() || undefined,
      })
      setDone({ queueNo: made.queueNo, date: made.scheduledOn, time: made.startTime })
    } catch (err) {
      setBookError(err instanceof ApiError ? err.message : 'Could not book that time.')
      // The slot may have gone while they were deciding, so show the truth now.
      void loadSlots(date)
    } finally {
      setBooking(false)
    }
  }

  if (done) {
    return (
      <div className="animate-tap-in pb-10">
        <TopBar title={t('book.title')} />
        <div className="px-4 pt-6 text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-600" />
          <h1 className="font-display mt-3 text-[calc(21px_*_var(--text-scale))] font-extrabold text-navy-950">
            {t('book.doneTitle')}
          </h1>
          <p className="mt-1 text-[calc(14px_*_var(--text-scale))] leading-snug text-slate-600">
            {t('book.doneBlurb', { office: office?.officeName ?? '', date: longDate(done.date, locale), time: done.time })}
          </p>

          <div className="mt-5 rounded-2xl border border-navy-100 bg-navy-50 px-5 py-4">
            <p className="text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
              {t('book.queueNo')}
            </p>
            <p className="font-display mt-0.5 text-[calc(26px_*_var(--text-scale))] font-extrabold tabular-nums text-navy-950">
              {done.queueNo}
            </p>
            <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('book.queueBlurb')}
            </p>
          </div>

          <button
            onClick={() => replace({ name: 'appointments' })}
            className="tap-target mt-5 w-full rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
          >
            {t('book.seeAppointments')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('book.title')} subtitle={t('book.subtitle')} />

      <div className="space-y-4 px-4 pt-4">
        {loadError && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[calc(13.5px_*_var(--text-scale))] text-rose-800">
            {loadError}
          </p>
        )}

        <Section step={1} title={t('book.whatFor')}>
          <select
            value={chosenService}
            onChange={(e) => setChosenService(e.target.value)}
            className="tap-target w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[calc(14px_*_var(--text-scale))] outline-none focus:border-navy-600"
          >
            <option value="">{t('book.pickService')}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {office && (
            <p className="mt-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {office.officeName}
              {office.address ? ` · ${office.address}` : ''}
            </p>
          )}
        </Section>

        {service && (
          <Section step={2} title={t('book.whichDay')}>
            {loadingDays ? (
              <Loading />
            ) : openDays.length === 0 ? (
              <p className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
                {days[0]?.reason ?? t('book.noDays')}
              </p>
            ) : (
              <>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {openDays.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => { setDate(d.date); void loadSlots(d.date) }}
                      className={`tap-target shrink-0 rounded-xl border px-3.5 text-center text-[calc(12.5px_*_var(--text-scale))] font-semibold ${
                        date === d.date
                          ? 'border-navy-800 bg-navy-800 text-white'
                          : 'border-slate-200 bg-white text-navy-950'
                      }`}
                    >
                      {shortDate(d.date, locale)}
                    </button>
                  ))}
                </div>
                {rules && (
                  <p className="mt-2 text-[calc(12px_*_var(--text-scale))] text-slate-500">
                    {t('book.hours', { opens: rules.opens, closes: rules.closes })}
                  </p>
                )}
              </>
            )}
          </Section>
        )}

        {service && date && (
          <Section step={3} title={t('book.whatTime')}>
            {loadingSlots ? (
              <Loading />
            ) : closedReason ? (
              <p className="text-[calc(13.5px_*_var(--text-scale))] text-slate-600">{closedReason}</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startTime}
                      disabled={!s.available || booking}
                      onClick={() => void book(s.startTime)}
                      className={`tap-target rounded-xl border text-[calc(13.5px_*_var(--text-scale))] font-semibold tabular-nums ${
                        s.available
                          ? 'border-navy-100 bg-white text-navy-950 active:bg-navy-50'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {s.startTime}
                    </button>
                  ))}
                </div>
                {bookError && (
                  <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-rose-800">
                    {bookError}
                  </p>
                )}
                <p className="mt-2 text-[calc(12px_*_var(--text-scale))] leading-snug text-slate-500">
                  {t('book.greyedOut')}
                </p>
              </>
            )}
          </Section>
        )}

        {service && date && !closedReason && (
          <Section step={4} title={t('book.anythingElse')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              rows={3}
              placeholder={t('book.notePlaceholder')}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[calc(14px_*_var(--text-scale))] outline-none placeholder:text-slate-400 focus:border-navy-600"
            />
          </Section>
        )}
      </div>
    </div>
  )
}

const Loading = () => (
  <p className="flex items-center gap-2 py-3 text-[calc(13px_*_var(--text-scale))] text-slate-500">
    <Loader2 size={14} className="animate-spin" /> …
  </p>
)

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[calc(12px_*_var(--text-scale))] font-bold text-white">
          {step}
        </span>
        <h2 className="text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/**
 * Both take the locale because both print weekday and month names, which are
 * the words a resident actually reads off a booking — "Lunes" and "Oktubre"
 * rather than "Monday" and "October" on a Filipino screen. `longDate` is
 * exported and used by the appointments list as well, so it is the caller's
 * job to hand its own locale in.
 */
export const longDate = (iso: string, locale: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric',
  })

const shortDate = (iso: string, locale: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' })}\n${d.toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' })}`
}

export { CalendarClock }
