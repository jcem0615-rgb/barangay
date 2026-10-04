import { ListOrdered, ArrowRight } from 'lucide-react'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * The way into the step-by-step route, offered before the form rather than
 * after it.
 *
 * A resident who opens a form and starts typing has already decided they can do
 * this. The one who cannot — because something has to be obtained from another
 * office first — needs to find that out now, not at the counter, so the offer
 * sits at the top of the form and names how many steps there are. It renders
 * nothing when the office has published no route, because a link to an empty
 * page is worse than no link.
 */
export default function GuideLink({
  serviceId, certificateId, stepCount,
}: { serviceId?: string; certificateId?: string; stepCount: number }) {
  const { push } = useNav()
  const { t } = useT()
  if (stepCount === 0) return null

  return (
    <button
      onClick={() => push({ name: 'service-guide', serviceId, certificateId })}
      className="flex w-full items-center gap-3 rounded-2xl border border-navy-100 bg-navy-50 p-3.5 text-left active:bg-navy-100"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-navy-800">
        <ListOrdered size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[calc(13.5px_*_var(--text-scale))] font-bold text-navy-950">
          {t('guide.cta')}
        </span>
        <span className="block text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
          {t('guide.ctaBlurb', { count: String(stepCount) })}
        </span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-navy-800" />
    </button>
  )
}
