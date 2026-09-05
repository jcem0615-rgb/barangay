import { Building2, Clock, Mail, MapPin, Phone } from 'lucide-react'
import TopBar from '../components/TopBar'
import { useCatalogue } from '../lib/catalogue'
import { useT } from '../lib/i18n'

/**
 * Where to go when the app cannot finish the job.
 *
 * A portal that can only be used inside itself is a dead end: someone whose
 * permit is stuck needs an address, an opening time, and a number that rings at
 * a desk. Phone and email are real links, so a tap dials or composes rather
 * than making someone copy digits by hand.
 *
 * The details are catalogue data, so an office that moves floors is a reseed,
 * not a release.
 */
export default function HelpSupport() {
  const { departments } = useCatalogue()
  const { t } = useT()

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('help.title')} subtitle={t('help.subtitle')} />

      <div className="space-y-3 px-4 pt-4">
        <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('help.intro')}
          </p>
          <p className="mt-1 text-[calc(13.5px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('help.introBlurb')}
          </p>
        </div>

        {departments.map((office) => (
          <section key={office.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50">
                <Building2 size={17} className="text-navy-800" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[calc(14.5px_*_var(--text-scale))] font-bold leading-snug text-navy-950">
                  {office.officeName}
                </h2>
                <p className="text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
                  {office.description}
                </p>
              </div>
            </div>

            <dl className="mt-3 space-y-2 border-t border-dashed border-slate-200 pt-3">
              {office.address && (
                <Detail icon={MapPin} label={t('help.address')}>
                  {office.address}
                </Detail>
              )}
              {office.hours && (
                <Detail icon={Clock} label={t('help.hours')}>
                  {office.hours}
                </Detail>
              )}
              {office.phone && (
                <Detail icon={Phone} label={t('help.phone')}>
                  <a
                    href={`tel:${office.phone.replace(/[^\d+]/g, '')}`}
                    className="font-medium text-navy-800 underline-offset-2 hover:underline"
                  >
                    {office.phone}
                  </a>
                </Detail>
              )}
              {office.email && (
                <Detail icon={Mail} label={t('help.email')}>
                  <a
                    href={`mailto:${office.email}`}
                    className="break-all font-medium text-navy-800 underline-offset-2 hover:underline"
                  >
                    {office.email}
                  </a>
                </Detail>
              )}
            </dl>
          </section>
        ))}

        <p className="px-1 pt-1 text-[calc(12.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
          {t('help.footer')}
        </p>
      </div>
    </div>
  )
}

function Detail({
  icon: Icon, label, children,
}: {
  icon: typeof MapPin
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <dt className="text-[calc(12px_*_var(--text-scale))] text-slate-500">{label}</dt>
        <dd className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-navy-950">{children}</dd>
      </div>
    </div>
  )
}
