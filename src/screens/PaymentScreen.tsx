import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import TopBar from '../components/TopBar'
import { useAppData } from '../lib/appData'
import { useNav } from '../lib/nav'
import { api, ApiError, IS_DEMO } from '../lib/api'
import { formatPeso } from '../lib/money'
import { useT } from '../lib/i18n'
import type { StringKey } from '../i18n/strings'

type Method = 'GCash' | 'Maya' | 'Landbank Online'

const METHODS: { id: Method; label: string; blurb: StringKey; bg: string; fg: string }[] = [
  { id: 'GCash', label: 'GCash', blurb: 'pay.gcashBlurb', bg: 'bg-[#0072ce]', fg: 'text-white' },
  { id: 'Maya', label: 'Maya', blurb: 'pay.mayaBlurb', bg: 'bg-[#00d13b]', fg: 'text-navy-950' },
  { id: 'Landbank Online', label: 'Landbank Online', blurb: 'pay.landbankBlurb', bg: 'bg-[#00703c]', fg: 'text-white' },
]

export default function PaymentScreen({ id }: { id: string }) {
  const { applications, startPayment, refresh } = useAppData()
  const { replace } = useNav()
  const app = applications.find((a) => a.id === id)

  const [selected, setSelected] = useState<Method | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select')
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const { t } = useT()

  // Polling, rather than trusting our own return from the provider. The
  // server's record is the only thing that decides whether money arrived: a
  // resident who closed the tab at the gateway is still paid up, and one who
  // forges the return trip is not.
  const settled = useRef(false)
  useEffect(() => {
    if (!reference || step !== 'processing') return
    let live = true
    const tick = async () => {
      try {
        const state = await api.paymentStatus(reference)
        if (!live) return
        if (state.status === 'settled') {
          settled.current = true
          await refresh()
          if (live) setStep('done')
        } else if (state.status === 'failed' || state.status === 'mismatched') {
          setError(state.note ?? t('pay.failed'))
          setStep('confirm')
        }
      } catch {
        // A dropped poll is not a failed payment. Keep asking.
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), 1500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [reference, step, refresh, t])

  const handlePay = useCallback(async () => {
    if (!selected || !app) return
    setStep('processing')
    setError(null)
    try {
      const intent = await startPayment(app.id)
      setReference(intent.reference)
      // Where a real gateway takes over. The development provider has no page
      // to show, so the app asks it to send the callback a real one would —
      // which the server still has to verify before anything is settled.
      if (IS_DEMO || intent.provider === 'mock') {
        await api.mockCompletePayment(intent.reference, selected)
      } else {
        window.location.assign(intent.redirectUrl)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('pay.failed'))
      setStep('confirm')
    }
  }, [app, selected, startPayment, t])

  if (!app) return null

  if (step === 'done') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[calc(19px_*_var(--text-scale))] font-extrabold text-navy-950">{t('pay.successTitle')}</h1>
        <p className="mt-2 max-w-xs text-[calc(14.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
          {t('pay.successBlurb', { amount: formatPeso(app.fee), method: selected ?? '' })}
        </p>
        <button
          onClick={() => replace({ name: 'application-detail', id: app.id })}
          className="mt-7 w-full max-w-xs rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          {t('pay.backToRequest')}
        </button>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('pay.title')} subtitle={app.serviceName} />

      <div className="px-4 pt-4">
        <div className="rounded-2xl bg-navy-800 p-5 text-white">
          <p className="text-[calc(12px_*_var(--text-scale))] uppercase tracking-wide text-navy-100/80">{t('pay.amount')}</p>
          <p className="font-display mt-1 text-[calc(26px_*_var(--text-scale))] font-extrabold">{formatPeso(app.fee)}</p>
          <p className="mt-1 text-[calc(13px_*_var(--text-scale))] text-navy-100/70">{t('pay.refShort', { ref: app.referenceNo })}</p>
        </div>

        {step === 'select' && (
          <>
            <p className="mb-3 mt-5 text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('pay.choose')}</p>
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
                  <span className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-lg text-[calc(12px_*_var(--text-scale))] font-extrabold ${m.bg} ${m.fg}`}>
                    {m.id === 'GCash' ? 'GCash' : m.id === 'Maya' ? 'maya' : 'LBP'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">{m.label}</span>
                    <span className="block text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{t(m.blurb)}</span>
                  </span>
                  <ChevronRight size={17} className="text-slate-300" />
                </button>
              ))}
            </div>
          </>
        )}

        {(step === 'confirm' || step === 'processing') && selected && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-center text-[calc(14px_*_var(--text-scale))] font-semibold text-slate-500">{t('pay.confirmWith')}</p>
            <p className="font-display mt-1 text-center text-[calc(18px_*_var(--text-scale))] font-extrabold text-navy-950">{selected}</p>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-center text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-5 space-y-2.5 border-y border-dashed border-slate-200 py-4">
              <div className="flex justify-between text-[calc(13.5px_*_var(--text-scale))]">
                <span className="text-slate-500">{t('pay.service')}</span>
                <span className="font-medium text-navy-950">{app.serviceName}</span>
              </div>
              <div className="flex justify-between text-[calc(13.5px_*_var(--text-scale))]">
                <span className="text-slate-500">{t('pay.reference')}</span>
                <span className="font-medium text-navy-950">{app.referenceNo}</span>
              </div>
              <div className="flex justify-between text-[calc(14.5px_*_var(--text-scale))] font-bold">
                <span className="text-navy-950">{t('pay.total')}</span>
                <span className="text-navy-950">{formatPeso(app.fee)}</span>
              </div>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[calc(12px_*_var(--text-scale))] text-slate-500">
              <ShieldCheck size={13} /> {t('pay.simulated')}
            </p>

            <button
              onClick={handlePay}
              disabled={step === 'processing'}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
            >
              {step === 'processing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {t('pay.waiting')}
                </>
              ) : (
                `${t('pay.confirmAndPay')} ${formatPeso(app.fee)}`
              )}
            </button>
            {step === 'confirm' && (
              <button onClick={() => setStep('select')} className="mt-2 w-full py-2 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-slate-500">
                Choose a different method
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
