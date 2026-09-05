import { Check, Clock } from 'lucide-react'
import { WORKFLOW_STEPS } from '../types'
import { useT } from '../lib/i18n'

interface WorkflowTrackerProps {
  currentStepIndex: number
  rejected?: boolean
}

export default function WorkflowTracker({ currentStepIndex, rejected }: WorkflowTrackerProps) {
  const { t } = useT()

  return (
    <ol className="relative">
      {WORKFLOW_STEPS.map((step, index) => {
        const isDone = index < currentStepIndex || (index === currentStepIndex && index === WORKFLOW_STEPS.length - 1 && !rejected)
        const isCurrent = index === currentStepIndex && !isDone
        const isLast = index === WORKFLOW_STEPS.length - 1

        return (
          <li key={step} className="relative flex gap-3.5 pb-7 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${
                  isDone ? 'bg-navy-800' : 'bg-slate-200'
                }`}
              />
            )}
            <span
              className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[calc(12px_*_var(--text-scale))] font-bold ${
                isDone
                  ? 'border-navy-800 bg-navy-800 text-white'
                  : isCurrent
                    ? rejected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-gold-500 bg-gold-500 text-navy-950'
                    : 'border-slate-300 bg-white text-slate-500'
              }`}
            >
              {isDone ? <Check size={14} strokeWidth={3} /> : isCurrent ? <Clock size={13} strokeWidth={2.5} /> : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-[calc(14.5px_*_var(--text-scale))] font-semibold ${isDone || isCurrent ? 'text-navy-950' : 'text-slate-500'}`}>
                {t(`step.${step}`)}
              </p>
              {(isDone || isCurrent) && (
                <p className="mt-0.5 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-500">
                  {isCurrent && rejected ? t('stepDetail.rejected') : t(`stepDetail.${step}`)}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
