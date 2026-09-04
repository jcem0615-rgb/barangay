import { useCallback, useEffect, useState } from 'react'
import { Check, Download, Loader2, Paperclip, X } from 'lucide-react'
import { api, ApiError, type Attachment, type RequestEvent } from '../../lib/api'
import { saveBlob } from '../../lib/download'
import StaffPrograms from './StaffPrograms'
import type { Application } from '../../types'
import { WORKFLOW_STEPS } from '../../types'

type Detail = Application & { events: RequestEvent[]; residentName?: string }

export default function StaffRequestPanel({
  requestId, onChanged, onClose,
}: {
  requestId: string | null
  onChanged: () => void
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [feeInput, setFeeInput] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async (id: string) => {
    setError(null)
    try {
      const data = (await api.staffRequest(id)) as Detail
      setDetail(data)
      setFeeInput(data.fee ? String(data.fee) : '')
      setAttachments(await api.staffAttachments(id).catch(() => []))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this request.')
    }
  }, [])

  useEffect(() => {
    if (!requestId) {
      setDetail(null)
      return
    }
    void load(requestId)
  }, [requestId, load])

  async function act(fn: () => Promise<Application>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (requestId) await load(requestId)
      setNote('')
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That action did not go through.')
    } finally {
      setBusy(false)
    }
  }

  if (!requestId) {
    return (
      <aside className="hidden rounded-2xl border border-dashed border-slate-300 p-6 text-center lg:block">
        <p className="text-[13px] text-slate-400">Select a request to review it.</p>
      </aside>
    )
  }

  if (!detail) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-[13px] text-slate-400">{error ?? 'Loading…'}</p>
      </aside>
    )
  }

  const closed = detail.status === 'completed' || detail.status === 'rejected'
  const atPaymentUnpaid = detail.currentStepIndex === 2 && !detail.paid

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            {detail.referenceNo}
          </p>
          <h2 className="mt-0.5 font-display text-[15px] font-bold text-navy-950">{detail.serviceName}</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">{detail.residentName}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          <X size={17} />
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Progress</p>
          <p className="mt-1 text-[13.5px] font-semibold text-navy-950">
            {WORKFLOW_STEPS[detail.currentStepIndex] ?? '—'}
          </p>
          {detail.rejectionReason && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              {detail.rejectionReason}
            </p>
          )}
        </div>

        {detail.status === 'completed' && (
          <button
            onClick={async () => {
              try {
                const { blob, fileName } = await api.staffDocument(detail.id)
                saveBlob(blob, fileName)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not download the document.')
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-[13px] font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Download size={15} /> Released document
          </button>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Submitted files
          </p>
          {attachments.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              The resident has not attached any requirements.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  <Paperclip size={13} className="shrink-0 text-slate-400" />
                  <button
                    onClick={async () => {
                      try {
                        const { blob, fileName } = await api.staffAttachmentFile(detail.id, file.id)
                        saveBlob(blob, fileName)
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Could not open that file.')
                      }
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[12.5px] text-navy-800 underline-offset-2 hover:underline"
                  >
                    {file.fileName}
                  </button>
                  {file.requirement && (
                    <span className="shrink-0 text-[11px] text-slate-400">{file.requirement}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <StaffPrograms requestId={detail.id} residentName={detail.residentName ?? ''} />

        {Object.keys(detail.formValues).length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Submitted details
            </p>
            <dl className="space-y-1">
              {Object.entries(detail.formValues).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-[12.5px]">
                  <dt className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</dt>
                  <dd className="text-right font-medium text-navy-950">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">{error}</p>
        )}

        {!closed && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-navy-950">Assessed fee (₱)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] tabular-nums outline-none focus:border-navy-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-navy-950">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Visible in the request history"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || feeInput === ''}
                onClick={() => void act(() => api.assess(detail.id, Number(feeInput), note || undefined))}
                className="flex-1 rounded-lg bg-navy-800 px-3 py-2.5 text-[13px] font-semibold text-white transition active:bg-navy-900 disabled:opacity-50"
              >
                Set fee &amp; request payment
              </button>
              <button
                disabled={busy || atPaymentUnpaid}
                title={atPaymentUnpaid ? 'Waiting for the resident to pay' : undefined}
                onClick={() => void act(() => api.advance(detail.id, note || undefined))}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 px-3 py-2.5 text-[13px] font-semibold text-navy-800 transition hover:bg-navy-50 disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Advance
              </button>
            </div>

            <button
              disabled={busy || note.trim().length < 3}
              title={note.trim().length < 3 ? 'Write a reason in the note field first' : undefined}
              onClick={() => void act(() => api.reject(detail.id, note))}
              className="w-full rounded-lg border border-rose-200 px-3 py-2 text-[12.5px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
            >
              Reject with the note above
            </button>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">History</p>
          <ol className="space-y-2.5">
            {detail.events.map((e, i) => (
              <li key={i} className="border-l-2 border-slate-200 pl-3">
                <p className="text-[12.5px] font-medium capitalize text-navy-950">{e.eventType}</p>
                <p className="text-[11.5px] text-slate-400">
                  {new Date(e.createdAt).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                  {e.actorName ? ` · ${e.actorName}` : ''}
                </p>
                {e.note && <p className="mt-0.5 text-[12px] text-slate-500">{e.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </aside>
  )
}
