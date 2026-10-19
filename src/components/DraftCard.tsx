import { ChevronRight, FileEdit } from 'lucide-react'
import type { DraftRecord } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { useT, type Translate } from '../lib/i18n'

/**
 * A draft is not a request: it has no reference number, no status and no office
 * looking at it. It gets its own card rather than borrowing ApplicationCard's,
 * so nothing on it implies the LGU has been asked for anything yet.
 */
export default function DraftCard({ draft, onTap }: { draft: DraftRecord; onTap: () => void }) {
  const { findCategory, findService } = useCatalogue()
  const { t, locale } = useT()

  const category = draft.categoryId ? findCategory(draft.categoryId) : undefined
  const name = draft.serviceName ?? findService(draft.serviceId)?.name ?? draft.serviceId
  const filled = Object.values(draft.formValues).filter((v) => v.trim().length > 0).length

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {category && (
            <p className="truncate text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-[0.06em] text-navy-700">
              {category.name}
            </p>
          )}
          <p className="mt-0.5 truncate font-display text-[calc(15px_*_var(--text-scale))] font-bold text-navy-950">
            {name}
          </p>
          <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
            {t('draft.lastEdited', { when: formatWhen(draft.updatedAt, t, locale) })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[calc(11.5px_*_var(--text-scale))] font-semibold text-slate-600">
          {t('draft.notSubmitted')}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-2.5">
        <span className="text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
          {t(filled === 1 ? 'draft.answered' : 'draft.answeredPlural', { count: filled })}
        </span>
        <span className="flex items-center gap-1 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800">
          <FileEdit size={14} /> {t('draft.continue')}
          <ChevronRight size={15} />
        </span>
      </div>
    </button>
  )
}

/**
 * Recent drafts read better as a time than as a date the resident must decode.
 *
 * Handed `t` and `locale` for the reason the notification list's helper is:
 * "yesterday" was an English literal and the dates carried English month names
 * whatever language the resident had chosen.
 */
function formatWhen(iso: string, t: Translate, locale: string): string {
  const then = new Date(iso)
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return then.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return t('time.yesterday')
  return then.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
