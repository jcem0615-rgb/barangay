import { ChevronRight, CircleHelp, FileText, IdCard, LogOut, MessageSquareWarning, ShieldCheck, Wifi } from 'lucide-react'
import TopBar from '../components/TopBar'
import { addressLine, useResidentProfile } from '../lib/resident'
import { useAuth } from '../lib/auth'
import NotificationSettings from '../components/NotificationSettings'
import LanguageToggle from '../components/LanguageToggle'
import TextSizeToggle from '../components/TextSizeToggle'
import { useNav } from '../lib/nav'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { useT } from '../lib/i18n'

/**
 * Every row goes somewhere. A chevron that does nothing when tapped reads as a
 * broken app, so the old notification-preferences row was dropped rather than
 * wired — the settings it pointed at are rendered in full a few rows above it.
 */
const SETTINGS = [
  { icon: IdCard, label: 'profile.digitalId' as const, screen: 'id-card' as const },
  { icon: MessageSquareWarning, label: 'profile.complaints' as const, screen: 'complaints' as const },
  { icon: FileText, label: 'profile.privacy' as const, screen: 'privacy' as const },
  { icon: CircleHelp, label: 'profile.help' as const, screen: 'help' as const },
]

export default function Profile() {
  const resident = useResidentProfile()
  const { logout } = useAuth()
  const { t } = useT()
  if (!resident) return null

  const { push } = useNav()
  const isOnline = useOnlineStatus()

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title={t('profile.title')} />

      <div className="px-4 pt-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-800 font-display text-[calc(18px_*_var(--text-scale))] font-bold text-white">
            {resident.firstName[0]}
            {resident.fullName.split(' ').at(-1)?.[0]}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[calc(15.5px_*_var(--text-scale))] font-bold text-navy-950">{resident.fullName}</p>
            <p className="truncate text-[calc(13px_*_var(--text-scale))] text-slate-500">{addressLine(resident.barangay, resident.municipality)}</p>
            <div className="mt-1 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-600" />
              <span className="text-[calc(12px_*_var(--text-scale))] font-semibold text-emerald-700">{t('profile.philsysVerified')}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5">
          <Wifi size={16} className={isOnline ? 'text-emerald-600' : 'text-amber-600'} />
          <p className="text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600">
            {isOnline ? 'Connected — requests sync in real time' : 'Offline — drafts save to this device'}
          </p>
        </div>

        <p className="mb-2 mt-6 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">{t('profile.display')}</p>
        <div className="space-y-2.5">
          <TextSizeToggle />
          <LanguageToggle />
        </div>

        <p className="mb-2 mt-6 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">{t('profile.notifications')}</p>
        <NotificationSettings />

        <p className="mb-2 mt-6 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">{t('profile.account')}</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {SETTINGS.map(({ icon: Icon, label, screen }, i) => (
            <button
              key={label}
              onClick={() => screen && push({ name: screen })}
              className={`tap-target flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 ${
                i !== SETTINGS.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <Icon size={17} className="text-navy-800" />
              <span className="flex-1 text-[calc(14.5px_*_var(--text-scale))] font-medium text-navy-950">{t(label)}</span>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          ))}
        </div>

        <button
          onClick={logout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3.5 text-[calc(14.5px_*_var(--text-scale))] font-semibold text-rose-600 active:bg-rose-100"
        >
          <LogOut size={16} /> {t('profile.signOut')}
        </button>

        <p className="mt-6 text-center text-[calc(12px_*_var(--text-scale))] text-slate-500">eLGU Citizen Portal &middot; v1.0.0</p>
      </div>
    </div>
  )
}
