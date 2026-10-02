import { AlertTriangle, ChevronRight } from 'lucide-react'
import TopBar from '../components/TopBar'
import EmergencyContacts from '../components/EmergencyContacts'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * One screen for "something is wrong".
 *
 * It is reached from a button on the dashboard rather than buried in the ID
 * screen, because the moment somebody needs this is the moment they should not
 * be navigating. Two things, in the order they matter: the numbers that answer
 * now, and — underneath — the way to report something the municipality should
 * know about but nobody needs to be dispatched for this minute.
 *
 * Ringing comes first and reporting second on purpose. A report is not an
 * emergency call, and a resident watching a fire should be dialling, not
 * filling in a form.
 */
export default function Emergency() {
  const { push } = useNav()
  const { t } = useT()

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title={t('sos.screenTitle')} />

      <div className="px-4 pt-4">
        <EmergencyContacts />

        <p className="mb-2 mt-6 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
          {t('incident.sectionTitle')}
        </p>
        <button
          onClick={() => push({ name: 'report-incident' })}
          className="tap-target flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left active:bg-amber-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle size={18} className="text-amber-700" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
              {t('incident.reportCta')}
            </span>
            <span className="block text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('incident.reportBlurb')}
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-slate-400" />
        </button>
      </div>
    </div>
  )
}
