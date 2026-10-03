import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import TopBar from '../components/TopBar'
import CategoryTile from '../components/CategoryTile'
import TierSwitch from '../components/TierSwitch'
import { useCatalogue } from '../lib/catalogue'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import { searchServices } from '../lib/search'
import { formatPeso } from '../lib/money'

/**
 * The service catalogue, with a way in by name.
 *
 * Six offices and seventeen services is small enough to browse and large enough
 * that browsing is the wrong first move for someone who already knows what they
 * want. A resident thinking "permit for my sari-sari store" should not have to
 * work out that this is Business Permits and Licensing before they can start.
 *
 * The tiles stay: browsing is the right move for someone who does *not* know
 * what they need, and an office list also tells them what the municipality
 * actually does. Search replaces the list only while something is typed.
 */
export default function Services() {
  const { push } = useNav()
  const { departments, services, findCategory } = useCatalogue()
  const { t } = useT()
  const [query, setQuery] = useState('')

  const results = useMemo(
    () => searchServices(query, services, findCategory),
    [query, services, findCategory]
  )
  const searching = query.trim().length > 0

  return (
    <div className="animate-tap-in pb-6">
      <TopBar title={t('services.title')} subtitle={t('services.subtitle')} />

      <div className="px-4 pt-4">
        {/* Which tier, before what service: the search below only ever looks at
            the municipal catalogue. */}
        <div className="mb-3">
          <TierSwitch active="municipal" />
        </div>

        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label={t('search.label')}
            placeholder={t('search.placeholder')}
            className="tap-target w-full rounded-xl border border-slate-200 bg-white pl-11 pr-11 text-[calc(14.5px_*_var(--text-scale))] outline-none placeholder:text-slate-500 focus:border-navy-600"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('search.clear')}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {searching ? (
        <div className="px-4 pt-4">
          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
              <p className="text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-950">
                {t('search.noneTitle', { query: query.trim() })}
              </p>
              <p className="mt-1.5 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
                {t('search.noneBlurb')}
              </p>
              <button
                onClick={() => setQuery('')}
                className="tap-target mt-3 rounded-xl border border-slate-200 px-4 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800"
              >
                {t('search.browseInstead')}
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
                {results.length === 1
                  ? t('search.oneResult')
                  : t('search.results', { count: results.length })}
              </p>
              <ul className="space-y-2">
                {results.map(({ service, office }) => (
                  <li key={service.id}>
                    <button
                      onClick={() => push({ name: 'service-form', serviceId: service.id })}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50"
                    >
                      <p className="text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">{service.name}</p>
                      <p className="mt-0.5 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
                        {service.shortDescription}
                      </p>
                      {/* The office is the answer to the question behind the
                          search — "who do I even go to for this". */}
                      <p className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
                        {office?.officeName}
                        {' · '}
                        {service.fee > 0 ? formatPeso(service.fee) : t('form.free')}
                        {' · '}
                        {service.processingTime}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3 px-4 pt-4">
          {departments.map((cat) => (
            <CategoryTile key={cat.id} category={cat} onTap={() => push({ name: 'category', categoryId: cat.id })} />
          ))}
        </div>
      )}
    </div>
  )
}
