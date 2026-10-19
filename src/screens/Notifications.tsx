import { useCallback, useEffect, useState } from 'react'
import { BellOff, CheckCheck } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, type Notification } from '../lib/api'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useT, type Translate } from '../lib/i18n'

/**
 * "just now", "5m ago", or a date once it is older than a day.
 *
 * Takes `t` and `locale` rather than reaching for them, because it is a plain
 * function: the words used to be English literals here, so every notification
 * on a Filipino screen ended in an English phrase, and the fallback date came
 * out with English month names.
 */
function timeAgo(iso: string, t: Translate, locale: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return t('time.justNow')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('time.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('time.hours', { count: hours })
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

const TONE: Record<Notification['kind'], string> = {
  assessed: 'bg-gold-100 text-gold-600',
  advanced: 'bg-navy-100 text-navy-800',
  released: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-600',
}

const LABEL: Record<Notification['kind'], 'notif.kindAssessed' | 'notif.kindAdvanced' | 'notif.kindReleased' | 'notif.kindRejected'> = {
  assessed: 'notif.kindAssessed',
  advanced: 'notif.kindAdvanced',
  released: 'notif.kindReleased',
  rejected: 'notif.kindRejected',
}

export default function Notifications() {
  const { push } = useNav()
  const { refresh } = useAppData()
  const { t, locale } = useT()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setItems((await api.notifications()).notifications)
    } catch {
      // Signed-out or offline; the empty state covers it.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function open(item: Notification) {
    if (!item.readAt) {
      await api.markNotificationRead(item.id).catch(() => undefined)
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)))
    }
    if (item.requestId) {
      // The request may have moved on since the notice was written.
      await refresh()
      push({ name: 'application-detail', id: item.requestId })
    }
  }

  return (
    <div className="animate-tap-in pb-24">
      <TopBar
        title={t('notif.title')}
        subtitle={
          items.some((n) => !n.readAt)
            ? t('notif.unread', { count: items.filter((n) => !n.readAt).length })
            : t('notif.allRead')
        }
      />

      {items.some((n) => !n.readAt) && (
        <div className="px-4 pt-3">
          <button
            onClick={async () => {
              await api.markAllNotificationsRead().catch(() => undefined)
              await load()
            }}
            className="flex items-center gap-1.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800"
          >
            <CheckCheck size={14} /> {t('notif.markAll')}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2.5 px-4">
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-14 text-center">
            <BellOff size={26} className="text-slate-300" />
            <p className="mt-2.5 text-[calc(14px_*_var(--text-scale))] font-medium text-slate-500">{t('notif.empty')}</p>
            <p className="mt-1 px-8 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-500">
              {t('notif.emptyBlurb')}
            </p>
          </div>
        )}

        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => void open(item)}
            className={`w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
              item.readAt ? 'border-slate-200 bg-white' : 'border-navy-100 bg-navy-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-semibold ${TONE[item.kind]}`}>
                {t(LABEL[item.kind])}
              </span>
              {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-navy-800" aria-label={t('a11y.unread')} />}
              <span className="ml-auto text-[calc(12px_*_var(--text-scale))] text-slate-500">
                {timeAgo(item.createdAt, t, locale)}
              </span>
            </div>
            <p className="mt-1.5 font-display text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">{item.title}</p>
            <p className="mt-0.5 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">{item.body}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
