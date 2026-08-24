import { useState } from 'react'
import TopBar from '../components/TopBar'
import ApplicationCard from '../components/ApplicationCard'
import { useAppData } from '../lib/appData'
import { useNav } from '../lib/nav'
import { Inbox } from 'lucide-react'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'Active' },
  { key: 'for_payment', label: 'For Payment' },
  { key: 'completed', label: 'Completed' },
  { key: 'draft', label: 'Drafts' },
] as const

export default function ApplicationsList() {
  const { applications } = useAppData()
  const { push } = useNav()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all')

  const filtered =
    tab === 'all'
      ? applications
      : tab === 'in_progress'
        ? applications.filter((a) => a.status === 'in_progress' || a.status === 'submitted')
        : applications.filter((a) => a.status === tab)

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title="My Requests" subtitle={`${applications.length} total request${applications.length === 1 ? '' : 's'}`} />

      <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
              tab === t.key ? 'bg-navy-800 text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 px-4">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-12 text-center">
            <Inbox size={26} className="text-slate-300" />
            <p className="mt-2.5 text-[13px] font-medium text-slate-400">No requests in this category yet</p>
          </div>
        )}
        {filtered.map((app) => (
          <ApplicationCard key={app.id} app={app} onTap={() => push({ name: 'application-detail', id: app.id })} />
        ))}
      </div>
    </div>
  )
}
