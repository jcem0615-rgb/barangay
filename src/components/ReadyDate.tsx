import { CalendarClock, Wallet } from 'lucide-react'
import type { Application } from '../types'
import { formatReadyRange } from '../lib/schedule'
import { useT } from '../lib/i18n'

/**
 * When the office expects to have the document ready.
 *
 * Two honest states rather than one date. While a fee is unpaid the office has
 * not been handed anything it can act on, so quoting a date would be a promise
 * it cannot keep — and would read as the office being slow when the delay is
 * the resident's. That case says what is needed instead.
 */
export default function ReadyDate({ app }: { app: Application }) {
  const { t, locale } = useT()

  if (app.awaitingResident) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Wallet size={17} className="text-amber-700" />
        </span>
        <div className="min-w-0">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-amber-900">
            {t('ready.awaiting')}
          </p>
          <p className="mt-0.5 text-[calc(13px_*_var(--text-scale))] leading-snug text-amber-800">
            {t('ready.awaitingBlurb')}
          </p>
        </div>
      </div>
    )
  }

  if (!app.expectedReady) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-navy-100 bg-navy-50 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100">
        <CalendarClock size={17} className="text-navy-800" />
      </span>
      <div className="min-w-0">
        <p className="text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-navy-700">
          {t('ready.title')}
        </p>
        <p className="font-display mt-0.5 text-[calc(17px_*_var(--text-scale))] font-extrabold leading-tight text-navy-950">
          {formatReadyRange(app.expectedReady.from, app.expectedReady.to, locale)}
        </p>
        <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
          {t('ready.estimate')}
        </p>
      </div>
    </div>
  )
}
