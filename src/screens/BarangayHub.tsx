import { useCallback, useEffect, useState } from 'react'
import { Building, CalendarClock, CheckCircle2, ChevronRight, Clock, Download, Loader2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import TierSwitch from '../components/TierSwitch'
import AnnouncementBoard from '../components/AnnouncementBoard'
import BarangayHallCard from '../components/BarangayHallCard'
import { api, ApiError, type BarangayRequest } from '../lib/api'
import { saveBlob } from '../lib/download'
import { formatPeso } from '../lib/money'
import { formatValidUntil } from '../lib/validity'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

/**
 * Everything the barangay does, on one screen.
 *
 * The two tiers are separated at the dashboard rather than mixed into one list
 * of services, because the question "is this the barangay or the municipio?" is
 * the one residents get wrong, and getting it wrong costs a trip to the wrong
 * office. Here the answer is the screen they are already on.
 *
 * A resident has to say which barangay they live in before anything can be
 * issued — the municipality is the deployment's to decide, but nobody except the
 * resident knows their barangay, and the barangay checks it at the counter the
 * way it always has.
 */
export default function BarangayHub() {
  const { t, language } = useT()
  const [mine, setMine] = useState<Awaited<ReturnType<typeof api.myBarangay>> | null>(null)
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([])
  const [requests, setRequests] = useState<BarangayRequest[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [own, list] = await Promise.all([api.myBarangay(), api.myCertificates()])
      setMine(own)
      setRequests(list)
      if (!own.barangay) setOptions(await api.barangays())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('brgy.loadFailed'))
    } finally {
      setBusy(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const choose = async (id: string) => {
    setError(null)
    try {
      await api.setMyBarangay(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('brgy.loadFailed'))
    }
  }

  const locale = language === 'fil' ? 'fil-PH' : 'en-PH'

  return (
    <div className="animate-tap-in pb-24">
      <TopBar title={t('brgy.title')} subtitle={mine?.barangay?.name ?? undefined} />

      <div className="px-4 pt-4">
        <div className="mb-4">
          <TierSwitch active="barangay" />
        </div>

        {busy && <Loader2 size={18} className="animate-spin text-slate-400" />}

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[calc(13.5px_*_var(--text-scale))] text-rose-700">
            {error}
          </p>
        )}

        {!busy && mine && !mine.barangay && (
          <section className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
            <h2 className="text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
              {t('brgy.chooseTitle')}
            </h2>
            <p className="mt-1 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
              {t('brgy.chooseBlurb')}
            </p>
            <div className="mt-3 space-y-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => void choose(option.id)}
                  className="tap-target flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-[calc(14px_*_var(--text-scale))] font-semibold text-navy-950 active:bg-slate-50"
                >
                  {option.name}
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </section>
        )}

        {!busy && mine?.barangay && (
          <BarangayView mine={{ ...mine, barangay: mine.barangay }} requests={requests} locale={locale} />
        )}
      </div>
    </div>
  )
}

/**
 * Split out so the barangay is a non-null prop rather than a narrowed piece of
 * state: the request list needs the hall's hours inside a callback, where
 * TypeScript cannot keep a narrowing that a re-render could invalidate.
 */
function BarangayView({
  mine, requests, locale,
}: {
  mine: NonNullable<Awaited<ReturnType<typeof api.myBarangay>>> & {
    barangay: NonNullable<Awaited<ReturnType<typeof api.myBarangay>>['barangay']>
  }
  requests: BarangayRequest[]
  locale: string
}) {
  const { t } = useT()
  const { push } = useNav()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  return (
      <>
        {/* What the barangay is telling you, before what you can ask it for. */}
        <AnnouncementBoard />

        <p className="mb-2 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
          {t('brgy.certificates')}
        </p>
        <div className="space-y-2.5">
          {mine.certificates.map((type) => (
            <button
              key={type.id}
              onClick={() => push({ name: 'barangay-request', typeId: type.id })}
              className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                <Building size={16} className="text-emerald-700" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[calc(14.5px_*_var(--text-scale))] font-bold text-navy-950">
                  {type.name}
                </span>
                <span className="block text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
                  {type.description}
                </span>
              </span>
              {/* Free is worth saying in a word rather than as ₱0.00. */}
              <span className="shrink-0 text-[calc(13px_*_var(--text-scale))] font-bold text-navy-800">
                {type.fee === 0 ? t('brgy.free') : formatPeso(type.fee)}
              </span>
            </button>
          ))}
        </div>

        <p className="mb-2 mt-6 px-1 text-[calc(12.5px_*_var(--text-scale))] font-semibold uppercase tracking-wide text-slate-500">
          {t('brgy.myRequests')}
        </p>
        {requests.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-[calc(13.5px_*_var(--text-scale))] text-slate-500">
            {t('brgy.noRequests')}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {requests.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">
                      {item.typeName}
                    </p>
                    <p className="mt-0.5 font-mono text-[calc(12px_*_var(--text-scale))] text-slate-500">
                      {item.referenceNo}
                    </p>
                  </div>
                  <BarangayPill status={item.status} />
                </div>
                {/* The one status that asks the resident to travel, so it
                    is the one that says when the hall is open. Repeating the
                    hours here rather than only in the card below is
                    deliberate: this is where somebody decides to go. */}
                {item.status === 'ready' && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-emerald-900">
                    <p className="flex items-start gap-1.5">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {t('brgy.readyBlurb')}
                    </p>
                    {mine.barangay.officeHours && (
                      <p className="mt-1 flex items-start gap-1.5 font-semibold">
                        <Clock size={14} className="mt-0.5 shrink-0" />
                        {t('brgy.hallHours')} {mine.barangay.officeHours}
                      </p>
                    )}
                  </div>
                )}

                {/* How long it is good for, once it exists. Said on the
                    request rather than only on the catalogue screen,
                    because the date is the thing an office will check. */}
                {item.validUntil && (
                  <p
                    className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug ${
                      item.expired ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    <CalendarClock size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {item.expired
                        ? t('brgy.lapsed', { date: formatValidUntil(item.validUntil, locale) })
                        : t('brgy.validUntil', { date: formatValidUntil(item.validUntil, locale) })}
                      {item.expired && <> {t('brgy.lapsedBlurb')}</>}
                    </span>
                  </p>
                )}
                {/*
                  The certificate itself, once the barangay has released it.
                  It only exists from `released` — the barangay takes its fee
                  at the hall on collection, so a copy at `ready` would hand
                  somebody the document without their ever going.
                */}
                {item.hasCertificate && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2.5">
                    <p className="text-[calc(12.5px_*_var(--text-scale))] leading-snug text-emerald-900">
                      {t('brgy.certificateHint')}
                    </p>
                    {/*
                      The code printed on it, so somebody at a counter can read
                      it out without opening a PDF on a phone.
                    */}
                    {item.certificateCode && (
                      <p className="mt-1.5 font-mono text-[calc(12.5px_*_var(--text-scale))] tracking-wide text-emerald-800">
                        {item.certificateCode}
                      </p>
                    )}
                    <button
                      disabled={downloading === item.id}
                      onClick={async () => {
                        setDownloading(item.id)
                        setDownloadError(null)
                        try {
                          const { blob, fileName } = await api.barangayCertificate(item.id)
                          saveBlob(blob, fileName)
                        } catch (err) {
                          setDownloadError(
                            err instanceof ApiError ? err.message : t('brgy.certificateError')
                          )
                        } finally {
                          setDownloading(null)
                        }
                      }}
                      className="tap-target mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-white py-2.5 text-[calc(14px_*_var(--text-scale))] font-semibold text-emerald-700 transition active:bg-emerald-50 disabled:opacity-70"
                    >
                      <Download size={15} />
                      {downloading === item.id ? t('detail.preparing') : t('brgy.certificate')}
                    </button>
                    {downloadError && downloading === null && (
                      <p role="alert" className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-rose-700">
                        {downloadError}
                      </p>
                    )}
                  </div>
                )}

                {item.note && item.status === 'rejected' && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-rose-800">
                    {item.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Reference material, so it sits at the bottom: somebody who came
            here to request something should not have to scroll past the
            office's address to do it. */}
        <BarangayHallCard office={mine.barangay} />
      </>
  )
}

/**
 * Its own pill rather than the municipal one: a barangay certificate moves
 * through different words, and bending `StatusPill` to fit would mean inventing
 * municipal status keys that name nothing.
 */
const PILL: Record<BarangayRequest['status'], string> = {
  pending: 'bg-slate-200 text-slate-700',
  processing: 'bg-navy-100 text-navy-800',
  ready: 'bg-gold-100 text-gold-600',
  released: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-600',
}

export function BarangayPill({ status }: { status: BarangayRequest['status'] }) {
  const { t } = useT()
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[calc(12px_*_var(--text-scale))] font-semibold ${PILL[status]}`}>
      {t(`brgy.status.${status}`)}
    </span>
  )
}
