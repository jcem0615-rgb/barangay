import { Building, Landmark } from 'lucide-react'
import { useNav, type Screen } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * Which tier of government you are looking at.
 *
 * Two levels issue documents to the same resident, and the one thing people get
 * wrong is which of them owns what — a mistake that costs a trip to the wrong
 * office. So the tier is never implicit: it is a visible pair of controls at the
 * top of both catalogues, with the one you are on filled in, and switching is
 * one tap rather than a walk back through the dashboard.
 *
 * It `replace`s rather than `push`es: the two tiers are siblings, not a path
 * into one another, so going back from either lands on the dashboard instead of
 * retracing however many times somebody flipped between them.
 */
export default function TierSwitch({ active }: { active: 'municipal' | 'barangay' }) {
  const { replace } = useNav()
  const { t } = useT()

  const tiers: Array<{ key: 'municipal' | 'barangay'; screen: Screen; label: string; icon: typeof Landmark }> = [
    { key: 'municipal', screen: { name: 'services' }, label: t('tier.municipal'), icon: Landmark },
    { key: 'barangay', screen: { name: 'barangay' }, label: t('tier.barangay'), icon: Building },
  ]

  return (
    <div role="tablist" aria-label={t('tier.label')} className="flex gap-1.5 rounded-xl bg-slate-200/70 p-1">
      {tiers.map(({ key, screen, label, icon: Icon }) => {
        const on = key === active
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            onClick={() => { if (!on) replace(screen) }}
            className={`tap-target flex flex-1 items-center justify-center gap-1.5 rounded-lg text-[calc(13px_*_var(--text-scale))] font-semibold transition ${
              on ? 'bg-white text-navy-800 shadow-sm shadow-slate-900/[0.06]' : 'text-slate-600 active:bg-white/50'
            }`}
          >
            <Icon size={15} strokeWidth={on ? 2.3 : 1.9} /> {label}
          </button>
        )
      })}
    </div>
  )
}
