import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MessageSquareWarning, Send } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError, COMPLAINT_CATEGORIES, type Complaint, type ComplaintCategory } from '../lib/api'
import { useCatalogue } from '../lib/catalogue'
import { useT } from '../lib/i18n'

/**
 * Complaints, the resident's side.
 *
 * RA 11032 requires a route for this, and the point of putting it in the app
 * rather than on a form at the hall is that the resident is not standing in the
 * office they are complaining about. Every complaint gets a reference to chase
 * it by and a working-day deadline the office is measured against, both shown
 * here rather than kept internal — a deadline nobody can see is not a deadline.
 */
export default function Complaints() {
  const { t } = useT()
  const { departments } = useCatalogue()
  const [rows, setRows] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)

  const [departmentId, setDepartmentId] = useState('')
  const [category, setCategory] = useState<ComplaintCategory>('delay')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.myComplaints())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your complaints.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function file() {
    setSending(true)
    setError(null)
    try {
      await api.fileComplaint({ departmentId, category, body: body.trim() })
      setWriting(false)
      setBody('')
      setDepartmentId('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not file that.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="animate-tap-in pb-28">
      <TopBar title={t('complain.title')} subtitle={t('complain.subtitle')} />

      <div className="space-y-4 px-4 pt-4">
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[calc(13.5px_*_var(--text-scale))] text-rose-800">{error}</p>
        )}

        {writing ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block">
              <span className="text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">{t('complain.which')}</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="tap-target mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[calc(14px_*_var(--text-scale))] outline-none focus:border-navy-600"
              >
                <option value="">{t('complain.pickOffice')}</option>
                {departments.map((c) => <option key={c.id} value={c.id}>{c.officeName}</option>)}
              </select>
            </label>

            <fieldset className="mt-3">
              <legend className="text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">{t('complain.what')}</legend>
              <div className="mt-1.5 space-y-1.5">
                {COMPLAINT_CATEGORIES.map((c) => (
                  <label key={c} className="tap-target flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5">
                    <input
                      type="radio"
                      name="category"
                      checked={category === c}
                      onChange={() => setCategory(c)}
                      className="h-4 w-4"
                    />
                    <span className="text-[calc(13.5px_*_var(--text-scale))] text-navy-950">{t(`complain.cat.${c}` as 'complain.cat.delay')}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-3 block">
              <span className="text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">{t('complain.tell')}</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 4000))}
                rows={5}
                placeholder={t('complain.placeholder')}
                className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[calc(14px_*_var(--text-scale))] outline-none placeholder:text-slate-400 focus:border-navy-600"
              />
            </label>

            <div className="mt-3 flex gap-2">
              <button
                disabled={sending || !departmentId || body.trim().length < 10}
                onClick={() => void file()}
                className="tap-target flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(14.5px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-40"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t('complain.send')}
              </button>
              <button
                onClick={() => setWriting(false)}
                className="tap-target flex-1 rounded-xl border border-slate-200 text-[calc(14.5px_*_var(--text-scale))] font-medium text-slate-600"
              >
                {t('complain.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setWriting(true)}
            className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(15px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
          >
            <MessageSquareWarning size={16} /> {t('complain.file')}
          </button>
        )}

        {loading ? (
          <p className="flex items-center gap-2 py-10 text-[calc(13.5px_*_var(--text-scale))] text-slate-500">
            <Loader2 size={15} className="animate-spin" /> {t('common.loading')}
          </p>
        ) : rows.length === 0 && !writing ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-600">
            {t('complain.empty')}
          </p>
        ) : (
          rows.map((row) => <Card key={row.id} row={row} />)
        )}
      </div>
    </div>
  )
}

function Card({ row }: { row: Complaint }) {
  const { t } = useT()
  const answered = row.status === 'answered'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-[calc(13.5px_*_var(--text-scale))] font-bold tabular-nums text-navy-950">
          {row.referenceNo}
        </p>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[calc(11.5px_*_var(--text-scale))] font-bold ${
          answered ? 'bg-emerald-100 text-emerald-800' : 'bg-gold-100 text-navy-900'
        }`}>
          {answered ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {answered ? t('complain.answered') : t('complain.open')}
        </span>
      </div>
      <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
        {row.officeName} · {t(`complain.cat.${row.category}` as 'complain.cat.delay')}
      </p>

      <p className="mt-2 whitespace-pre-line text-[calc(13.5px_*_var(--text-scale))] leading-snug text-navy-950">{row.body}</p>

      {answered ? (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-3">
          <p className="text-[calc(12px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-emerald-800">
            {t('complain.reply')}
          </p>
          <p className="mt-1 whitespace-pre-line text-[calc(13.5px_*_var(--text-scale))] leading-snug text-navy-950">{row.response}</p>
        </div>
      ) : (
        <p className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
          {t('complain.dueBy', { date: row.dueOn })}
        </p>
      )}
    </div>
  )
}
