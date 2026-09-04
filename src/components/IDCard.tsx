import { ShieldCheck, ChevronRight } from 'lucide-react'
import type { ResidentProfile } from '../types'
import QrPattern from './QrPattern'
import { useT } from '../lib/i18n'
import { useCatalogue } from '../lib/catalogue'

/**
 * Three badges fit across the card before the row starts to wrap, and the card
 * is the one deliberate flourish in this app — so the rest become a count and
 * the full list lives on the ID screen behind the tap.
 */
const BADGES_ON_CARD = 3

export default function IDCard({ profile, onTap }: { profile: ResidentProfile; onTap?: () => void }) {
  const { t } = useT()
  const { findProgram } = useCatalogue()

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

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-400">
            eLGU Citizen Digital ID
          </p>
          <p className="font-display mt-1 text-[19px] font-bold leading-tight text-white">{profile.fullName}</p>
          <p className="mt-0.5 text-[12.5px] text-navy-100">{profile.barangay}, {profile.municipality}</p>
        </div>
        <QrPattern seed={profile.qrSeed} size={9} dim={54} dark />
      </div>

      <div className="relative mt-5 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-100/70">{t('id.philsysNo')}</p>
          <p className="font-display text-[13.5px] font-semibold tracking-wide text-white">{profile.philSysId}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-300">
            {profile.philSysSynced ? t('id.synced') : t('id.notSynced')}
          </span>
        </div>
      </div>

      {active.length > 0 && (
        <div className="relative mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
          {shown.map((p) => (
            <span
              key={p.code}
              className="rounded-full bg-gold-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-gold-400"
            >
              {findProgram(p.code)?.shortName ?? p.code}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10.5px] font-medium text-navy-100/70">
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
