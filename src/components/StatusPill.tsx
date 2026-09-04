import type { ApplicationStatus } from '../types'
import { useT } from '../lib/i18n'

const STYLES: Record<ApplicationStatus, string> = {
  draft: 'bg-slate-200 text-slate-600',
  submitted: 'bg-navy-100 text-navy-800',
  in_progress: 'bg-navy-100 text-navy-800',
  for_payment: 'bg-gold-100 text-gold-600',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-600',
}

export default function StatusPill({ status }: { status: ApplicationStatus }) {
  const { t } = useT()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${STYLES[status]}`}>
      {t(`status.${status}`)}
    </span>
  )
}
