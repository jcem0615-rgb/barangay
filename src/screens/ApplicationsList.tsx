import { useState } from 'react'
import TopBar from '../components/TopBar'
import ApplicationCard from '../components/ApplicationCard'
import { useAppData } from '../lib/appData'
import { useNav } from '../lib/nav'
import { Inbox } from 'lucide-react'
import { useT } from '../lib/i18n'

const TABS = [
  { key: 'all', label: 'requests.tabAll' },
  { key: 'in_progress', label: 'requests.tabActive' },
  { key: 'for_payment', label: 'requests.tabForPayment' },
  { key: 'completed', label: 'requests.tabCompleted' },
  { key: 'draft', label: 'requests.tabDrafts' },
] as const

export default function ApplicationsList() {
  const { applications } = useAppData()
  const { push } = useNav()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all')
  const { t } = useT()

  const filtered =
    tab === 'all'
      ? applications
      : tab === 'in_progress'
        ? applications.filter((a) => a.status === 'in_progress' || a.status === 'submitted')
        : applications.filter((a) => a.status === tab)

  return (
    <div className="animate-tap-in pb-24">
      <TopBar
        title={t('requests.title')}
        subtitle={t(applications.length === 1 ? 'requests.count' : 'requests.countPlural', {
          count: applications.length,
        })}
      />

      <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pt-3">
        {TABS.map((option) => (
          <button
            key={option.key}
            onClick={() => setTab(option.key)}
            className={`tap-target shrink-0 rounded-full px-3.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold transition ${
              tab === option.key ? 'bg-navy-800 text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 px-4">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-12 text-center">
            <Inbox size={26} className="text-slate-300" />
            <p className="mt-2.5 text-[calc(14px_*_var(--text-scale))] font-medium text-slate-500">{t('requests.empty')}</p>
          </div>
        )}
        {filtered.map((app) => (
          <ApplicationCard key={app.id} app={app} onTap={() => push({ name: 'application-detail', id: app.id })} />
        ))}
      </div>
    </div>
  )
}
