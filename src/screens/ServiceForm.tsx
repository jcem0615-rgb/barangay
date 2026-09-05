import { useState } from 'react'
import { CheckCircle2, ClipboardList, Loader2, Send } from 'lucide-react'
import TopBar from '../components/TopBar'
import FormField from '../components/FormField'
import OfflineBanner from '../components/OfflineBanner'
import { useCatalogue } from '../lib/catalogue'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { ApiError } from '../lib/api'
import type { Application } from '../types'
import { formatPeso } from '../lib/money'
import { useT } from '../lib/i18n'

export default function ServiceForm({ serviceId, draftId }: { serviceId: string; draftId?: string }) {
  const { replace } = useNav()
  const { submit, applications } = useAppData()
  const { findService } = useCatalogue()
  const isOnline = useOnlineStatus()
  const { t } = useT()
  const service = findService(serviceId)
  const draft = draftId ? applications.find((a) => a.id === draftId) : undefined

  const [values, setValues] = useState<Record<string, string>>(draft?.formValues ?? {})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Application | null>(null)

  if (!service) {
    return (
      <div className="p-6 text-center text-slate-500">
        <TopBar title={t('form.unavailable')} />
        <p className="mt-4 text-[calc(14px_*_var(--text-scale))]">{t('form.noLongerOffered')}</p>
      </div>
    )
  }

  const setValue = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }))
    setErrors((prev) => ({ ...prev, [id]: '' }))
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    for (const field of service.fields) {
      if (field.required && !values[field.id]?.trim()) {
        nextErrors[field.id] = t('form.required')
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // The server issues the reference number and decides the starting step;
      // offline, this lands in the outbox and syncs on reconnect.
      const created = await submit(
        { id: service.id, name: service.name, categoryId: service.categoryId, fee: service.fee },
        values
      )
      setSubmitted(created)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t('form.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24 pt-[env(safe-area-inset-top)] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[calc(19px_*_var(--text-scale))] font-extrabold text-navy-950">
          {submitted.isOfflineDraft ? 'Saved offline' : 'Application submitted'}
        </h1>
        <p className="mt-2 max-w-xs text-[calc(14.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
          {submitted.isOfflineDraft
            ? "This will be sent to the office automatically once you're back online. You can track it anytime in My Requests."
            : `Your reference number is ${submitted.referenceNo}. Track its progress anytime in My Requests.`}
        </p>
        <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5">
          <button
            onClick={() => replace({ name: 'application-detail', id: submitted.id })}
            className="rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
          >
            Track this request
          </button>
          <button
            onClick={() => replace({ name: 'services' })}
            className="rounded-xl border border-slate-200 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-navy-900 active:bg-slate-50"
          >
            Back to Services
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-tap-in pb-32">
      <TopBar title={service.name} subtitle={service.processingTime} />

      <div className="space-y-4 px-4 pt-4">
        {!isOnline && <OfflineBanner />}

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-navy-800" />
            <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('form.requirementsTitle')}</p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {service.requirements.map((req) => (
              <li key={req} className="flex gap-2 text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-800" />
                {req}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
            <span className="text-[calc(13px_*_var(--text-scale))] font-medium text-slate-500">{t('form.applicableFee')}</span>
            <span className="text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
              {service.requiresPayment ? formatPeso(service.fee) : t('form.free')}
            </span>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('form.details')}</p>
          {service.fields.map((field) => (
            <FormField
              key={field.id}
              field={field}
              value={values[field.id] ?? ''}
              onChange={(v) => setValue(field.id, v)}
              error={errors[field.id]}
            />
          ))}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[64px] mx-auto max-w-[430px] border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        {submitError && (
          <p role="alert" className="mb-2.5 rounded-lg bg-rose-50 px-3 py-2 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
            {submitError}
          </p>
        )}
        <div className="flex gap-2.5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy-800 py-3 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t('form.submitting')}
              </>
            ) : (
              <>
                <Send size={15} /> {isOnline ? t('form.submit') : t('form.submitOffline')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
