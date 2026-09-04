import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useCatalogue } from '../../lib/catalogue'
import type { ResidentProgram } from '../../types'

/**
 * The resident's sectoral and poverty-reduction record, on the request the
 * office is already handling.
 *
 * Every office can read it — knowing someone is a senior citizen changes how
 * any counter treats them — but only the social welfare office and admins can
 * write, and the server enforces that independently of this panel.
 *
 * English throughout, like the rest of the staff console.
 */
export default function StaffPrograms({
  requestId, residentName,
}: {
  requestId: string
  residentName: string
}) {
  const { programs: catalogue } = useCatalogue()
  const [records, setRecords] = useState<ResidentProgram[]>([])
  const [mayEdit, setMayEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const data = await api.staffPrograms(id)
      setRecords(data.programs)
      setMayEdit(data.mayEdit)
    } catch {
      // A panel that cannot load its record shows nothing rather than a
      // half-truth; the queue itself already reported any real failure.
      setRecords([])
      setMayEdit(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(requestId) }, [requestId, load])

  const selected = catalogue.find((p) => p.code === code)
  const enrolled = new Set(records.map((r) => r.code))
  const available = catalogue.filter((p) => !enrolled.has(p.code))

  function resetForm() {
    setAdding(false)
    setCode('')
    setReferenceNo('')
    setValidUntil('')
  }

  async function grant() {
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      const { programs } = await api.staffGrantProgram(requestId, {
        code,
        ...(referenceNo.trim() ? { referenceNo: referenceNo.trim() } : {}),
        ...(validUntil ? { validUntil } : {}),
      })
      setRecords(programs)
      resetForm()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that record.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(target: string) {
    setBusy(true)
    setError(null)
    try {
      const { programs } = await api.staffRevokeProgram(requestId, target)
      setRecords(programs)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that record.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400">
        <Loader2 size={13} className="animate-spin" /> Loading programme record…
      </div>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
        Programme record
      </p>

      {records.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          {residentName || 'This resident'} is not on any municipal programme.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {records.map((record) => {
            const def = catalogue.find((p) => p.code === record.code)
            return (
              <li
                key={record.code}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                  record.expired ? 'bg-amber-50' : 'bg-slate-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-navy-950">
                    {def?.name ?? record.code}
                    {record.expired && <span className="ml-1.5 text-[11px] font-medium text-amber-800">expired</span>}
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    {record.referenceNo ? `${def?.idLabel ?? 'Ref.'} ${record.referenceNo}` : 'No reference number'}
                    {record.validUntil ? ` · valid to ${record.validUntil}` : ''}
                  </p>
                </div>
                {mayEdit && (
                  <button
                    onClick={() => void revoke(record.code)}
                    disabled={busy}
                    aria-label={`Remove ${def?.name ?? record.code}`}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {mayEdit && !adding && available.length > 0 && (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-navy-800 hover:underline"
        >
          <Plus size={13} /> Enrol in a programme
        </button>
      )}

      {mayEdit && adding && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
          <select
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setValidUntil('')
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-navy-600"
          >
            <option value="">Select a programme…</option>
            {available.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>

          {selected && (
            <>
              <label className="block">
                <span className="mb-1 block text-[11.5px] text-slate-500">
                  {selected.idLabel ?? 'Reference number (this programme issues none)'}
                </span>
                <input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  disabled={!selected.idLabel}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-navy-600 disabled:bg-slate-50"
                />
              </label>

              {/* Only offered where the register actually renews; the server
                  refuses an expiry on the programmes that do not lapse. */}
              {selected.expires && (
                <label className="block">
                  <span className="mb-1 block text-[11.5px] text-slate-500">Valid until</span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-navy-600"
                  />
                </label>
              )}

              <p className="text-[11.5px] leading-snug text-slate-500">{selected.benefit}</p>
            </>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void grant()}
              disabled={!code || busy}
              className="flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {busy && <Loader2 size={12} className="animate-spin" />} Save record
            </button>
            <button onClick={resetForm} className="px-2 text-[12px] text-slate-500 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>
      )}
    </div>
  )
}
