import { ALargeSmall } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useTextScale, type TextScale } from '../lib/textScale'

/**
 * Each option is rendered at the size it selects, so the choice is legible
 * before it is made rather than after.
 */
const OPTIONS: Array<{ id: TextScale; px: number }> = [
  { id: 'normal', px: 13 },
  { id: 'large', px: 15 },
  { id: 'xlarge', px: 17 },
]

const LABEL = {
  normal: 'profile.textNormal',
  large: 'profile.textLarge',
  xlarge: 'profile.textXLarge',
} as const

export default function TextSizeToggle() {
  const { scale, setScale } = useTextScale()
  const { t } = useT()

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <ALargeSmall size={16} className="text-navy-800" />
        <div>
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('profile.textSize')}
          </p>
          <p className="text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
            {t('profile.textSizeBlurb')}
          </p>
        </div>
      </div>
      <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label={t('profile.textSize')}>
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setScale(option.id)}
            aria-pressed={scale === option.id}
            /* Deliberately not scaled: these are samples of each size. */
            style={{ fontSize: `${option.px}px` }}
            className={`tap-target flex-1 rounded-lg font-semibold transition ${
              scale === option.id ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t(LABEL[option.id])}
          </button>
        ))}
      </div>
    </div>
  )
}
