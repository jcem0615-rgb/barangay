import { Home, LayoutGrid, FileClock, UserRound } from 'lucide-react'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

const ITEMS = [
  { key: 'dashboard', label: 'nav.home', icon: Home },
  { key: 'services', label: 'nav.services', icon: LayoutGrid },
  { key: 'applications', label: 'nav.requests', icon: FileClock },
  { key: 'profile', label: 'nav.profile', icon: UserRound },
] as const

export default function BottomNav() {
  const { screen, replace } = useNav()
  const { t } = useT()

  const activeKey =
    screen.name === 'dashboard'
      ? 'dashboard'
      : screen.name === 'services' || screen.name === 'category' || screen.name === 'service-form'
        ? 'services'
        : screen.name === 'applications' || screen.name === 'application-detail' || screen.name === 'payment'
          ? 'applications'
          : screen.name === 'profile' || screen.name === 'id-card'
            ? 'profile'
            : ''

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[430px] items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {ITEMS.map(({ key, label, icon: Icon }) => {
        const active = activeKey === key
        return (
          <button
            key={key}
            onClick={() => replace({ name: key } as never)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 pt-3 transition-colors active:opacity-60"
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.4 : 1.9}
              className={active ? 'text-navy-800' : 'text-slate-400'}
            />
            <span className={`text-[11px] ${active ? 'font-semibold text-navy-800' : 'font-medium text-slate-400'}`}>
              {t(label)}
            </span>
            <span className={`h-1 w-1 rounded-full ${active ? 'bg-gold-500' : 'bg-transparent'}`} />
          </button>
        )
      })}
    </nav>
  )
}
