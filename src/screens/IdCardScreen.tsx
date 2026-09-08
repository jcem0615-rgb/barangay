import { ShieldCheck, Fingerprint } from 'lucide-react'
import TopBar from '../components/TopBar'
import QrPattern from '../components/QrPattern'
import ProgramList from '../components/ProgramList'
import EmergencyContacts from '../components/EmergencyContacts'
import IdVerificationCode from '../components/IdVerificationCode'
import IdPortrait, { IdPortraitFrame } from '../components/IdPortrait'
import { useResidentPhoto } from '../lib/useResidentPhoto'
import { addressLine, useResidentProfile } from '../lib/resident'
import { useT } from '../lib/i18n'

export default function IdCardScreen() {
  const resident = useResidentProfile()
  const { t } = useT()
  const { url: photoUrl } = useResidentPhoto()
  if (!resident) return null

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('id.title')} subtitle={t('id.subtitle')} />

      <div className="px-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-navy-800 p-6 text-white shadow-lg shadow-navy-900/25">
          <div className="seal-ring pointer-events-none absolute -right-20 -top-20 h-64 w-64 opacity-90" />
          <div className="id-texture pointer-events-none absolute inset-0" />

          <div className="relative flex items-center gap-2">
            <ShieldCheck size={15} className="text-gold-400" />
            <p className="text-[calc(11.5px_*_var(--text-scale))] font-semibold uppercase tracking-[0.16em] text-gold-400">
              Republic of the Philippines &middot; eLGU Citizen Digital ID
            </p>
          </div>

          <div className="relative mt-5 flex items-center justify-center gap-4">
            <IdPortraitFrame url={photoUrl} name={resident.fullName} size={104} onDark />
            <QrPattern seed={resident.qrSeed} size={9} dim={150} dark />
          </div>

          <div className="relative mt-5 text-center">
            <p className="font-display text-[calc(20px_*_var(--text-scale))] font-bold">{resident.fullName}</p>
            <p className="mt-1 text-[calc(14px_*_var(--text-scale))] text-navy-100">{addressLine(resident.barangay, resident.municipality)}</p>
            <p className="text-[calc(13px_*_var(--text-scale))] text-navy-100/70">{resident.province}</p>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[calc(11.5px_*_var(--text-scale))] uppercase tracking-wider text-navy-100/60">{t('id.philsysNo')}</p>
              <p className="mt-0.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold tracking-wide">{resident.philSysId}</p>
            </div>
            <div>
              <p className="text-[calc(11.5px_*_var(--text-scale))] uppercase tracking-wider text-navy-100/60">{t('id.dateOfBirth')}</p>
              <p className="mt-0.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold">
                {resident.birthDate
                  ? new Date(resident.birthDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Fingerprint size={17} className="text-emerald-700" />
          </span>
          <div>
            <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-emerald-800">{t('id.verifiedTitle')}</p>
            <p className="text-[calc(12.5px_*_var(--text-scale))] leading-snug text-emerald-700/80">
              {t('id.verifiedBlurb')}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <IdVerificationCode />
        </div>

        <div className="mt-4">
          <EmergencyContacts />
        </div>

        <div className="mt-4">
          <IdPortrait name={resident.fullName} />
        </div>

        <div className="mt-4">
          <ProgramList programs={resident.programs} />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('id.registeredAddress')}</p>
          <p className="mt-1.5 text-[calc(14px_*_var(--text-scale))] leading-relaxed text-slate-600">{resident.address}</p>
          <p className="text-[calc(14px_*_var(--text-scale))] text-slate-600">{addressLine(resident.barangay, resident.municipality, resident.province)}</p>
        </div>
      </div>
    </div>
  )
}
