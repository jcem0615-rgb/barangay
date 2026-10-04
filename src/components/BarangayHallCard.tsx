import { Clock, MapPin, Phone, UserRound } from 'lucide-react'
import type { BarangayOffice } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * The barangay hall, as a resident needs it.
 *
 * This exists because of one status. "For pickup" is the only thing in the
 * barangay tier that asks somebody to travel, and for a long time the only
 * information attached to it was the barangay's name — no hours, no address, no
 * number to ring first. The wasted trip is the expensive part of dealing with an
 * LGU, and being told to collect something from an office that shut at noon is
 * exactly how one happens.
 *
 * The phone is a real `tel:` link with a phone icon, like the emergency
 * hotlines, because ringing to check costs a minute and the trip costs a
 * morning. And it says to ring first: a barangay hall closes for an assembly or
 * a relief distribution without that reaching any app.
 *
 * A field the barangay has not filled in reads as "not stated" rather than as a
 * blank line pretending to be an address. Inventing confident-looking emptiness
 * is the same failure as a hotline that rings nowhere.
 */
export default function BarangayHallCard({ office }: { office: BarangayOffice }) {
  const { t } = useT()
  const notStated = t('brgy.hallNotStated')

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-[calc(13px_*_var(--text-scale))] font-bold uppercase tracking-wide text-slate-500">
        {t('brgy.hall')}
      </h2>

      <dl className="mt-3 space-y-3">
        <Row icon={<MapPin size={14} />} label={t('brgy.hallWhere')} value={office.hallAddress ?? notStated} />
        <Row icon={<Clock size={14} />} label={t('brgy.hallHours')} value={office.officeHours ?? notStated} />
        {office.captain && (
          <Row icon={<UserRound size={14} />} label={t('brgy.hallCaptain')} value={office.captain} />
        )}
        {office.secretary && (
          <Row icon={<UserRound size={14} />} label={t('brgy.hallSecretary')} value={office.secretary} />
        )}
      </dl>

      {office.phone && (
        <a
          href={`tel:${office.phone.replace(/[^\d+]/g, '')}`}
          className="tap-target mt-3.5 flex items-center justify-center gap-2 rounded-xl bg-navy-800 px-4 text-[calc(14px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          <Phone size={15} /> {t('brgy.hallCall')} · {office.phone}
        </a>
      )}

      <p className="mt-2.5 text-[calc(12px_*_var(--text-scale))] leading-snug text-slate-500">
        {t('brgy.hallRingFirst')}
      </p>
    </section>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </dt>
        <dd className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-navy-950">{value}</dd>
      </div>
    </div>
  )
}
