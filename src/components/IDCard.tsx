import { ChevronRight } from 'lucide-react'
import type { ResidentProfile } from '../types'
import { useT } from '../lib/i18n'
import { useCatalogue } from '../lib/catalogue'
import { IdPortraitFrame } from './IdPortrait'
import { useResidentPhoto } from '../lib/useResidentPhoto'
import { addressLine } from '../lib/resident'

/**
 * Three badges fit across the card before the row starts to wrap, and the card
 * is the one deliberate flourish in this app — so the rest become a count and
 * the full list lives on the ID screen behind the tap.
 */
const BADGES_ON_CARD = 3

export default function IDCard({ profile, onTap }: { profile: ResidentProfile; onTap?: () => void }) {
  const { t, locale } = useT()
  const { findProgram } = useCatalogue()
  const { url: photoUrl } = useResidentPhoto()

  // A lapsed record is not a badge: it should not read as a live entitlement at
  // a counter. It still shows, marked as expired, on the ID screen.
  const active = profile.programs.filter((p) => !p.expired)
  const shown = active.slice(0, BADGES_ON_CARD)
  const overflow = active.length - shown.length

  return (
    <button
      onClick={onTap}
      className="group relative block w-full overflow-hidden rounded-2xl bg-navy-800 p-5 text-left shadow-lg shadow-navy-900/25 active:scale-[0.99]"
    >
      {/* signature: guilloche seal ring, echoing PH government ID security print */}
      <div className="seal-ring pointer-events-none absolute -right-16 -top-16 h-56 w-56 opacity-90" />
      <div className="id-texture pointer-events-none absolute inset-0" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IdPortraitFrame url={photoUrl} name={profile.fullName} size={52} onDark />
          <div className="min-w-0">
          <p className="text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-[0.16em] text-gold-400">
            eLGU Citizen Digital ID
          </p>
          <p className="font-display mt-1 text-[calc(19px_*_var(--text-scale))] font-bold leading-tight text-white">{profile.fullName}</p>
          <p className="mt-0.5 text-[calc(13.5px_*_var(--text-scale))] text-navy-100">{addressLine(profile.barangay, profile.municipality)}</p>
          </div>
        </div>
      </div>

      {/*
        What the card face states is what the register holds. It carried a
        national ID number and a green "verified" pill for a while, and neither
        was ever checked against anything — so a clerk read an assertion this
        app had not earned. The date of birth is a fact the register really
        does hold, and what proves the card is the code below it.
      */}
      <div className="relative mt-5">
        <p className="text-[calc(11.5px_*_var(--text-scale))] uppercase tracking-wider text-navy-100/70">{t('id.dateOfBirth')}</p>
        <p className="font-display text-[calc(14.5px_*_var(--text-scale))] font-semibold tracking-wide text-white">
          {profile.birthDate
            ? new Date(profile.birthDate).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
            : '—'}
        </p>
      </div>

      {active.length > 0 && (
        <div className="relative mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
          {shown.map((p) => (
            <span
              key={p.code}
              className="rounded-full bg-gold-500/20 px-2 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-semibold text-gold-400"
            >
              {findProgram(p.code)?.shortName ?? p.code}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[calc(11.5px_*_var(--text-scale))] font-medium text-navy-100/70">
              {t('programs.more', { count: overflow })}
            </span>
          )}
        </div>
      )}

      {onTap && (
        <ChevronRight
          size={18}
          className="absolute bottom-5 right-5 text-navy-100/50 transition-transform group-active:translate-x-0.5"
        />
      )}
    </button>
  )
}
