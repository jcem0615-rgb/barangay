import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * How that went.
 *
 * RA 11032 requires a feedback mechanism against the Citizen's Charter, and the
 * charter is the catalogue — every fee and processing time the app publishes.
 * This is the resident's half of it, asked at the only moment they can answer
 * honestly: when the office has finished.
 *
 * Deliberately one question. A full Client Satisfaction Measurement has
 * prescribed dimensions, and asking eight of them on a phone gets eight blank
 * answers; one star rating and an optional sentence gets a real one.
 */
export default function RateTransaction({
  requestId, existing, onRated,
}: {
  requestId: string
  existing: { rating: number; comment: string | null } | null
  onRated: () => void
}) {
  const { t } = useT()
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [comment, setComment] = useState(existing?.comment ?? '')

  // The existing rating is fetched after this mounts, and useState only reads
  // its initial value — without this a resident who already rated something
  // came back to a blank row of stars and was asked the same question again.
  useEffect(() => {
    if (!existing) return
    setRating(existing.rating)
    setComment(existing.comment ?? '')
  }, [existing?.rating, existing?.comment])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(value: number) {
    setRating(value)
    setSaving(true)
    setError(null)
    try {
      await api.rateRequest(requestId, value, comment.trim() || undefined)
      setSaved(true)
      onRated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[calc(14px_*_var(--text-scale))] font-bold text-navy-950">{t('rate.title')}</p>
      <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
        {t('rate.blurb')}
      </p>

      <div className="mt-3 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            disabled={saving}
            onClick={() => void send(value)}
            // Named, not just drawn: a row of stars is meaningless to a screen
            // reader and ambiguous to anyone unsure which end is good.
            aria-label={t(`rate.star${value}` as 'rate.star1')}
            aria-pressed={rating === value}
            className={`tap-target flex flex-1 items-center justify-center rounded-xl border ${
              value <= rating ? 'border-gold-500 bg-gold-100' : 'border-slate-200 bg-white'
            }`}
          >
            <Star
              size={20}
              className={value <= rating ? 'fill-gold-500 text-gold-600' : 'text-slate-400'}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[calc(11.5px_*_var(--text-scale))] text-slate-500">
        <span>{t('rate.star1')}</span>
        <span>{t('rate.star5')}</span>
      </div>

      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            onBlur={() => { if (rating > 0) void send(rating) }}
            rows={2}
            placeholder={t('rate.commentPlaceholder')}
            className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[calc(13.5px_*_var(--text-scale))] outline-none placeholder:text-slate-400 focus:border-navy-600"
          />
          {saved && !error && (
            <p className="mt-1.5 text-[calc(12.5px_*_var(--text-scale))] text-emerald-700">{t('rate.thanks')}</p>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-2 text-[calc(12.5px_*_var(--text-scale))] text-rose-700">{error}</p>}
    </div>
  )
}
