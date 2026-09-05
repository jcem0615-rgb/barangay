import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError, type NotificationPreferences } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * How a resident hears from the LGU. SMS is listed but only useful once the
 * municipality has an SMS provider configured; without one the toggle records
 * the preference and nothing is sent.
 */
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { t } = useT()

  const load = useCallback(async () => {
    try {
      const p = await api.notificationPreferences()
      setPrefs(p)
      setPhone(p.phone ?? '')
    } catch {
      // Shown as absent rather than erroring the whole profile screen.
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function save(patch: Partial<NotificationPreferences>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      setPrefs(await api.updateNotificationPreferences(patch))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!prefs) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('profile.reachYou')}</p>
      <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">
        {t('profile.reachBlurb')}
      </p>

      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[calc(14px_*_var(--text-scale))] text-navy-950">{t('profile.email')}</span>
          <input
            type="checkbox"
            checked={prefs.notifyEmail}
            disabled={busy}
            onChange={(e) => void save({ notifyEmail: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-navy-800"
          />
        </label>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[calc(14px_*_var(--text-scale))] text-navy-950">{t('profile.sms')}</span>
          <input
            type="checkbox"
            checked={prefs.notifySms}
            disabled={busy || !prefs.phone}
            onChange={(e) => void save({ notifySms: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-navy-800 disabled:opacity-40"
          />
        </label>

        <div>
          <label className="block">
            <span className="mb-1 block text-[calc(13px_*_var(--text-scale))] font-medium text-navy-950">{t('profile.mobile')}</span>
            <div className="flex gap-2">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09171234567"
                inputMode="tel"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[calc(14.5px_*_var(--text-scale))] outline-none focus:border-navy-600 focus:bg-white"
              />
              <button
                onClick={() => void save({ phone })}
                disabled={busy || phone === (prefs.phone ?? '')}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-800 disabled:opacity-40"
              >
                {busy && <Loader2 size={13} className="animate-spin" />} {t('common.save')}
              </button>
            </div>
          </label>
          {!prefs.phone && (
            <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{t('profile.addNumber')}</p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">{error}</p>
        )}
        {saved && !error && (
          <p role="status" className="text-[calc(13px_*_var(--text-scale))] text-emerald-700">{t('common.saved')}</p>
        )}
      </div>
    </div>
  )
}
