import { Monitor, Moon, Sun } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useTheme, type ThemeChoice } from '../lib/theme'

/**
 * Light / Dark / Follow phone, shaped like the text-size control beside it so
 * the two read as one row of preferences rather than two inventions.
 *
 * **"Follow phone" is a real option and the default.** A resident who set
 * their phone to dark has already answered this, and it keeps following
 * afterwards — the icon is the honest one for a setting that is not a fixed
 * colour.
 */
const OPTIONS: Array<{ id: ThemeChoice; icon: typeof Sun; label: 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem' }> = [
  { id: 'light', icon: Sun, label: 'profile.themeLight' },
  { id: 'dark', icon: Moon, label: 'profile.themeDark' },
  { id: 'system', icon: Monitor, label: 'profile.themeSystem' },
]

export default function ThemeToggle() {
  const { choice, resolved, setChoice } = useTheme()
  const { t } = useT()

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {resolved === 'dark' ? (
          <Moon size={16} className="text-navy-800" />
        ) : (
          <Sun size={16} className="text-navy-800" />
        )}
        <div>
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('profile.theme')}
          </p>
          <p className="text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
            {t('profile.themeBlurb')}
          </p>
        </div>
      </div>
      <div
        className="flex rounded-xl bg-slate-100 p-1"
        role="group"
        aria-label={t('profile.theme')}
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setChoice(option.id)}
              aria-pressed={choice === option.id}
              className={`tap-target flex flex-1 items-center justify-center gap-1.5 rounded-lg text-[calc(13px_*_var(--text-scale))] font-semibold transition ${
                choice === option.id ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Icon size={14} />
              {t(option.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
