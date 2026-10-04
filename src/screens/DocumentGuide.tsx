import { useEffect, useState } from 'react'
import { ArrowRight, Check, CircleHelp, Landmark, Phone, Building } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { formatPeso } from '../lib/money'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import type { ServiceStep } from '../types'

/**
 * How to get one document, in order.
 *
 * The catalogue has always listed what a service requires. A flat checklist
 * answers "what do I bring" and leaves the expensive question — *which of these
 * do I get first, and who issues it* — to be discovered at a counter. Somebody
 * who turns up for a business permit without the barangay clearance is sent
 * away, and that trip is the single most expensive thing about dealing with an
 * LGU.
 *
 * So this is the chain, numbered, each step naming who issues it. A step this
 * app can issue itself is a button rather than a sentence, which is the whole
 * payoff of having both tiers in one place: "Barangay Business Clearance" stops
 * being a thing to go and find out about and becomes the next tap.
 */
export default function DocumentGuide({
  serviceId, certificateId,
}: { serviceId?: string; certificateId?: string }) {
  const { push, replace } = useNav()
  const { t } = useT()
  const { services, findCategory } = useCatalogue()
  const [certificates, setCertificates] = useState<
    Array<{ id: string; name: string; fee: number; steps: ServiceStep[] }>
  >([])

  // Public, and fetched whether or not this is a barangay document: a municipal
  // guide can point at a barangay certificate, and the step has to be able to
  // name it.
  useEffect(() => {
    api.barangayCertificates().then(setCertificates).catch(() => undefined)
  }, [])

  const service = services.find((s) => s.id === serviceId)
  const certificate = certificates.find((c) => c.id === certificateId)

  const title = service?.name ?? certificate?.name ?? t('guide.title')
  const steps = service?.steps ?? certificate?.steps ?? []
  const office = service ? findCategory(service.categoryId) : undefined

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title={title} subtitle={t('guide.subtitle')} />

      <div className="px-4 pt-4">
        {steps.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
            {t('guide.none')}
          </p>
        ) : (
          <ol className="relative">
            {steps.map((step, index) => {
              const last = index === steps.length - 1
              const target = step.serviceId
                ? () => replace({ name: 'service-guide', serviceId: step.serviceId })
                : step.certificateId
                  ? () => replace({ name: 'service-guide', certificateId: step.certificateId })
                  : null

              return (
                <li key={`${step.label}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                  {/*
                    The connector is what makes this read as a chain rather than
                    a list. It stops at the last node, so the end of the route is
                    visible as an end.
                  */}
                  {!last && (
                    <span
                      aria-hidden
                      className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 rounded bg-slate-200"
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[calc(13px_*_var(--text-scale))] font-bold ${
                      last ? 'bg-navy-800 text-white' : 'bg-white text-navy-800 ring-2 ring-slate-200'
                    }`}
                  >
                    {last ? <Check size={16} strokeWidth={3} /> : index + 1}
                  </span>

                  <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-3.5">
                    {/* A conditional step says so before it says what it is, so
                        nobody chases a document they never needed. */}
                    {step.onlyIf && (
                      <p className="mb-1 inline-block rounded-full bg-gold-100 px-2 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-bold uppercase tracking-wide text-gold-600">
                        {t('guide.onlyIf', { condition: step.onlyIf })}
                      </p>
                    )}
                    <p className="text-[calc(14px_*_var(--text-scale))] font-bold leading-snug text-navy-950">
                      {step.label}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
                      <Landmark size={12} className="shrink-0" /> {step.where}
                    </p>
                    {step.note && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                        {step.note}
                      </p>
                    )}
                    {target && (
                      <button
                        onClick={target}
                        className="tap-target mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 text-left text-[calc(13px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-navy-100"
                      >
                        {step.certificateId ? (
                          <span className="flex items-center gap-1.5">
                            <Building size={14} /> {t('guide.howToGetBarangay')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Landmark size={14} /> {t('guide.howToGet')}
                          </span>
                        )}
                        <ArrowRight size={15} className="shrink-0" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {/* What it costs and how long, at the end, because that is the question
            somebody asks once they know they can actually do it. */}
        {(service || certificate) && (
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
              <dt className="text-[calc(11.5px_*_var(--text-scale))] uppercase tracking-wide text-slate-500">
                {t('guide.fee')}
              </dt>
              <dd className="font-display mt-0.5 text-[calc(17px_*_var(--text-scale))] font-extrabold text-navy-950">
                {(service?.fee ?? certificate?.fee ?? 0) === 0
                  ? t('brgy.free')
                  : formatPeso(service?.fee ?? certificate?.fee ?? 0)}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
              <dt className="text-[calc(11.5px_*_var(--text-scale))] uppercase tracking-wide text-slate-500">
                {t('guide.takes')}
              </dt>
              <dd className="font-display mt-0.5 text-[calc(15px_*_var(--text-scale))] font-extrabold leading-tight text-navy-950">
                {service?.processingTime ?? t('guide.sameDay')}
              </dd>
            </div>
          </dl>
        )}

        <button
          onClick={() =>
            service
              ? replace({ name: 'service-form', serviceId: service.id })
              : replace({ name: 'barangay-request', typeId: certificateId! })
          }
          className="mt-4 w-full rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          {t('guide.start')}
        </button>

        {/*
          The list above is the municipality's reading of its own process, and a
          process changes without telling an app. Ringing the office costs a
          minute; the trip this is meant to save costs a morning — so the number
          is here rather than a disclaimer telling somebody to go and find it.
        */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex items-start gap-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
            <CircleHelp size={14} className="mt-0.5 shrink-0 text-slate-400" />
            {t('guide.confirm')}
          </p>
          {office?.phone && (
            <a
              href={`tel:${office.phone.replace(/[^+\d]/g, '')}`}
              className="tap-target mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-navy-50 px-3.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-navy-100"
            >
              <span className="min-w-0 truncate">{office.officeName}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Phone size={14} /> {office.phone}
              </span>
            </a>
          )}
          {!office?.phone && (
            <button
              onClick={() => push({ name: 'emergency' })}
              className="tap-target mt-2.5 flex w-full items-center gap-2 rounded-xl bg-navy-50 px-3.5 text-left text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-navy-100"
            >
              <Phone size={14} /> {t('guide.allNumbers')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
