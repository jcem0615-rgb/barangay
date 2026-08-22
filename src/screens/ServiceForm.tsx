import { useState } from 'react'
import { CheckCircle2, ClipboardList, Loader2, Send, FileDown } from 'lucide-react'
import TopBar from '../components/TopBar'
import FormField from '../components/FormField'
import OfflineBanner from '../components/OfflineBanner'
import { SERVICES } from '../data/mockData'
import { useNav } from '../lib/nav'
import { useAppData } from '../lib/appData'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import type { Application } from '../types'

function makeReferenceNo(prefix: string) {
  const n = Math.floor(1000 + Math.random() * 8999)
  return `${prefix}-2026-${n.toString().padStart(5, '0')}`
}

const CATEGORY_PREFIX: Record<string, string> = {
  bpls: 'BOSS',
  cswdo: 'CSWDO',
  lcr: 'LCR',
}

export default function ServiceForm({ serviceId, draftId }: { serviceId: string; draftId?: string }) {
  const { replace } = useNav()
  const { upsert, applications } = useAppData()
  const isOnline = useOnlineStatus()
  const service = SERVICES.find((s) => s.id === serviceId)!
  const draft = draftId ? applications.find((a) => a.id === draftId) : undefined

  const [values, setValues] = useState<Record<string, string>>(draft?.formValues ?? {})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<Application | null>(null)

  const setValue = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }))
    setErrors((prev) => ({ ...prev, [id]: '' }))
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    for (const field of service.fields) {
      if (field.required && !values[field.id]?.trim()) {
        nextErrors[field.id] = 'This field is required.'
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)

    const app: Application = {
      id: draft?.id ?? `app-${Date.now()}`,
      referenceNo: draft?.referenceNo && draft.referenceNo !== '—' ? draft.referenceNo : makeReferenceNo(CATEGORY_PREFIX[service.categoryId] ?? 'LGU'),
      serviceId: service.id,
      serviceName: service.name,
      categoryId: service.categoryId,
      dateSubmitted: new Date().toISOString(),
      currentStepIndex: 0,
      status: 'in-progress',
      fee: service.fee,
      paid: false,
      formValues: values,
      isOfflineDraft: !isOnline,
    }

    // Simulate network round-trip
    await new Promise((r) => setTimeout(r, 700))
    await upsert(app)
    setSubmitting(false)
    setSubmitted(app)
  }

  const handleSaveDraft = async () => {
    const app: Application = {
      id: draft?.id ?? `draft-${Date.now()}`,
      referenceNo: '—',
      serviceId: service.id,
      serviceName: service.name,
      categoryId: service.categoryId,
      dateSubmitted: new Date().toISOString(),
      currentStepIndex: 0,
      status: 'draft',
      fee: service.fee,
      paid: false,
      formValues: values,
      isOfflineDraft: !isOnline,
    }
    await upsert(app)
    replace({ name: 'applications' })
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24 pt-[env(safe-area-inset-top)] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="font-display mt-5 text-[19px] font-extrabold text-navy-950">
          {submitted.isOfflineDraft ? 'Saved offline' : 'Application submitted'}
        </h1>
        <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-slate-500">
          {submitted.isOfflineDraft
            ? "This will be sent to the office automatically once you're back online. You can track it anytime in My Requests."
            : `Your reference number is ${submitted.referenceNo}. Track its progress anytime in My Requests.`}
        </p>
        <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5">
          <button
            onClick={() => replace({ name: 'application-detail', id: submitted.id })}
            className="rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white active:bg-navy-900"
          >
            Track this request
          </button>
          <button
            onClick={() => replace({ name: 'services' })}
            className="rounded-xl border border-slate-200 py-3.5 text-[14px] font-semibold text-navy-900 active:bg-slate-50"
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
            <p className="text-[13px] font-bold text-navy-950">Requirements to prepare</p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {service.requirements.map((req) => (
              <li key={req} className="flex gap-2 text-[12.5px] leading-snug text-slate-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-800" />
                {req}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
            <span className="text-[12px] font-medium text-slate-500">Applicable fee</span>
            <span className="text-[13.5px] font-bold text-navy-950">
              {service.requiresPayment ? `₱${service.fee.toLocaleString()}` : 'Free of charge'}
            </span>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[13px] font-bold text-navy-950">Application details</p>
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
        <div className="flex gap-2.5">
          <button
            onClick={handleSaveDraft}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-3 text-[13px] font-semibold text-navy-900 active:bg-slate-50"
          >
            <FileDown size={15} /> Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy-800 py-3 text-[14px] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Send size={15} /> {isOnline ? 'Submit Application' : 'Save Offline & Queue'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
