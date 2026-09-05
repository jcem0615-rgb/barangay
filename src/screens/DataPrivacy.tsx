import { ShieldCheck } from 'lucide-react'
import TopBar from '../components/TopBar'
import { useT } from '../lib/i18n'
import type { StringKey } from '../i18n/strings'

/**
 * The Data Privacy Act notice.
 *
 * A Philippine government service that collects a PhilSys number, a birth date
 * and a household's programme record owes the resident a plain statement of
 * what it holds and what they can do about it. Written as short sections rather
 * than a wall of legal text, because the point is that it gets read.
 */
const SECTIONS: Array<{ heading: StringKey; body: StringKey }> = [
  { heading: 'privacy.collectTitle', body: 'privacy.collectBody' },
  { heading: 'privacy.useTitle', body: 'privacy.useBody' },
  { heading: 'privacy.shareTitle', body: 'privacy.shareBody' },
  { heading: 'privacy.keepTitle', body: 'privacy.keepBody' },
  { heading: 'privacy.rightsTitle', body: 'privacy.rightsBody' },
]

export default function DataPrivacy() {
  const { t } = useT()

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('privacy.title')} subtitle={t('privacy.subtitle')} />

      <div className="px-4 pt-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <ShieldCheck size={17} className="text-emerald-700" />
          </span>
          <p className="text-[calc(13px_*_var(--text-scale))] leading-relaxed text-emerald-800">
            {t('privacy.lead')}
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {SECTIONS.map(({ heading, body }) => (
            <section key={heading} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t(heading)}</h2>
              <p className="mt-1.5 text-[calc(13.5px_*_var(--text-scale))] leading-relaxed text-slate-600">
                {t(body)}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('privacy.contactTitle')}
          </h2>
          <p className="mt-1.5 text-[calc(13.5px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('privacy.contactBody')}
          </p>
          <a
            href="mailto:dpo@sanfernando.gov.ph"
            className="mt-2 inline-block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800 underline-offset-2 hover:underline"
          >
            dpo@sanfernando.gov.ph
          </a>
        </div>
      </div>
    </div>
  )
}
