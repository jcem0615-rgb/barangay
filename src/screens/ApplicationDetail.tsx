import { CloudOff, Download, FileEdit, Wallet2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import StatusPill from '../components/StatusPill'
import WorkflowTracker from '../components/WorkflowTracker'
import { useAppData } from '../lib/appData'
import { useNav } from '../lib/nav'
import { useState } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { api, ApiError } from '../lib/api'
import { saveBlob } from '../lib/download'
import Attachments from '../components/Attachments'
import { resolveIcon } from '../lib/icons'
import { formatPeso } from '../lib/money'
import { useT } from '../lib/i18n'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ApplicationDetail({ id }: { id: string }) {
  const { applications } = useAppData()
  const { findCategory, findService } = useCatalogue()
  const { t } = useT()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const { push, replace } = useNav()
  const app = applications.find((a) => a.id === id)

  if (!app) {
    return (
      <div className="p-6 text-center text-slate-400">
        <TopBar title={t('detail.notFound')} />
        <p className="mt-4 text-[13px]">{t('detail.removed')}</p>
      </div>
    )
  }

  const service = findService(app.serviceId)
  const category = findCategory(app.categoryId)
  const OfficeIcon = resolveIcon(category?.icon ?? '')

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={app.serviceName} subtitle={app.isOfflineDraft ? 'Pending sync' : `Ref. ${app.referenceNo}`} />

      <div className="space-y-4 px-4 pt-4">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-[11.5px] text-slate-400">
              {app.status === 'draft' ? t('detail.lastEdited') : t('detail.submittedOn')} {formatDate(app.dateSubmitted)}
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              {service?.processingTime ?? ''}
            </p>
          </div>
          <StatusPill status={app.status} />
        </div>

        {category && (
          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
              <OfficeIcon size={19} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                {t('detail.handlingOffice')}
              </p>
              <p className="mt-0.5 text-[13.5px] font-semibold text-navy-950">{category.officeName}</p>
            </div>
          </div>
        )}

        {app.isOfflineDraft && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
            <CloudOff size={16} className="shrink-0" />
            <p className="text-[12.5px] leading-snug">
              {t('detail.offlineNotice')}
            </p>
          </div>
        )}

        {app.status === 'draft' ? (
          <button
            onClick={() => replace({ name: 'service-form', serviceId: app.serviceId, draftId: app.id })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white active:bg-navy-900"
          >
            <FileEdit size={16} /> {t('detail.continueApplication')}
          </button>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-1 text-[13px] font-bold text-navy-950">{t('detail.progress')}</p>
            <div className="mt-3">
              <WorkflowTracker currentStepIndex={app.currentStepIndex} rejected={app.status === 'rejected'} />
            </div>
          </div>
        )}

        {app.status === 'for_payment' && (
          <div className="rounded-2xl border border-gold-500/40 bg-gold-100/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy-950">{t('detail.assessedFee')}</p>
              <p className="font-display text-[17px] font-extrabold text-navy-950">{formatPeso(app.fee)}</p>
            </div>
            <p className="mt-1 text-[12px] text-navy-900/70">{t('detail.assessedBlurb')}</p>
            <button
              onClick={() => push({ name: 'payment', id: app.id })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 text-[13.5px] font-semibold text-white active:bg-navy-900"
            >
              <Wallet2 size={15} /> {t('detail.payNow')}
            </button>
          </div>
        )}

        {app.status === 'completed' && (
          <div>
            <button
              disabled={downloading}
              onClick={async () => {
                setDownloading(true)
                setDownloadError(null)
                try {
                  const { blob, fileName } = await api.document(app.id)
                  saveBlob(blob, fileName)
                } catch (err) {
                  setDownloadError(
                    err instanceof ApiError ? err.message : 'Could not download the document.'
                  )
                } finally {
                  setDownloading(false)
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-[14px] font-semibold text-white transition active:bg-emerald-700 disabled:opacity-70"
            >
              <Download size={16} /> {downloading ? t('detail.preparing') : t('detail.download')}
            </button>
            {downloadError && (
              <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
                {downloadError}
              </p>
            )}
          </div>
        )}

        {app.status !== 'draft' && service && (
          <Attachments
            requestId={app.id}
            requirements={service.requirements}
            editable={app.status !== 'completed' && app.status !== 'rejected'}
          />
        )}

        {app.status !== 'draft' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2.5 text-[13px] font-bold text-navy-950">{t('detail.submittedDetails')}</p>
            <dl className="space-y-2">
              {Object.entries(app.formValues).map(([key, val]) => (
                <div key={key} className="flex justify-between gap-3 text-[12.5px]">
                  <dt className="capitalize text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="text-right font-medium text-navy-950">{val || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
