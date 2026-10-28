import { Home, LayoutGrid, FileClock, CalendarClock, UserRound } from 'lucide-react'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import { useCatalogue } from '../lib/catalogue'

const ITEMS = [
  { key: 'dashboard', label: 'nav.home', icon: Home },
  { key: 'services', label: 'nav.services', icon: LayoutGrid },
  { key: 'applications', label: 'nav.requests', icon: FileClock },
  { key: 'appointments', label: 'nav.appointments', icon: CalendarClock },
  { key: 'profile', label: 'nav.profile', icon: UserRound },
] as const

/**
 * Appointments are the hall's: a counter, a slot and a queue number against an
 * office's booking row. A barangay deployment has no offices and the routes are
 * not mounted, so the tab would open a screen whose first request 404s.
 *
 * Services stays, because "what can I ask for?" is still the question — it just
 * has one answer there, so it opens the barangay instead of a switch between
 * two tiers.
 */
const BARANGAY_TIER_ITEMS = ITEMS.filter((i) => i.key !== 'appointments')

export default function BottomNav() {
  const { screen, replace } = useNav()
  const { t } = useT()
  const { tier } = useCatalogue()
  const solo = tier === 'barangay'
  const items = solo ? BARANGAY_TIER_ITEMS : ITEMS

  const activeKey =
    screen.name === 'dashboard'
      ? 'dashboard'
      : // Both tiers live under the Services tab: the switch at the top of each
        // catalogue is what distinguishes them, so a second nav item would be a
        // second place to make the same choice.
        ['services', 'category', 'service-form', 'barangay', 'barangay-request', 'service-guide'].includes(screen.name)
        ? 'services'
        : screen.name === 'applications' || screen.name === 'application-detail' || screen.name === 'payment'
          ? 'applications'
          : screen.name === 'appointments' || screen.name === 'book-appointment'
          ? 'appointments'
          : screen.name === 'profile' || screen.name === 'id-card'
            ? 'profile'
            : ''

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[430px] items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {items.map(({ key, label, icon: Icon }) => {
        const active = activeKey === key
        return (
          <button
            key={key}
            onClick={() =>
              // With one tier there is no catalogue to switch within, so the
              // Services tab opens the barangay directly rather than a chooser.
              replace({ name: solo && key === 'services' ? 'barangay' : key } as never)
            }
            className="tap-target flex flex-1 flex-col items-center justify-center gap-1 py-2.5 pt-3 transition-colors active:opacity-60"
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.4 : 1.9}
              className={active ? 'text-navy-800' : 'text-slate-500'}
            />
            <span className={`text-[calc(12px_*_var(--text-scale))] ${active ? 'font-semibold text-navy-800' : 'font-medium text-slate-500'}`}>
              {t(label)}
            </span>
            <span className={`h-1 w-1 rounded-full ${active ? 'bg-gold-500' : 'bg-transparent'}`} />
          </button>
        )
      })}
    </nav>
  )
}
