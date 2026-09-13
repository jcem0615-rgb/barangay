import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download, Loader2, ShieldCheck, UserX } from 'lucide-react'
import TopBar from '../components/TopBar'
import { api, ApiError, type ClosureEffect } from '../lib/api'
import { saveBlob } from '../lib/download'
import { useAuth } from '../lib/auth'
import { useResidentProfile } from '../lib/resident'
import { useT } from '../lib/i18n'

/**
 * The Data Privacy Act rights, as buttons.
 *
 * The privacy notice a few screens over says a resident has the right to see
 * what is held about them, correct it, and have it erased. Saying so and not
 * providing it is the version of compliance that helps nobody, so this is where
 * each of those becomes something you can press.
 *
 * Erasure is the one the app cannot grant in full. A released business permit
 * is a public record the municipality is required to keep, and a permit with no
 * applicant on it is not a record. The honest response is to say exactly that,
 * in advance, naming what stays and why — which is what the preview does.
 */
export default function MyData() {
  const { t } = useT()
  const { logout } = useAuth()
  const resident = useResidentProfile()

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [address, setAddress] = useState(resident?.address ?? '')
  const [barangay, setBarangay] = useState(resident?.barangay ?? '')
  const [phone, setPhone] = useState('')
  const [savedNote, setSavedNote] = useState(false)
  const [saving, setSaving] = useState(false)

  const [preview, setPreview] = useState<ClosureEffect | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    setAddress(resident?.address ?? '')
    setBarangay(resident?.barangay ?? '')
  }, [resident?.address, resident?.barangay])

  const loadPreview = useCallback(async () => {
    setError(null)
    try { setPreview(await api.closurePreview()) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load that.') }
  }, [])

  return (
    <div className="animate-tap-in pb-10">
      <TopBar title={t('mydata.title')} subtitle={t('mydata.subtitle')} />

      <div className="space-y-3 px-4 pt-4">
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[calc(13.5px_*_var(--text-scale))] text-rose-800">{error}</p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
            <Download size={16} className="text-navy-800" /> {t('mydata.exportTitle')}
          </h2>
          <p className="mt-1 text-[calc(13px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('mydata.exportBlurb')}
          </p>
          <button
            disabled={downloading}
            onClick={async () => {
              setDownloading(true)
              setError(null)
              try {
                const { blob, fileName } = await api.exportMyData()
                saveBlob(blob, fileName)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not build that file.')
              } finally {
                setDownloading(false)
              }
            }}
            className="tap-target mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-[calc(14.5px_*_var(--text-scale))] font-semibold text-white active:bg-navy-900 disabled:opacity-60"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {t('mydata.exportButton')}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
            <ShieldCheck size={16} className="text-navy-800" /> {t('mydata.correctTitle')}
          </h2>
          <p className="mt-1 text-[calc(13px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('mydata.correctBlurb')}
          </p>

          <div className="mt-3 space-y-3">
            <Field label={t('mydata.barangay')} value={barangay} onChange={setBarangay} />
            <Field label={t('mydata.address')} value={address} onChange={setAddress} />
            <Field label={t('mydata.phone')} value={phone} onChange={setPhone} placeholder="0917 123 4567" />
          </div>

          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setError(null)
              setSavedNote(false)
              try {
                await api.correctProfile({
                  barangay: barangay.trim() || null,
                  address: address.trim() || null,
                  ...(phone.trim() ? { phone: phone.trim() } : {}),
                })
                setSavedNote(true)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not save that.')
              } finally {
                setSaving(false)
              }
            }}
            className="tap-target mt-3 w-full rounded-xl border border-navy-100 bg-navy-50 text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-800 active:bg-navy-100 disabled:opacity-60"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
          {savedNote && (
            <p className="mt-1.5 text-[calc(12.5px_*_var(--text-scale))] text-emerald-700">{t('common.saved')}</p>
          )}

          {/* A name and a PhilSys number are identity claims an office verified
              against documents. Saying where to go is more use than a disabled
              field with no explanation. */}
          <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[calc(12.5px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('mydata.identityNote')}
          </p>
        </section>

        <section className="rounded-2xl border border-rose-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
            <UserX size={16} className="text-rose-600" /> {t('mydata.closeTitle')}
          </h2>
          <p className="mt-1 text-[calc(13px_*_var(--text-scale))] leading-relaxed text-slate-600">
            {t('mydata.closeBlurb')}
          </p>

          {!preview ? (
            <button
              onClick={() => void loadPreview()}
              className="tap-target mt-3 w-full rounded-xl border border-slate-200 text-[calc(14px_*_var(--text-scale))] font-semibold text-slate-700"
            >
              {t('mydata.seeWhatHappens')}
            </button>
          ) : (
            <>
              <Effect title={t('mydata.willErase')} items={preview.erased} tone="erase" />
              <Effect title={t('mydata.willKeep')} items={preview.retained} tone="keep" />
              <p className="mt-3 text-[calc(12.5px_*_var(--text-scale))] leading-relaxed text-slate-600">
                {preview.howToGoFurther}
              </p>

              {confirming ? (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={closing}
                    onClick={async () => {
                      setClosing(true)
                      try { await api.closeMyAccount(); logout() }
                      catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Could not close the account.')
                        setClosing(false)
                      }
                    }}
                    className="tap-target flex-1 rounded-xl bg-rose-600 text-[calc(14px_*_var(--text-scale))] font-semibold text-white disabled:opacity-60"
                  >
                    {closing ? t('common.loading') : t('mydata.confirmClose')}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="tap-target flex-1 rounded-xl border border-slate-200 text-[calc(14px_*_var(--text-scale))] font-medium text-slate-600"
                  >
                    {t('mydata.keepAccount')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="tap-target mt-3 w-full rounded-xl border border-rose-200 text-[calc(14px_*_var(--text-scale))] font-semibold text-rose-700 active:bg-rose-50"
                >
                  {t('mydata.closeButton')}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Effect({ title, items, tone }: { title: string; items: Record<string, string | null>; tone: 'erase' | 'keep' }) {
  const lines = Object.values(items).filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (lines.length === 0) return null
  return (
    <div className={`mt-3 rounded-xl px-3.5 py-3 ${tone === 'erase' ? 'bg-slate-50' : 'bg-amber-50'}`}>
      <p className="flex items-center gap-1.5 text-[calc(12px_*_var(--text-scale))] font-bold uppercase tracking-wide text-slate-600">
        {tone === 'keep' && <AlertTriangle size={12} className="text-amber-700" />} {title}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-500" />
            <span className="text-[calc(12.5px_*_var(--text-scale))] leading-relaxed text-navy-950">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="tap-target mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[calc(14px_*_var(--text-scale))] outline-none placeholder:text-slate-400 focus:border-navy-600"
      />
    </label>
  )
}
