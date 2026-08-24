import type { ApplicationStatus } from '../types'

const STYLES: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-200 text-slate-600' },
  submitted: { label: 'Submitted', className: 'bg-navy-100 text-navy-800' },
  in_progress: { label: 'In Progress', className: 'bg-navy-100 text-navy-800' },
  for_payment: { label: 'For Payment', className: 'bg-gold-100 text-gold-600' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Needs Attention', className: 'bg-rose-100 text-rose-600' },
}

export default function StatusPill({ status }: { status: ApplicationStatus }) {
  const s = STYLES[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${s.className}`}>
      {s.label}
    </span>
  )
}
