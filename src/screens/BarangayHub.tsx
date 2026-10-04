import { useCallback, useEffect, useState } from 'react'
import { Building, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import TierSwitch from '../components/TierSwitch'
import AnnouncementBoard from '../components/AnnouncementBoard'
import { api, ApiError, type BarangayRequest } from '../lib/api'
import { formatPeso } from '../lib/money'
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
  const { push } = useNav()
  const { t } = useT()
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
                    {item.status === 'ready' && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-emerald-900">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {t('brgy.readyBlurb')}
                      </p>
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
          </>
        )}
      </div>
    </div>
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
