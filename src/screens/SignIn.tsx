import { useEffect, useState, type FormEvent } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, ApiError, IS_DEMO } from '../lib/api'
import LanguageToggle from '../components/LanguageToggle'
import { useT } from '../lib/i18n'
import { useCatalogue } from '../lib/catalogue'

type Mode = 'login' | 'register' | 'forgot'

export default function SignIn() {
  const { login, register } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Municipality and province are not in here on purpose. They are facts about
  // the deployment, which the server stamps on the account; a form field for
  // them would be asking the browser to assert something it does not decide.
  const [form, setForm] = useState({
    email: '', password: '', fullName: '',
    barangayId: '', birthDate: '', motherMaidenName: '',
  })
  const [barangays, setBarangays] = useState<Array<{ id: string; name: string }>>([])
  const [residesHere, setResidesHere] = useState(false)
  const { municipality } = useCatalogue()

  // Public, and needed before anybody has an account. Fetched once rather than
  // on switching to the register tab, so the list is there the moment it is
  // wanted.
  useEffect(() => {
    api.barangays().then(setBarangays).catch(() => undefined)
  }, [])

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'login') await login(form.email, form.password)
      else if (mode === 'forgot') {
        const { message } = await api.forgotPassword(form.email)
        setNotice(message)
      } else await register({ ...form, residesHere: true })
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
          <h1 className="font-display text-[calc(22px_*_var(--text-scale))] font-extrabold text-navy-950">eLGU Citizen Portal</h1>
          <p className="mt-1 text-[calc(14px_*_var(--text-scale))] text-slate-500">
            {municipality ? t('auth.municipalityOf', { name: municipality.name }) : '\u00a0'}
          </p>
        </div>

        <div className="mb-3">
          <LanguageToggle compact />
        </div>

        <div className="mb-4 flex rounded-xl bg-white p-1 shadow-sm">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setNotice(null) }}
              className={`flex-1 rounded-lg py-2.5 text-[calc(14px_*_var(--text-scale))] font-semibold transition ${
                mode === m || (m === 'login' && mode === 'forgot')
                  ? 'bg-navy-800 text-white'
                  : 'text-slate-500'
              }`}
            >
              {m === 'login' ? t('auth.signIn') : t('auth.createAccount')}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          {mode === 'forgot' && (
            <p className="text-[calc(13.5px_*_var(--text-scale))] leading-snug text-slate-500">
              {t('auth.forgotBlurb')}
            </p>
          )}
          {mode === 'register' && (
            <Field label={t('auth.fullName')} value={form.fullName} onChange={set('fullName')} required autoComplete="name" />
          )}
          <Field label={t('auth.email')} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          {mode !== 'forgot' && (
            <Field
              label={t('auth.password')}
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              helper={mode === 'register' ? t('auth.passwordHint') : undefined}
            />
          )}
          {mode === 'register' && (
            <>
              {/*
                A list, not a text box. The barangay is a row the municipality
                keeps — it decides what the place is called, and it is what the
                account is attached to — so a typed one could not be matched to
                it. Where the list has not arrived the field is simply absent and
                the barangay hub asks later, rather than offering an empty one.
              */}
              {barangays.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-medium text-navy-950">
                    {t('auth.barangay')}
                  </span>
                  <select
                    value={form.barangayId}
                    onChange={set('barangayId')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
                  >
                    <option value="">{t('auth.barangayPick')}</option>
                    {barangays.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {/* With the mother's maiden name, this is what separates two
                  residents of the same name — so both are required, and the
                  server refuses a second account matching an existing one. */}
              <Field
                label={t('auth.birthDate')}
                type="date"
                value={form.birthDate}
                onChange={set('birthDate')}
                required
                max={new Date().toISOString().slice(0, 10)}
                autoComplete="bday"
              />
              <Field
                label={t('auth.motherMaidenName')}
                value={form.motherMaidenName}
                onChange={set('motherMaidenName')}
                required
                helper={t('auth.motherHint')}
              />

              {/* The portal cannot verify where somebody lives — the office does
                  that at the counter — but binding an account to a municipality
                  without ever asking them would be worse than asking.

                  Until the catalogue answers we do not know which town to name,
                  and submitting is blocked below rather than here: a checkbox
                  that names the wrong municipality is worse than a short wait. */}
              {municipality ? (
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      required
                      checked={residesHere}
                      onChange={(e) => setResidesHere(e.target.checked)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-navy-800"
                    />
                    <span className="text-[calc(13.5px_*_var(--text-scale))] font-medium leading-snug text-navy-950">
                      {t('auth.residesHere', { name: municipality.name, province: municipality.province })}
                    </span>
                  </label>
                  <p className="mt-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
                    {t('auth.residesElsewhere', { name: municipality.name })}
                  </p>
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
                  {t('auth.loadingMunicipality')}
                </p>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[calc(13.5px_*_var(--text-scale))] text-emerald-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || (mode === 'register' && !municipality)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3.5 text-[calc(15px_*_var(--text-scale))] font-semibold text-white transition active:bg-navy-900 disabled:opacity-70"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? t('auth.signIn') : mode === 'forgot' ? t('auth.sendResetLink') : t('auth.createAccount')}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(null); setNotice(null) }}
              className="w-full py-1 text-[calc(13.5px_*_var(--text-scale))] font-medium text-navy-800"
            >
              {t('auth.forgot')}
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setNotice(null) }}
              className="w-full py-1 text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-500"
            >
              {t('auth.backToSignIn')}
            </button>
          )}
        </form>

        {IS_DEMO ? (
          <div className="mt-4 rounded-2xl border border-gold-500/40 bg-gold-100/50 p-4">
            <p className="text-[calc(13px_*_var(--text-scale))] font-bold text-navy-950">Demo — sign in with any of these</p>
            {/*
              Grouped by tier, the same split the dashboard makes: the point of
              the demo is following one request across both levels of government,
              and a flat list of five addresses does not show that there are two
              sides to be on.
            */}
            <div className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-navy-900">
              {DEMO_ACCOUNTS.map((group) => (
                <section key={group.tier}>
                  <h3 className="pb-0.5 pt-2 text-[calc(11px_*_var(--text-scale))] font-bold uppercase tracking-wide text-slate-500">
                    {group.tier}
                  </h3>
                  <dl className="space-y-1">
                    {group.accounts.map(([role, email]) => (
                      <div key={email} className="flex justify-between gap-3">
                        <dt className="shrink-0 text-slate-600">{role}</dt>
                        <dd className="min-w-0 truncate font-medium">{email}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              <dl className="mt-2 flex justify-between gap-3 border-t border-gold-500/30 pt-2">
                <dt className="text-slate-600">Password (all)</dt>
                <dd className="font-mono font-medium">elgu-demo-2026</dd>
              </dl>
            </div>
            <p className="mt-2.5 text-[calc(12px_*_var(--text-scale))] leading-snug text-slate-600">
              To follow a request through both sides, sign out and switch
              accounts &mdash; the demo keeps its data in <em>this</em> browser, so a
              second window or incognito tab starts over. Every other barangay has
              an administrator at <span className="font-mono">admin.&lt;barangay&gt;@malasiqui.gov.ph</span>.
              Email, SMS and virus scanning need the real server and do nothing here.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-center text-[calc(12.5px_*_var(--text-scale))] leading-relaxed text-slate-500">
            {t('auth.staffNote')}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Who you can be in the demo.
 *
 * Every barangay has an administrator and the first also has an officer, but
 * listing twelve addresses would bury the one thing this panel is for — so it
 * names Poblacion's pair, which is the one with both roles, and says the rest
 * follow the same shape.
 */
const DEMO_ACCOUNTS: Array<{ tier: string; accounts: Array<[string, string]> }> = [
  {
    tier: 'Resident',
    // Named rather than labelled 'Resident' twice: this is the seeded account
    // with requests on both tiers already, so saying who you will be is worth
    // more than repeating the heading.
    accounts: [['Maria Santos', 'maria@example.ph']],
  },
  {
    tier: 'Municipal offices',
    accounts: [
      ['Treasury staff', 'treasury@malasiqui.gov.ph'],
      ['Administrator', 'admin@malasiqui.gov.ph'],
    ],
  },
  {
    tier: 'Barangay Poblacion',
    // Three roles, and the pair worth comparing is the clerk and the kagawad:
    // one works the register and the blotter, the other sees counts and no
    // individual resident at all.
    accounts: [
      ['Clerk', 'officer.poblacion@malasiqui.gov.ph'],
      ['Kagawad', 'kagawad.poblacion@malasiqui.gov.ph'],
      ['Administrator', 'admin.poblacion@malasiqui.gov.ph'],
    ],
  },
]

function Field({
  label, helper, ...props
}: { label: string; helper?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[calc(13.5px_*_var(--text-scale))] font-medium text-navy-950">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[calc(15px_*_var(--text-scale))] text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-600/15"
      />
      {helper && <span className="mt-1 block text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{helper}</span>}
    </label>
  )
}
