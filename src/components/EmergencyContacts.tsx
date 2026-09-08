import { Phone, ShieldAlert } from 'lucide-react'
import { useCatalogue } from '../lib/catalogue'
import { useT } from '../lib/i18n'
import { useOnlineStatus } from '../lib/useOnlineStatus'

/**
 * The numbers to ring when something goes wrong.
 *
 * Every row is a real `tel:` link, so this is one tap from a call rather than a
 * list of digits to memorise while something is on fire. Municipal numbers come
 * first because they answer fastest locally; the nationwide ones are grouped
 * below so a resident can see what still answers if the municipal line is down.
 *
 * The catalogue is cached on the device, so this list is readable with no
 * signal — which is when it is most likely to be needed.
 */
export default function EmergencyContacts() {
  const { emergencyContacts } = useCatalogue()
  const isOnline = useOnlineStatus()
  const { t } = useT()

  if (emergencyContacts.length === 0) return null

  const municipal = emergencyContacts.filter((c) => !c.isNational)
  const national = emergencyContacts.filter((c) => c.isNational)

  return (
    <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white">
      <div className="flex items-start gap-2.5 border-b border-rose-100 bg-rose-50 p-4">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-rose-600" />
        <div>
          <h2 className="text-[calc(14px_*_var(--text-scale))] font-bold text-rose-900">
            {t('sos.title')}
          </h2>
          <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-800">
            {isOnline ? t('sos.blurb') : t('sos.offlineBlurb')}
          </p>
        </div>
      </div>

      <Group contacts={municipal} heading={t('sos.municipal')} />
      <Group contacts={national} heading={t('sos.national')} />
    </section>
  )
}

function Group({
  contacts, heading,
}: {
  contacts: Array<{ id: string; label: string; agency: string; phone: string }>
  heading: string
}) {
  const { t } = useT()
  if (contacts.length === 0) return null

  return (
    <div className="border-b border-slate-100 last:border-0">
      <p className="px-4 pt-3 text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </p>
      <ul>
        {contacts.map((contact) => (
          <li key={contact.id}>
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
              aria-label={t('sos.call', { agency: contact.agency, phone: contact.phone })}
              className="tap-target flex items-center gap-3 px-4 py-3 active:bg-rose-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <Phone size={15} className="text-rose-700" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
                  {contact.label}
                </span>
                <span className="block text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                  {contact.agency}
                </span>
              </span>
              <span className="shrink-0 font-display text-[calc(15px_*_var(--text-scale))] font-extrabold tabular-nums text-rose-700">
                {contact.phone}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
