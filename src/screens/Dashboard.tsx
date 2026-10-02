import { useEffect, useState } from 'react'
import { Bell, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { useResidentProfile } from '../lib/resident'
import IDCard from '../components/IDCard'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import OfflineBanner from '../components/OfflineBanner'
import InstallAppButton from '../components/InstallAppButton'
import ApplicationCard from '../components/ApplicationCard'
import { resolveIcon } from '../lib/icons'
import { useT } from '../lib/i18n'

export default function Dashboard() {
  const { push } = useNav()
  const { departments } = useCatalogue()
  const resident = useResidentProfile()
  const { t } = useT()
  const [unread, setUnread] = useState(0)

  // Refreshed on each visit to the dashboard; offices act while the app is closed.
  useEffect(() => {
    api.notifications().then((n) => setUnread(n.unread)).catch(() => undefined)
  }, [])
  const { applications } = useAppData()
  const isOnline = useOnlineStatus()
  const recent = applications.slice(0, 2)

  return (
    <div className="animate-tap-in px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[calc(14px_*_var(--text-scale))] text-slate-500">{t('home.greeting')}</p>
          <h1 className="font-display text-[calc(21px_*_var(--text-scale))] font-extrabold text-navy-950">{resident?.firstName ?? ''} 👋</h1>
        </div>
        <button
          onClick={() => push({ name: 'notifications' })}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-slate-900/[0.04] active:bg-slate-50"
        >
          <Bell size={18} className="text-navy-800" />
          {/* Only lit when something is actually waiting. */}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-500 px-1 text-[calc(11.5px_*_var(--text-scale))] font-bold text-navy-950">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>

      {!isOnline && (
        <div className="mb-4">
          <OfflineBanner compact />
        </div>
      )}

      {/*
        Above the ID card, and the only red thing on the screen. Somebody who
        needs this is not reading — they are looking for the one control that is
        obviously it, and a row in a list further down is not that. It opens the
        hotlines rather than dialling anything itself: which number to ring is
        the resident's choice, and an app that places a call on a tap is an app
        that calls the fire brigade from a pocket.
      */}
      <button
        onClick={() => push({ name: 'emergency' })}
        className="tap-target mb-5 flex w-full items-center gap-3 rounded-2xl bg-rose-600 px-4 py-3.5 text-left shadow-sm shadow-rose-900/10 active:bg-rose-700"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShieldAlert size={20} className="text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[calc(15.5px_*_var(--text-scale))] font-extrabold text-white">
            {t('sos.dashboardTitle')}
          </span>
          <span className="block text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-50">
            {t('sos.dashboardBlurb')}
          </span>
        </span>
      </button>

      {resident && <IDCard profile={resident} onTap={() => push({ name: 'id-card' })} />}

      {/* Under the ID rather than above it: the card is what they came for, and
          the offer means more once they have seen what they would be keeping. */}
      <div className="mt-4 empty:mt-0">
        <InstallAppButton variant="banner" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-[calc(15.5px_*_var(--text-scale))] font-bold text-navy-950">{t('home.quickServices')}</h2>
        <button onClick={() => push({ name: 'services' })} className="text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800">
          {t('common.viewAll')}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {departments.map((cat) => {
          const Icon = resolveIcon(cat.icon)
          return (
            <button
              key={cat.id}
              onClick={() => push({ name: 'category', categoryId: cat.id })}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 shadow-sm shadow-slate-900/[0.02] active:scale-[0.97] active:bg-slate-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
                <Icon size={19} strokeWidth={1.9} />
              </span>
              <span className="px-1 text-center text-[calc(11.5px_*_var(--text-scale))] font-semibold leading-tight text-navy-950">
                {cat.name.replace(' Services', '').replace(' (BOSS)', '')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-[calc(15.5px_*_var(--text-scale))] font-bold text-navy-950">{t('home.recentRequests')}</h2>
        <button onClick={() => push({ name: 'applications' })} className="text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800">
          {t('common.seeAll')}
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {recent.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-[calc(14px_*_var(--text-scale))] text-slate-500">
            {t('home.noRequests')}
          </p>
        )}
        {recent.map((app) => (
          <ApplicationCard key={app.id} app={app} onTap={() => push({ name: 'application-detail', id: app.id })} />
        ))}
      </div>
    </div>
  )
}
