import { Bell } from 'lucide-react'
import { RESIDENT, SERVICE_CATEGORIES } from '../data/mockData'
import IDCard from '../components/IDCard'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import OfflineBanner from '../components/OfflineBanner'
import ApplicationCard from '../components/ApplicationCard'
import { resolveIcon } from '../lib/icons'

export default function Dashboard() {
  const { push } = useNav()
  const { applications } = useAppData()
  const isOnline = useOnlineStatus()
  const recent = applications.slice(0, 2)

  return (
    <div className="animate-tap-in px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[13px] text-slate-500">Magandang araw,</p>
          <h1 className="font-display text-[21px] font-extrabold text-navy-950">{RESIDENT.firstName} 👋</h1>
        </div>
        <button
          onClick={() => push({ name: 'applications' })}
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-slate-900/[0.04] active:bg-slate-50"
        >
          <Bell size={18} className="text-navy-800" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gold-500" />
        </button>
      </div>

      {!isOnline && (
        <div className="mb-4">
          <OfflineBanner compact />
        </div>
      )}

      <IDCard profile={RESIDENT} onTap={() => push({ name: 'id-card' })} />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-bold text-navy-950">Quick Services</h2>
        <button onClick={() => push({ name: 'services' })} className="text-[12.5px] font-semibold text-navy-800">
          View all
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {SERVICE_CATEGORIES.map((cat) => {
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
        <h2 className="font-display text-[15px] font-bold text-navy-950">Recent Requests</h2>
        <button onClick={() => push({ name: 'applications' })} className="text-[12.5px] font-semibold text-navy-800">
          See all
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {recent.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-[13px] text-slate-400">
            No requests yet. Start with Quick Services above.
          </p>
        )}
        {recent.map((app) => (
          <ApplicationCard key={app.id} app={app} onTap={() => push({ name: 'application-detail', id: app.id })} />
        ))}
      </div>
    </div>
  )
}
