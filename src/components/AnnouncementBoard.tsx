import { useEffect, useState } from 'react'
import { CalendarDays, Droplets, Megaphone, Stethoscope, TriangleAlert } from 'lucide-react'
import { api, type Announcement } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * The barangay's board of notices, on the resident's phone.
 *
 * Everything else the barangay holds is deliberately unreadable outside its own
 * console. This is the opposite: a notice has no value until the people it is
 * about have seen it, so it sits in the barangay hub above the certificates —
 * what the barangay is telling you comes before what you can ask it for.
 *
 * It renders nothing at all when the board is empty. An empty-state card saying
 * "no announcements" is a permanent piece of furniture for a thing that is
 * usually empty, and it would push the certificates down the screen for nothing.
 */

const ICONS = {
  general: Megaphone,
  service: Droplets,
  emergency: TriangleAlert,
  health: Stethoscope,
  event: CalendarDays,
} as const

/**
 * Urgency is carried by the word and the icon, never by colour alone — the same
 * rule the workflow tracker follows for whose move it is. Red is reserved for
 * the emergency hotlines, so an urgent notice is amber: it is worth stopping
 * for, and it is not the button you press when the house is on fire.
 */
const TONE: Record<string, string> = {
  emergency: 'border-amber-300 bg-amber-50',
  service: 'border-slate-200 bg-white',
  health: 'border-slate-200 bg-white',
  event: 'border-slate-200 bg-white',
  general: 'border-slate-200 bg-white',
}

const dayMonth = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

export default function AnnouncementBoard() {
  const { t, locale } = useT()
  const [notices, setNotices] = useState<Announcement[]>([])

  useEffect(() => {
    api.barangayAnnouncements().then(setNotices).catch(() => undefined)
  }, [])

  if (notices.length === 0) return null

  return (
    <section className="mb-5">
      <p className="mb-2 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
        {t('brgy.board')}
      </p>
      <ul className="space-y-2.5">
        {notices.map((notice) => {
          const Icon = ICONS[notice.kind] ?? Megaphone
          return (
            <li
              key={notice.id}
              className={`rounded-2xl border p-4 ${TONE[notice.kind] ?? TONE.general}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    notice.urgent ? 'bg-amber-200 text-amber-900' : 'bg-navy-50 text-navy-800'
                  }`}
                >
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  {notice.urgent && (
                    <p className="mb-0.5 text-[calc(11.5px_*_var(--text-scale))] font-bold uppercase tracking-wide text-amber-800">
                      {t('brgy.urgent')}
                    </p>
                  )}
                  <h3 className="text-[calc(14.5px_*_var(--text-scale))] font-bold leading-snug text-navy-950">
                    {notice.title}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-700">
                    {notice.body}
                  </p>
                  <p className="mt-2 text-[calc(12px_*_var(--text-scale))] text-slate-500">
                    {dayMonth(notice.postedAt, locale)}
                    {notice.postedBy && ` · ${notice.postedBy}`}
                    {/* A notice corrected after it went out is not the notice
                        people read, so it says so rather than quietly changing. */}
                    {notice.editedAt && ` · ${t('brgy.edited')}`}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
