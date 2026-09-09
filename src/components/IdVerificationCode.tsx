import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import QrPattern from './QrPattern'
import { verificationUrl } from '../lib/qrPattern'

/**
 * The code a resident reads out at a counter.
 *
 * The card itself proves nothing — it can be screenshotted, and the programme
 * badges on it are worth real money. This code is what makes the ID checkable:
 * it lives ninety seconds and dies the first time a clerk uses it, so a
 * screenshot is stale before it reaches a window and a code passed along buys
 * nothing.
 *
 * It renews itself just before expiry, so a resident queueing at a counter is
 * never holding a dead code.
 */
export default function IdVerificationCode() {
  const [code, setCode] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const { t } = useT()

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const issued = await api.issueVerification()
      setCode(issued.code)
      setSecondsLeft(Math.max(0, Math.round((Date.parse(issued.expiresAt) - Date.now()) / 1000)))
    } catch {
      // Offline: an ID that cannot be verified says so, rather than showing a
      // stale code a clerk would only reject.
      setCode(null)
      setError(t('verify.unavailable'))
    } finally {
      setBusy(false)
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (!code) return
    timer.current = setInterval(() => {
      setSecondsLeft((left) => {
        // Renewed a few seconds early, so there is no moment with no code.
        if (left <= 5) {
          void refresh()
          return 0
        }
        return left - 1
      })
    }, 1000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [code, refresh])

  return (
    <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-navy-800" />
        <div className="min-w-0 flex-1">
          <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
            {t('verify.title')}
          </p>
          <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
            {t('verify.blurb')}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-navy-100 bg-white px-4 py-3 text-center">
        {error ? (
          <p className="text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">{error}</p>
        ) : code ? (
          <>
            {/*
              Both readings of the same code, so a counter can use whichever is
              faster: the clerk scans it, or the resident reads it out. The QR
              carries a link, since the scanner is the clerk's own phone camera
              and a phone knows what to do with a URL.
            */}
            <div className="flex justify-center">
              <QrPattern content={verificationUrl(code)} dim={132} />
            </div>
            <p className="font-display mt-3 text-[calc(22px_*_var(--text-scale))] font-extrabold tracking-[0.06em] tabular-nums text-navy-950">
              {code}
            </p>
            <p className="mt-1 text-[calc(12px_*_var(--text-scale))] text-slate-500">
              {t('verify.expiresIn', { seconds: secondsLeft })}
            </p>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 py-1 text-[calc(13px_*_var(--text-scale))] text-slate-500">
            <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
          </p>
        )}
      </div>

      <button
        onClick={() => void refresh()}
        disabled={busy}
        className="tap-target mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-navy-100 text-[calc(13px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-navy-100 disabled:opacity-50"
      >
        <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {t('verify.newCode')}
      </button>
    </div>
  )
}
