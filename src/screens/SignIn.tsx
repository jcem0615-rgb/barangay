import { useState, type FormEvent } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'

type Mode = 'login' | 'register'

export default function SignIn() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '', password: '', fullName: '',
    barangay: '', municipality: 'Municipality of San Fernando', province: 'Cebu',
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await login(form.email, form.password)
      else await register(form)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
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
          <h1 className="font-display text-[22px] font-extrabold text-navy-950">eLGU Citizen Portal</h1>
          <p className="mt-1 text-[13px] text-slate-500">Municipality of San Fernando</p>
        </div>

        <div className="mb-4 flex rounded-xl bg-white p-1 shadow-sm">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition ${
                mode === m ? 'bg-navy-800 text-white' : 'text-slate-500'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          {mode === 'register' && (
            <Field label="Full name" value={form.fullName} onChange={set('fullName')} required autoComplete="name" />
          )}
          <Field label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            helper={mode === 'register' ? 'At least 10 characters.' : undefined}
          />
          {mode === 'register' && (
            <Field label="Barangay" value={form.barangay} onChange={set('barangay')} autoComplete="address-level4" />
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[14px] font-semibold text-white transition active:bg-navy-900 disabled:opacity-70"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-slate-400">
          Municipal staff sign in with the account issued by their office.
        </p>
      </div>
    </div>
  )
}

function Field({
  label, helper, ...props
}: { label: string; helper?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-navy-950">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[14px] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
      />
      {helper && <span className="mt-1 block text-[11.5px] text-slate-400">{helper}</span>}
    </label>
  )
}
