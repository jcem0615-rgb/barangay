import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, UserPlus } from 'lucide-react'
import { api, ApiError, type StaffAccount } from '../../lib/api'
import type { ServiceCategory } from '../../types'

/**
 * Staff account administration. Onboarding a clerk previously meant editing the
 * database by hand; revoking someone who left meant the same.
 */
export default function StaffAccounts({ departments }: { departments: ServiceCategory[] }) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ email: '', fullName: '', position: '', departments: [] as string[] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAccounts(await api.listStaff())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(fn: () => Promise<unknown>, done?: string) {
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (done) setNotice(done)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not go through.')
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      const account = await api.createStaff(form)
      setNotice(
        account.invited
          ? `Invitation sent to ${account.email}. They choose their own password from that link.`
          : `Account created, but the invitation email failed to send. Use "Send reset link" to try again.`
      )
      setForm({ email: '', fullName: '', position: '', departments: [] })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that account.')
    } finally {
      setCreating(false)
    }
  }

  const toggleDepartment = (id: string) =>
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(id)
        ? f.departments.filter((d) => d !== id)
        : [...f.departments, id],
    }))

  const nameOf = (id: string) => departments.find((d) => d.id === id)?.name ?? id

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[660px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.06em] text-slate-400">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Offices</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px] text-slate-400">Loading…</td></tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 text-[13px] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy-950">{a.fullName}</p>
                  <p className="text-[11.5px] text-slate-400">{a.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {a.role === 'admin' ? 'All offices (administrator)' : a.departments.map(nameOf).join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                    a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {a.active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    {a.active && (
                      <button
                        onClick={() => void act(() => api.sendStaffReset(a.id), `Reset link sent to ${a.email}.`)}
                        title="Email them a link to set a new password"
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <KeyRound size={12} /> Reset link
                      </button>
                    )}
                    {a.active ? (
                      <button
                        onClick={() => void act(() => api.deactivateStaff(a.id), `${a.fullName} can no longer sign in.`)}
                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[12px] font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => void act(() => api.reactivateStaff(a.id), `${a.fullName} can sign in again.`)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-navy-800 hover:bg-slate-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-display text-[14px] font-bold text-navy-950">
          <UserPlus size={16} /> Add a staff account
        </h2>
        <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
          They receive a link and choose their own password. You never set one.
        </p>

        <form onSubmit={create} className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-navy-950">Full name</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-navy-950">Work email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-navy-950">Position</span>
            <input
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              placeholder="e.g. Revenue Officer II"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-navy-950">Offices</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-[12.5px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.departments.includes(d.id)}
                    onChange={() => toggleDepartment(d.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-navy-800"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">{notice}</p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-2 rounded-xl bg-navy-800 px-5 py-2.5 text-[13px] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
          >
            {creating && <Loader2 size={14} className="animate-spin" />} Create and send invitation
          </button>
        </form>
      </aside>
    </div>
  )
}
