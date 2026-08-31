import { useState, type FormEvent } from 'react'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'

/**
 * Reached by opening a reset link. The token comes from the URL, which App
 * strips once read so it isn't left sitting in the address bar or history.
 */
export default function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-canvas px-5 py-10">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-white">
            <Building2 size={26} strokeWidth={1.9} />
          </span>
          <h1 className="font-display text-[20px] font-extrabold text-navy-950">Choose a new password</h1>
        </div>

        {done ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-[14px] font-semibold text-navy-950">Your password has been changed.</p>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Anyone signed in to your account has been signed out.
            </p>
            <button
              onClick={onDone}
              className="mt-5 w-full rounded-xl bg-navy-800 py-3 text-[14px] font-semibold text-white active:bg-navy-900"
            >
              Sign in
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-navy-950">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[14px] outline-none focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
              />
              <span className="mt-1 block text-[11.5px] text-slate-400">At least 10 characters.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-navy-950">Confirm new password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[14px] outline-none focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white active:bg-navy-900 disabled:opacity-70"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Change password
            </button>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-1 text-[12.5px] font-medium text-slate-500"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
