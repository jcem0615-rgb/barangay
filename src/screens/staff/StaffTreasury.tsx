import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Wallet, Receipt } from 'lucide-react'
import { api, ApiError, type FeeChange } from '../../lib/api'
import { formatPeso } from '../../lib/money'

/**
 * The treasurer's book.
 *
 * This screen exists for reconciliation, so it is built around the two things
 * that job needs: the total, and a way to find *this* row from *that* line on a
 * bank statement. Every line carries the gateway's own reference for exactly
 * that reason.
 *
 * Anything that did not end cleanly is listed separately and is deliberately not
 * limited to the chosen period — a payment stuck since last week is precisely
 * what a daily reconciliation exists to surface, and it would not appear in a
 * window that starts this morning.
 */

const today = () => new Date().toISOString().slice(0, 10)

export default function StaffTreasury() {
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [book, setBook] = useState<Awaited<ReturnType<typeof api.paymentsBook>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setBook(await api.paymentsBook(from, to))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the payment book.')
      setBook(null)
    } finally {
      setBusy(false)
    }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] text-navy-950"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] text-navy-950"
          />
        </label>
        {busy && <Loader2 size={16} className="mb-2.5 animate-spin text-slate-400" />}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-700">{error}</p>
      )}

      {book && (
        <>
          {/* The total leads, because it is the figure being reconciled. */}
          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-2xl bg-navy-800 p-5 text-white">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-navy-100/80">Settled in this period</p>
              <p className="font-display mt-1 text-[28px] font-extrabold">{formatPeso(book.total)}</p>
            </div>
            <p className="text-[13.5px] text-navy-100/80">
              {book.count} payment{book.count === 1 ? '' : 's'}
            </p>
          </div>

          {book.settled.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-[13.5px] text-slate-500">
              Nothing settled in this period.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="border-b border-slate-200 text-[12px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Settled</th>
                    <th className="px-4 py-2.5 font-semibold">Request</th>
                    <th className="px-4 py-2.5 font-semibold">Service</th>
                    <th className="px-4 py-2.5 font-semibold">Method</th>
                    <th className="px-4 py-2.5 font-semibold">Gateway reference</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {book.settled.map((row) => (
                    <tr key={row.reference} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {new Date(row.settledAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-navy-950">{row.requestRef}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.serviceName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.method ?? '—'}</td>
                      {/* What somebody working down a bank statement has. */}
                      <td className="px-4 py-2.5 font-mono text-[12px] text-slate-600">
                        {row.providerRef ?? row.reference}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-navy-950">{formatPeso(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {book.unsettled.length > 0 && (
            <div className="mt-6">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-navy-950">
                <AlertTriangle size={16} className="text-amber-600" /> Needs a person
              </h2>
              <p className="mt-1 text-[12.5px] text-slate-500">
                Not limited to the period above — a payment stuck since last week is exactly
                what this list is for. A mismatched amount is never settled automatically:
                paying it either short-changes the municipality or overcharges the resident.
              </p>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/50">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-amber-200 text-[12px] uppercase tracking-wide text-amber-800">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Started</th>
                      <th className="px-4 py-2.5 font-semibold">Request</th>
                      <th className="px-4 py-2.5 font-semibold">State</th>
                      <th className="px-4 py-2.5 font-semibold">Gateway reference</th>
                      <th className="px-4 py-2.5 font-semibold">What happened</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Assessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.unsettled.map((row) => (
                      <tr key={row.reference} className="border-b border-amber-100 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-navy-950">{row.requestRef}</td>
                        <td className="px-4 py-2.5 font-semibold text-amber-800">{row.status}</td>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-slate-600">
                          {row.providerRef ?? row.reference}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{row.note ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-navy-950">{formatPeso(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!book && !busy && !error && (
        <p className="mt-5 flex items-center gap-2 text-[13.5px] text-slate-500">
          <Wallet size={15} /> Choose a period.
        </p>
      )}
    </div>
  )
}


/**
 * What changed about money, for the office that collects it.
 *
 * The treasury reconciles against fees it did not set: the municipal
 * administrator defines the shared certificate catalogue and each barangay
 * overrides what it charges. Both already write the change, the old value and
 * who made it to the audit trail in the same transaction, so this is a read of
 * that rather than a second record of the same fact that could disagree with
 * the first.
 *
 * It sits under the payment book because it answers the question the book
 * raises: a figure that does not reconcile is usually a fee that moved.
 */
export function FeeChanges() {
  const [rows, setRows] = useState<FeeChange[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.feeChanges()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the fee trail.'))
  }, [])

  const WORDING: Record<string, string> = {
    'certificate.create': 'added a certificate',
    'certificate.update': 'changed a certificate',
    'certificate.withdraw': 'withdrew a certificate',
    'certificate.restore': 'restored a certificate',
    'barangay_fee.update': 'changed what a barangay charges',
  }

  if (error) {
    return <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
        <Receipt size={13} /> Fee changes
      </h2>
      <p className="mb-3 max-w-2xl text-[12.5px] leading-snug text-slate-600">
        What the hall and the barangays have changed about what residents are charged.
        A fee is frozen onto a request when it is filed, so a change here never rewrites
        what somebody was already quoted &mdash; which is usually the explanation when a
        figure in the book above does not match the catalogue.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[13px] text-slate-500">
          Nothing has changed yet.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((row) => (
            <div key={row.id} className="px-4 py-3 text-[13px]">
              <p className="text-navy-950">
                <span className="font-semibold">{row.actorName}</span>{' '}
                {WORDING[row.action] ?? row.action}
                {row.after?.name && <> &mdash; {row.after.name}</>}
                {row.after?.barangay && <> &mdash; Barangay {row.after.barangay}</>}
              </p>
              {/* The old figure beside the new one, because reconciling means
                  knowing what it used to be. */}
              {row.before?.fee !== undefined && row.after?.fee !== undefined &&
                row.before.fee !== row.after.fee && (
                <p className="mt-0.5 tabular-nums text-slate-600">
                  {formatPeso(row.before.fee)} &rarr;{' '}
                  <span className="font-semibold text-navy-950">{formatPeso(row.after.fee)}</span>
                </p>
              )}
              <p className="mt-0.5 text-[12px] text-slate-500">
                {new Date(row.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
