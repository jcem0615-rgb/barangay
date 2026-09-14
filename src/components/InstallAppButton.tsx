import { useState } from 'react'
import { Check, Download, Share, X } from 'lucide-react'
import { promptInstall, useInstallState } from '../lib/install'
import { useT } from '../lib/i18n'

const DISMISSED_KEY = 'elgu-install-dismissed'

/**
 * Offering to install the portal.
 *
 * Two shapes. The `banner` sits on the dashboard, where a resident will
 * actually see it, and can be dismissed for good — an install offer that comes
 * back every visit is an advertisement. The `row` lives in Profile, which is
 * where somebody goes looking once they have decided they want it, and is
 * never dismissed because they went there on purpose.
 *
 * Neither is shown where installing is impossible, and neither is shown to an
 * app that is already installed: the banner would be advertising the thing you
 * are holding.
 */
export default function InstallAppButton({ variant = 'row' }: { variant?: 'row' | 'banner' }) {
  const { t } = useT()
  const state = useInstallState()
  const [showIos, setShowIos] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (state === 'unavailable') return null
  if (state === 'installed') {
    // Worth saying once in Profile — "did it work?" is the question after any
    // install — but a banner announcing it would be noise on every visit.
    if (variant === 'banner') return null
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <Check size={17} className="shrink-0 text-emerald-600" />
        <span className="text-[calc(13.5px_*_var(--text-scale))] font-medium text-slate-600">
          {t('install.rowInstalled')}
        </span>
      </div>
    )
  }
  if (variant === 'banner' && dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // A browser refusing storage is not a reason to fail the tap; the banner
      // simply comes back next visit.
    }
  }

  const iosSteps = (
    <ol className="mt-2 space-y-1.5 pl-1">
      {[t('install.iosStep1'), t('install.iosStep2'), t('install.iosStep3')].map((step, i) => (
        <li key={step} className="flex gap-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-navy-100 text-[calc(11px_*_var(--text-scale))] font-bold text-navy-800">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  )

  if (variant === 'banner') {
    return (
      <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
        <div className="flex items-start gap-2.5">
          <Download size={17} className="mt-0.5 shrink-0 text-navy-800" />
          <div className="min-w-0 flex-1">
            <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('install.bannerTitle')}</p>
            <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('install.bannerBlurb')}
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label={t('install.dismiss')}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-navy-100"
          >
            <X size={16} />
          </button>
        </div>

        {state === 'manual-ios' ? (
          iosSteps
        ) : (
          <button
            onClick={() => void promptInstall()}
            className="tap-target mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(14px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900"
          >
            <Download size={15} /> {t('install.action')}
          </button>
        )}
      </div>
    )
  }

  if (state === 'manual-ios') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-1">
        <button
          onClick={() => setShowIos((v) => !v)}
          aria-expanded={showIos}
          className="tap-target flex w-full items-center gap-3 text-left"
        >
          <Share size={17} className="shrink-0 text-navy-800" />
          <span className="flex-1">
            <span className="block text-[calc(14.5px_*_var(--text-scale))] font-medium text-navy-950">
              {t('install.rowLabel')}
            </span>
            <span className="block text-[calc(12.5px_*_var(--text-scale))] text-slate-600">
              {t('install.iosTitle')}
            </span>
          </span>
          <span className="shrink-0 text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-800">
            {showIos ? t('install.iosHide') : t('install.iosShow')}
          </span>
        </button>
        {showIos && <div className="pb-3">{iosSteps}</div>}
      </div>
    )
  }

  return (
    <button
      onClick={() => void promptInstall()}
      className="tap-target flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left active:bg-slate-50"
    >
      <Download size={17} className="shrink-0 text-navy-800" />
      <span className="flex-1">
        <span className="block text-[calc(14.5px_*_var(--text-scale))] font-medium text-navy-950">
          {t('install.rowLabel')}
        </span>
        <span className="block text-[calc(12.5px_*_var(--text-scale))] text-slate-600">{t('install.rowBlurb')}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-navy-800 px-3 py-1.5 text-[calc(13px_*_var(--text-scale))] font-semibold text-white">
        {t('install.action')}
      </span>
    </button>
  )
}
