import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, Loader2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import GuideLink from '../components/GuideLink'
import { api, ApiError } from '../lib/api'
import { formatPeso } from '../lib/money'
import { formatValidity } from '../lib/validity'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * Requesting one barangay certificate.
 *
 * Deliberately one field. A barangay clearance asks for a purpose and nothing
 * else — the rest of what goes on it is already on the resident's record — and a
 * form that asked for the name and address the office already holds would be the
 * paper form with extra steps.
 */
export default function BarangayRequestForm({ typeId }: { typeId: string }) {
  const { replace } = useNav()
  const { t } = useT()
  const [type, setType] = useState<
    {
      name: string; description: string; fee: number; purposeHint: string
      steps?: unknown[]; validityDays?: number | null
    } | null
  >(null)
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ referenceNo: string; fee: number } | null>(null)

  useEffect(() => {
    api.myBarangay()
      .then((mine) => setType(mine.certificates.find((c) => c.id === typeId) ?? null))
      .catch(() => undefined)
  }, [typeId])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await api.requestCertificate(typeId, purpose.trim())
      setDone({ referenceNo: created.referenceNo, fee: created.fee })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('brgy.requestFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[calc(19px_*_var(--text-scale))] font-extrabold text-navy-950">
          {t('brgy.sentTitle')}
        </h1>
        <p className="mt-2 max-w-xs text-[calc(14.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
          {t('brgy.sentBlurb', { ref: done.referenceNo })}
        </p>
        <p className="mt-3 max-w-xs text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
          {done.fee === 0 ? t('brgy.sentFree') : t('brgy.sentFee', { amount: formatPeso(done.fee) })}
        </p>
        <button
          onClick={() => replace({ name: 'barangay' })}
          className="mt-7 w-full max-w-xs rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
        >
          {t('common.done')}
        </button>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title={type?.name ?? t('brgy.title')} />
      <div className="px-4 pt-4">
        <div className="mb-4">
          <GuideLink certificateId={typeId} stepCount={type?.steps?.length ?? 0} />
        </div>

        {type && (
          <>
            <p className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {type.description}
            </p>
            <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-navy-800 p-4 text-white">
              <span className="text-[calc(12px_*_var(--text-scale))] uppercase tracking-wide text-navy-100/80">
                {t('brgy.fee')}
              </span>
              <span className="font-display text-[calc(22px_*_var(--text-scale))] font-extrabold">
                {type.fee === 0 ? t('brgy.free') : formatPeso(type.fee)}
              </span>
            </div>

            {/* Said before the request rather than only after it. Somebody who
                needs a clearance for something three months away should know
                that asking now may mean asking twice — and somebody whose
                certificate has no stated period should be told that, rather
                than left to read a silence as "forever". */}
            <p className="mt-2.5 flex items-start gap-1.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
              <CalendarClock size={14} className="mt-0.5 shrink-0" />
              {formatValidity(type.validityDays, t) ?? t('brgy.validNone')}
            </p>
          </>
        )}

        <label className="mt-5 block">
          <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
            {t('brgy.purposeLabel')}
          </span>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={300}
            placeholder={type?.purposeHint ?? ''}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
          />
          <span className="mt-1 block text-[calc(12px_*_var(--text-scale))] text-slate-500">
            {t('brgy.purposeHint')}
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={purpose.trim().length < 3 || busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {t('brgy.submit')}
        </button>
      </div>
    </div>
  )
}
