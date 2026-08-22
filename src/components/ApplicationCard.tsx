import { ChevronRight, FileEdit } from 'lucide-react'
import type { Application } from '../types'
import StatusPill from './StatusPill'
import { WORKFLOW_STEPS } from '../types'
import { findCategory } from '../data/mockData'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ApplicationCard({ app, onTap }: { app: Application; onTap: () => void }) {
  const category = findCategory(app.categoryId)

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {category && (
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-navy-700">
              {category.name}
            </p>
          )}
          <p className="mt-0.5 truncate font-display text-[14px] font-bold text-navy-950">{app.serviceName}</p>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            {app.isOfflineDraft ? 'Saved offline' : `Ref. ${app.referenceNo}`} &middot; {formatDate(app.dateSubmitted)}
          </p>
        </div>
        <StatusPill status={app.status} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        {app.status === 'draft' ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
            <FileEdit size={13} /> Tap to finish and submit
          </span>
        ) : (
          <span className="text-[12px] font-medium text-navy-800">
            {WORKFLOW_STEPS[app.currentStepIndex]}
          </span>
        )}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  )
}
