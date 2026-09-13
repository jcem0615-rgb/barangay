import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import { useT } from '../lib/i18n'

/**
 * Turning notifications on for this device.
 *
 * Two shapes, one behaviour. The `prompt` variant is offered right after a
 * resident files something — the moment they first have anything to be
 * notified about, which is the only moment the question makes sense. The plain
 * variant lives in Profile for turning it back on later.
 *
 * A browser that has already been told no is not asked again: the prompt is
 * one-shot and a second attempt silently does nothing, so showing a button
 * would be lying. It says how to undo that instead.
 */
export default function PushToggle({ variant = 'row' }: { variant?: 'row' | 'prompt' }) {
  const { t } = useT()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => setState(await pushState()), [])
  useEffect(() => { void refresh() }, [refresh])

  // Nothing to offer where the browser cannot do it, or the server has not been
  // configured for it. A switch that cannot work is worse than no switch.
  if (state === null || state === 'unsupported' || state === 'unconfigured') return null
  if (variant === 'prompt' && state === 'on') return null

  const act = async () => {
    setBusy(true)
    try {
      setState(state === 'on' ? await disablePush() : await enablePush())
    } finally {
      setBusy(false)
    }
  }

  if (state === 'denied') {
    return (
      <div className={variant === 'prompt' ? 'rounded-2xl border border-slate-200 bg-white p-4' : 'px-1 py-2'}>
        <p className="flex items-start gap-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
          <BellOff size={15} className="mt-0.5 shrink-0" />
          {t('push.blocked')}
        </p>
      </div>
    )
  }

  if (variant === 'prompt') {
    return (
      <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
        <div className="flex items-start gap-2.5">
          <Bell size={17} className="mt-0.5 shrink-0 text-navy-800" />
          <div className="min-w-0">
            <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('push.promptTitle')}</p>
            <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('push.promptBlurb')}
            </p>
          </div>
        </div>
        <button
          disabled={busy}
          onClick={() => void act()}
          className="tap-target mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(14px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} {t('push.turnOn')}
        </button>
      </div>
    )
  }

  return (
    <button
      disabled={busy}
      onClick={() => void act()}
      className="tap-target flex w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
    >
      <span className="flex items-center gap-3">
        {state === 'on' ? <Bell size={18} className="text-navy-800" /> : <BellOff size={18} className="text-slate-500" />}
        <span>
          <span className="block text-[calc(14.5px_*_var(--text-scale))] font-medium text-navy-950">
            {t('push.rowLabel')}
          </span>
          <span className="block text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
            {state === 'on' ? t('push.onThisDevice') : t('push.offThisDevice')}
          </span>
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
          state === 'on' ? 'bg-navy-800' : 'bg-slate-300'
        }`}
      >
        <span className={`h-5 w-5 rounded-full bg-white transition ${state === 'on' ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}
