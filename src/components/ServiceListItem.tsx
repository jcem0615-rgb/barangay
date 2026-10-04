import { ChevronRight, Clock3, Wallet } from 'lucide-react'
import type { ServiceDefinition } from '../types'
import { formatPeso } from '../lib/money'
import { formatProcessingTime } from '../lib/schedule'
import { useT } from '../lib/i18n'

export default function ServiceListItem({ service, onTap }: { service: ServiceDefinition; onTap: () => void }) {
  const { t } = useT()
  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[calc(15px_*_var(--text-scale))] font-bold leading-tight text-navy-950">{service.name}</p>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-slate-300" />
      </div>
      <p className="mt-1.5 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-500">{service.shortDescription}</p>
      <div className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[calc(12.5px_*_var(--text-scale))] font-medium text-slate-500">
          <Clock3 size={13} /> {formatProcessingTime(service.processingDaysMin, service.processingDaysMax, t)}
        </span>
        <span className="flex items-center gap-1.5 text-[calc(12.5px_*_var(--text-scale))] font-medium text-slate-500">
          <Wallet size={13} /> {service.requiresPayment ? formatPeso(service.fee) : 'Free'}
        </span>
      </div>
    </button>
  )
}
