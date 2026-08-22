import { ChevronRight, Clock3, Wallet } from 'lucide-react'
import type { ServiceDefinition } from '../types'

export default function ServiceListItem({ service, onTap }: { service: ServiceDefinition; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[14.5px] font-bold leading-tight text-navy-950">{service.name}</p>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-slate-300" />
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-slate-500">{service.shortDescription}</p>
      <div className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
          <Clock3 size={13} /> {service.processingTime}
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
          <Wallet size={13} /> {service.requiresPayment ? `₱${service.fee.toLocaleString()}` : 'Free'}
        </span>
      </div>
    </button>
  )
}
