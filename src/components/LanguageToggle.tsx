import { Languages } from 'lucide-react'
import { useT, type Language } from '../lib/i18n'

const OPTIONS: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'fil', label: 'Filipino' },
]

/**
 * Both labels are written in their own language, so someone who reads only one
 * of them can still find the right button.
 */
export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useT()

  return (
    <div className={compact ? '' : 'rounded-2xl border border-slate-200 bg-white p-4'}>
      {!compact && (
        <div className="mb-2.5 flex items-center gap-2">
          <Languages size={15} className="text-navy-800" />
          <div>
            <p className="text-[13px] font-bold text-navy-950">{t('profile.language')}</p>
            <p className="text-[11.5px] text-slate-500">{t('profile.languageBlurb')}</p>
          </div>
        </div>
      )}
      <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label={t('profile.language')}>
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={language === option.id}
            className={`flex-1 rounded-lg py-2 text-[12.5px] font-semibold transition ${
              language === option.id ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
