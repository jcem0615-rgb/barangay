import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown, ChevronUp, Loader2, MessageSquarePlus, Paperclip,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'
import type { BarangayComplaint } from '../lib/api'
import type { StringKey } from '../i18n/strings'

const STATUS_LABEL: Record<BarangayComplaint['status'], StringKey> = {
  new: 'brgyComplaint.st.new',
  acknowledged: 'brgyComplaint.st.acknowledged',
  in_progress: 'brgyComplaint.st.in_progress',
  resolved: 'brgyComplaint.st.resolved',
  closed: 'brgyComplaint.st.closed',
}

const CATEGORY_LABEL: Record<string, StringKey> = {
  garbage: 'brgyComplaint.cat.garbage',
  road: 'brgyComplaint.cat.road',
  water: 'brgyComplaint.cat.water',
  drainage: 'brgyComplaint.cat.drainage',
  streetlight: 'brgyComplaint.cat.streetlight',
  noise: 'brgyComplaint.cat.noise',
  animals: 'brgyComplaint.cat.animals',
  neighbour: 'brgyComplaint.cat.neighbour',
  peace: 'brgyComplaint.cat.peace',
  other: 'brgyComplaint.cat.other',
}

/**
 * Status in a word and a colour, never a colour alone — the rule the workflow
 * tracker and the notice board already follow. Amber for closed rather than
 * red: the barangay declining to act is not an error, and red here belongs to
 * the emergency hotlines.
 */
const STATUS_TONE: Record<BarangayComplaint['status'], string> = {
  new: 'bg-slate-100 text-slate-700',
  acknowledged: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-amber-100 text-amber-900',
}

/**
 * What the resident sent the barangay, and what the barangay did about it.
 *
 * **This screen exists because the blotter's rule does not apply here.** A
 * blotter entry is the barangay's own account of a quarrel between two people,
 * so showing it to either of them would disclose the other's side — which is
 * why no resident route reads it at all. A complaint is the resident's own
 * words, so reading it back to its author discloses nothing they do not
 * already know, and the trail of what was done with it is precisely what they
 * asked for by filing it.
 *
 * Every row here comes from `/barangay-complaints`, which is scoped to the
 * signed-in account server-side. There is no id on this screen that could
 * reach somebody else's complaint.
 */
export default function BarangayComplaints() {
  const { push } = useNav()
  const { t, locale } = useT()
  const [rows, setRows] = useState<BarangayComplaint[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, BarangayComplaint>>({})

  useEffect(() => {
    void api.myBarangayComplaints().then(
      (out) => setRows(out.complaints),
      () => setRows([])
    )
  }, [])

  /**
   * The history and the proof ride on the detail read rather than the list, so
   * a resident with a dozen complaints does not pull every trail to see the
   * one they tapped. Fetched once per complaint and kept.
   */
  const expand = useCallback(
    async (id: string) => {
      setOpen((current) => (current === id ? null : id))
      if (detail[id]) return
      try {
        const full = await api.myBarangayComplaint(id)
        setDetail((current) => ({ ...current, [id]: full }))
      } catch {
        // The row stays collapsed with what the list already had, which is
        // more useful than an error where the trail would be.
      }
    },
    [detail]
  )

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={t('brgyComplaint.mineTitle')} />

      <div className="px-4 pt-4">
        <button
          onClick={() => push({ name: 'barangay-complaint-form' })}
          className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-[calc(14px_*_var(--text-scale))] font-semibold text-white active:bg-emerald-800"
        >
          <MessageSquarePlus size={16} /> {t('brgyComplaint.navTitle')}
        </button>

        {rows === null && (
          <p className="mt-8 flex items-center justify-center gap-2 text-[calc(13px_*_var(--text-scale))] text-slate-500">
            <Loader2 size={15} className="animate-spin" /> {t('common.loading')}
          </p>
        )}

        {rows?.length === 0 && (
          <p className="mt-8 text-center text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-500">
            {t('brgyComplaint.mineEmpty')}
          </p>
        )}

        <ul className="mt-4 space-y-2.5">
          {rows?.map((row) => {
            const full = detail[row.id]
            const isOpen = open === row.id
            return (
              <li key={row.id} className="rounded-2xl border border-slate-200 bg-white">
                <button
                  onClick={() => void expand(row.id)}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-semibold ${STATUS_TONE[row.status]}`}
                      >
                        {t(STATUS_LABEL[row.status])}
                      </span>
                      <span className="text-[calc(11.5px_*_var(--text-scale))] font-semibold tracking-wide text-slate-500">
                        {row.referenceNo}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
                      {t(CATEGORY_LABEL[row.category] ?? 'brgyComplaint.cat.other')}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                      {row.details}
                    </p>
                    <p className="mt-1 text-[calc(11.5px_*_var(--text-scale))] text-slate-400">
                      {when(row.filedAt)}
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronUp size={16} className="mt-1 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="mt-1 shrink-0 text-slate-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
                    {row.location && (
                      <p className="mb-3 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
                        {row.location}
                      </p>
                    )}

                    {row.response ? (
                      <>
                        <p className="text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-400">
                          {t('brgyComplaint.responseTitle')}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[calc(13px_*_var(--text-scale))] leading-snug text-navy-950">
                          {row.response}
                        </p>
                      </>
                    ) : (
                      <p className="text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
                        {t('brgyComplaint.awaiting')}
                      </p>
                    )}

                    {full?.evidence && full.evidence.length > 0 && (
                      <p className="mt-3 flex items-center gap-1.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
                        <Paperclip size={13} className="text-slate-400" />
                        {t('brgyComplaint.proofAdded', { n: String(full.evidence.length) })}
                      </p>
                    )}

                    {full?.history && full.history.length > 0 && (
                      <>
                        <p className="mt-4 text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-400">
                          {t('brgyComplaint.historyTitle')}
                        </p>
                        <ol className="mt-2 space-y-2.5">
                          {full.history.map((step, i) => (
                            <li key={`${step.at}-${i}`} className="flex gap-2.5">
                              {/* A connector line, so the sequence reads as one. */}
                              <span className="relative mt-1 flex h-2 w-2 shrink-0">
                                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                                {i < full.history!.length - 1 && (
                                  <span className="absolute left-1/2 top-2 h-[calc(100%+0.6rem)] w-px -translate-x-1/2 bg-slate-200" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1 pb-0.5">
                                <p className="text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">
                                  {t(STATUS_LABEL[step.to])}
                                </p>
                                {step.note && (
                                  <p className="mt-0.5 whitespace-pre-wrap text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                                    {step.note}
                                  </p>
                                )}
                                <p className="mt-0.5 text-[calc(11.5px_*_var(--text-scale))] text-slate-400">
                                  {step.actorRole === 'resident'
                                    ? t('brgyComplaint.filedByYou')
                                    : step.actorName}
                                  {' · '}
                                  {when(step.at)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}

                    {row.final && (
                      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                        {t('brgyComplaint.finalNote')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
