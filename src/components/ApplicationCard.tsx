import { CalendarClock, ChevronRight, FileEdit } from 'lucide-react'
import type { Application } from '../types'
import StatusPill from './StatusPill'
import { WORKFLOW_STEPS } from '../types'
import { useCatalogue } from '../lib/catalogue'
import { useT } from '../lib/i18n'
import { formatReadyRange } from '../lib/schedule'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ApplicationCard({ app, onTap }: { app: Application; onTap: () => void }) {
  const { findCategory } = useCatalogue()
  const category = findCategory(app.categoryId)
  const { t } = useT()

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {category && (
            <p className="truncate text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-[0.06em] text-navy-700">
              {category.name}
            </p>
          )}
          <p className="mt-0.5 truncate font-display text-[calc(15px_*_var(--text-scale))] font-bold text-navy-950">{app.serviceName}</p>
          <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
            {app.isOfflineDraft ? 'Saved offline' : `Ref. ${app.referenceNo}`} &middot; {formatDate(app.dateSubmitted)}
          </p>
        </div>
        <StatusPill status={app.status} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        {app.status === 'draft' ? (
          <span className="flex items-center gap-1.5 text-[calc(13px_*_var(--text-scale))] font-medium text-slate-500">
            <FileEdit size={13} /> {t('requests.finishDraft')}
          </span>
        ) : (
          <span className="text-[calc(13px_*_var(--text-scale))] font-medium text-navy-800">
            {t(`step.${WORKFLOW_STEPS[app.currentStepIndex]}`)}
          </span>
        )}
        <ChevronRight size={16} className="text-slate-300" />
      </div>

      {app.expectedReady && (
        <p className="mt-2 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
          <CalendarClock size={13} className="shrink-0 text-navy-700" />
          {t('ready.byShort', {
            date: formatReadyRange(app.expectedReady.from, app.expectedReady.to),
          })}
        </p>
      )}
    </button>
  )
}
