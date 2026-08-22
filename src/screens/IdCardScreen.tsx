import { ShieldCheck, Fingerprint } from 'lucide-react'
import TopBar from '../components/TopBar'
import QrPattern from '../components/QrPattern'
import { RESIDENT } from '../data/mockData'

export default function IdCardScreen() {
  return (
    <div className="animate-tap-in pb-10">
      <TopBar title="Digital ID" subtitle="Present this for verification" />

      <div className="px-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-navy-800 p-6 text-white shadow-lg shadow-navy-900/25">
          <div className="seal-ring pointer-events-none absolute -right-20 -top-20 h-64 w-64 opacity-90" />
          <div className="id-texture pointer-events-none absolute inset-0" />

          <div className="relative flex items-center gap-2">
            <ShieldCheck size={15} className="text-gold-400" />
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-400">
              Republic of the Philippines &middot; eLGU Citizen Digital ID
            </p>
          </div>

          <div className="relative mt-5 flex justify-center">
            <QrPattern seed={RESIDENT.qrSeed} size={11} dim={190} dark />
          </div>

          <div className="relative mt-5 text-center">
            <p className="font-display text-[20px] font-bold">{RESIDENT.fullName}</p>
            <p className="mt-1 text-[13px] text-navy-100">{RESIDENT.barangay}, {RESIDENT.city}</p>
            <p className="text-[12px] text-navy-100/70">{RESIDENT.province}</p>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-100/60">PhilSys ID No.</p>
              <p className="mt-0.5 text-[12.5px] font-semibold tracking-wide">{RESIDENT.philSysId}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-100/60">Date of Birth</p>
              <p className="mt-0.5 text-[12.5px] font-semibold">
                {new Date(RESIDENT.birthDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Fingerprint size={17} className="text-emerald-700" />
          </span>
          <div>
            <p className="text-[13px] font-bold text-emerald-800">PhilSys verified identity</p>
            <p className="text-[11.5px] leading-snug text-emerald-700/80">
              Synced with the Philippine Identification System. This QR refreshes automatically for secure, one-time verification at LGU counters.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[13px] font-bold text-navy-950">Registered address</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{RESIDENT.address}</p>
          <p className="text-[13px] text-slate-600">{RESIDENT.barangay}, {RESIDENT.city}, {RESIDENT.province}</p>
        </div>
      </div>
    </div>
  )
}
