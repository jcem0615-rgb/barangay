import { Check, Clock } from 'lucide-react'
import { STEP_OWNER, WORKFLOW_STEPS } from '../types'
import { useT } from '../lib/i18n'

interface WorkflowTrackerProps {
  currentStepIndex: number
  rejected?: boolean
  /**
   * Whether the request is actually closed. Paying moves a request onto the
   * final step without finishing it — the office still has to release the
   * document — so the last step is only ticked when the server says completed.
   * Ticking it on arrival told a resident their document was out when the
   * office had not yet looked at it.
   */
  completed?: boolean
}

/**
 * Where a request has got to, and — the part a resident actually needs — whose
 * move it is.
 *
 * Every step carries its text, upcoming ones included. A resident who can only
 * see as far as the step they are on cannot tell whether the next thing is a
 * week of office work or a fee they have to go and settle, which is the whole
 * question they opened the screen to answer. Future steps are muted rather than
 * blank.
 *
 * The current step says who is waiting on whom in words, not by colour — the
 * distinction between "the office is working on this" and "nothing happens
 * until you do something" is too important to encode as a hue.
 */
export default function WorkflowTracker({ currentStepIndex, rejected, completed }: WorkflowTrackerProps) {
  const { t } = useT()

  return (
    <ol className="relative">
      {WORKFLOW_STEPS.map((step, index) => {
        const isDone =
          index < currentStepIndex ||
          (index === currentStepIndex && index === WORKFLOW_STEPS.length - 1 && !rejected && !!completed)
        const isCurrent = index === currentStepIndex && !isDone
        const isLast = index === WORKFLOW_STEPS.length - 1
        const yours = STEP_OWNER[step] === 'resident'

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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className={`text-[calc(14.5px_*_var(--text-scale))] font-semibold ${isDone || isCurrent ? 'text-navy-950' : 'text-slate-500'}`}>
                  {t(`step.${step}`)}
                </p>
                {isCurrent && !rejected && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-bold ${
                      yours ? 'bg-gold-100 text-navy-900' : 'bg-navy-50 text-navy-800'
                    }`}
                  >
                    {yours ? t('step.yourMove') : t('step.withOffice')}
                  </span>
                )}
              </div>
              <p
                className={`mt-0.5 text-[calc(13px_*_var(--text-scale))] leading-snug ${
                  isDone || isCurrent ? 'text-slate-600' : 'text-slate-500'
                }`}
              >
                {isCurrent && rejected ? t('stepDetail.rejected') : t(`stepDetail.${step}`)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
