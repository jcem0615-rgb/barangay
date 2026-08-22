import { useState } from 'react'
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import TopBar from '../components/TopBar'
import { useAppData } from '../lib/appData'
import { useNav } from '../lib/nav'
import type { Application } from '../types'

type Method = 'GCash' | 'Maya' | 'Landbank Online'

const METHODS: { id: Method; label: string; blurb: string; bg: string; fg: string }[] = [
  { id: 'GCash', label: 'GCash', blurb: 'Pay using your GCash wallet balance', bg: 'bg-[#0072ce]', fg: 'text-white' },
  { id: 'Maya', label: 'Maya', blurb: 'Pay using your Maya wallet or linked card', bg: 'bg-[#00d13b]', fg: 'text-navy-950' },
  { id: 'Landbank Online', label: 'Landbank Online', blurb: 'Pay via Landbank iAccess / online banking', bg: 'bg-[#00703c]', fg: 'text-white' },
]

export default function PaymentScreen({ id }: { id: string }) {
  const { applications, upsert } = useAppData()
  const { replace } = useNav()
  const app = applications.find((a) => a.id === id)

  const [selected, setSelected] = useState<Method | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select')

  if (!app) return null

  const handlePay = async () => {
    if (!selected) return
    setStep('processing')
    await new Promise((r) => setTimeout(r, 1400))
    const updated: Application = {
      ...app,
      paid: true,
      paymentMethod: selected,
      status: 'in-progress',
      currentStepIndex: 4,
    }
    await upsert(updated)
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[19px] font-extrabold text-navy-950">Payment successful</h1>
        <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-slate-500">
          ₱{app.fee.toLocaleString()} paid via {selected}. Your document is now being prepared for release.
        </p>
        <button
          onClick={() => replace({ name: 'application-detail', id: app.id })}
          className="mt-7 w-full max-w-xs rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white active:bg-navy-900"
        >
          Back to request
        </button>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title="Pay Assessed Fee" subtitle={app.serviceName} />

      <div className="px-4 pt-4">
        <div className="rounded-2xl bg-navy-800 p-5 text-white">
          <p className="text-[11px] uppercase tracking-wide text-navy-100/80">Amount due</p>
          <p className="font-display mt-1 text-[26px] font-extrabold">₱{app.fee.toLocaleString()}</p>
          <p className="mt-1 text-[12px] text-navy-100/70">Ref. {app.referenceNo}</p>
        </div>

        {step === 'select' && (
          <>
            <p className="mb-3 mt-5 text-[13px] font-bold text-navy-950">Choose a payment method</p>
            <div className="space-y-2.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m.id)
                    setStep('confirm')
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
                >
                  <span className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold ${m.bg} ${m.fg}`}>
                    {m.id === 'GCash' ? 'GCash' : m.id === 'Maya' ? 'maya' : 'LBP'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-navy-950">{m.label}</span>
                    <span className="block text-[11.5px] text-slate-500">{m.blurb}</span>
                  </span>
                  <ChevronRight size={17} className="text-slate-300" />
                </button>
              ))}
            </div>
          </>
        )}

        {(step === 'confirm' || step === 'processing') && selected && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-center text-[13px] font-semibold text-slate-500">Confirm payment with</p>
            <p className="font-display mt-1 text-center text-[18px] font-extrabold text-navy-950">{selected}</p>

            <div className="mt-5 space-y-2.5 border-y border-dashed border-slate-200 py-4">
              <div className="flex justify-between text-[12.5px]">
                <span className="text-slate-500">Service</span>
                <span className="font-medium text-navy-950">{app.serviceName}</span>
              </div>
              <div className="flex justify-between text-[12.5px]">
                <span className="text-slate-500">Reference No.</span>
                <span className="font-medium text-navy-950">{app.referenceNo}</span>
              </div>
              <div className="flex justify-between text-[13.5px] font-bold">
                <span className="text-navy-950">Total</span>
                <span className="text-navy-950">₱{app.fee.toLocaleString()}</span>
              </div>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck size={13} /> Simulated secure checkout — no real transaction is made
            </p>

            <button
              onClick={handlePay}
              disabled={step === 'processing'}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
            >
              {step === 'processing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Processing payment…
                </>
              ) : (
                `Confirm & Pay ₱${app.fee.toLocaleString()}`
              )}
            </button>
            {step === 'confirm' && (
              <button onClick={() => setStep('select')} className="mt-2 w-full py-2 text-[12.5px] font-semibold text-slate-500">
                Choose a different method
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
