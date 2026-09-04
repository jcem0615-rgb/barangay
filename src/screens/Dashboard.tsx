import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { api } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { useResidentProfile } from '../lib/resident'
import IDCard from '../components/IDCard'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import OfflineBanner from '../components/OfflineBanner'
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
          <p className="text-[13px] text-slate-500">{t('home.greeting')}</p>
          <h1 className="font-display text-[21px] font-extrabold text-navy-950">{resident?.firstName ?? ''} 👋</h1>
        </div>
        <button
          onClick={() => push({ name: 'notifications' })}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-slate-900/[0.04] active:bg-slate-50"
        >
          <Bell size={18} className="text-navy-800" />
          {/* Only lit when something is actually waiting. */}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-950">
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

      {resident && <IDCard profile={resident} onTap={() => push({ name: 'id-card' })} />}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-bold text-navy-950">{t('home.quickServices')}</h2>
        <button onClick={() => push({ name: 'services' })} className="text-[12.5px] font-semibold text-navy-800">
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
              <span className="px-1 text-center text-[10.5px] font-semibold leading-tight text-navy-950">
                {cat.name.replace(' Services', '').replace(' (BOSS)', '')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-bold text-navy-950">{t('home.recentRequests')}</h2>
        <button onClick={() => push({ name: 'applications' })} className="text-[12.5px] font-semibold text-navy-800">
          {t('common.seeAll')}
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {recent.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-[13px] text-slate-400">
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
