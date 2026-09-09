import { Landmark } from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * What to have with you if the office asks you to collect in person.
 *
 * The app releases a PDF, so most of the time there is nothing to collect. But
 * plenty of municipal documents still exist as paper with a dry seal on it — a
 * business permit, a cedula — and a resident who turns up without their
 * reference number, or sends a cousin with no authorisation letter, is sent
 * home and queues again another day. That trip is the expensive part of dealing
 * with an LGU, and it is worth one panel to avoid wasting it.
 *
 * Deliberately framed as a conditional. The catalogue does not record which
 * services need a counter visit, so promising one would be inventing a fact;
 * saying what to bring *if* asked is true for every service.
 */
export default function CounterChecklist({ referenceNo }: { referenceNo: string }) {
  const { t } = useT()

  const items = [
    t('counter.ref', { ref: referenceNo }),
    t('counter.id'),
    t('counter.receipt'),
    t('counter.proxy'),
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2.5">
        <Landmark size={17} className="mt-0.5 shrink-0 text-navy-800" />
        <div className="min-w-0">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('counter.title')}
          </p>
          <p className="mt-0.5 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
            {t('counter.blurb')}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy-800" />
            <span className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-navy-950">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
