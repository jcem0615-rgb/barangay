import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, Loader2, ScanLine, X, XCircle } from 'lucide-react'
import { api, ApiError, type VerifyResult } from '../lib/api'
import { useT } from '../lib/i18n'
import { useCatalogue } from '../lib/catalogue'
import LanguageToggle from '../components/LanguageToggle'

/**
 * The public document check.
 *
 * Every PDF this app issues has carried a verification code since the first
 * release, and `/api/verify/:code` has answered for it just as long — but
 * nothing in the app ever called it, so in practice the code on a permit was
 * checkable only by somebody who knew to open a JSON endpoint by hand. This is
 * the screen the QR on the paper now leads to.
 *
 * **It requires no account, on purpose.** The people who need to check a permit
 * are a bank, an employer, a barangay clerk and a counter in another office —
 * none of whom have a login here, and a check that needs one is a check that
 * does not happen. Nothing is disclosed that the holder of the paper does not
 * already have in their hand, and the codes are long and random, so the
 * endpoint cannot be walked.
 *
 * **What it proves and what it does not.** It confirms that the office issued
 * this reference and says what the office recorded, which is what catches an
 * altered printout. It cannot catch a photocopy — the copy carries a genuine
 * code and verifies genuinely — so the screen says so in as many words and
 * tells the reader to match the name against an ID. Pretending otherwise would
 * be worse than not checking at all.
 */
export default function VerifyDocument({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useT()
  const { municipality } = useCatalogue()
  const [typed, setTyped] = useState(code)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async (value: string) => {
    const trimmed = value.trim().toUpperCase()
    if (!trimmed) {
      setError(t('docCheck.enterCode'))
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.verify(trimmed))
    } catch (err) {
      // A 404 is an answer, not a failure: it means no record carries that
      // code, which is exactly what somebody checking needs to be told.
      if (err instanceof ApiError && err.status === 404) setResult({ valid: false })
      else setError(t('docCheck.unreachable'))
    } finally {
      setBusy(false)
    }
  }, [t])

  // Runs on arrival, because somebody who scanned a QR has already asked the
  // question — making them press a button to repeat it would be ceremony.
  useEffect(() => { void check(code) }, [code, check])

  return (
    <div className="min-h-dvh bg-slate-canvas">
      <div className="mx-auto max-w-[430px] px-4 pb-16 pt-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-display text-[calc(17px_*_var(--text-scale))] font-bold text-navy-950">
              <ScanLine size={18} className="text-navy-800" /> {t('docCheck.title')}
            </p>
            <p className="mt-0.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-500">
              {municipality ? `${municipality.name}, ${municipality.province}` : t('docCheck.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('docCheck.close')}
            className="tap-target -mr-1 flex items-center gap-1 rounded-xl px-2 py-1 text-[calc(12.5px_*_var(--text-scale))] font-medium text-slate-500"
          >
            <X size={16} /> {t('docCheck.close')}
          </button>
        </header>

        {busy && (
          <p className="flex items-center gap-2 rounded-2xl bg-white px-4 py-5 text-[calc(13.5px_*_var(--text-scale))] text-slate-600 shadow-sm">
            <Loader2 size={16} className="animate-spin text-navy-800" /> {t('docCheck.checking')}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-[calc(13px_*_var(--text-scale))] text-rose-700">
            {error}
          </p>
        )}

        {!busy && result && (result.valid ? <Found result={result} /> : <NotFound />)}
        {!busy && result?.valid && <Checks count={result.checks} />}

        {/* Typing it in, for a creased QR or a document printed before this. */}
        <form
          className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"
          onSubmit={(e) => { e.preventDefault(); void check(typed) }}
        >
          <label className="block">
            <span className="mb-1 block text-[calc(12.5px_*_var(--text-scale))] font-semibold text-navy-950">
              {t('docCheck.codeLabel')}
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-mono text-[calc(14px_*_var(--text-scale))] uppercase tracking-wide text-navy-950 outline-none transition focus:border-navy-600 focus:bg-white"
            />
            <span className="mt-1 block text-[calc(11.5px_*_var(--text-scale))] text-slate-500">
              {t('docCheck.codeHint')}
            </span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="tap-target mt-3 w-full rounded-xl bg-navy-800 py-3 text-[calc(14px_*_var(--text-scale))] font-semibold text-white transition active:bg-navy-900 disabled:opacity-60"
          >
            {result ? t('docCheck.checkAnother') : t('docCheck.check')}
          </button>
        </form>

        <div className="mt-4 flex justify-center">
          <LanguageToggle compact />
        </div>
      </div>
    </div>
  )
}

/**
 * How often this code has been checked.
 *
 * The one thing on this screen that speaks to a *copy*, which the check itself
 * cannot catch: a photocopy carries a genuine code and verifies genuinely. A
 * document is normally checked once or twice in its life, when its holder is
 * asked to prove it — so a high count is the only visible sign that more than
 * one copy is being presented.
 *
 * Shown to whoever is checking, not kept for the console alone: the person
 * deciding whether to accept the paper is the one who can act on it, and it is
 * weak information to a forger, who already knows what they printed.
 *
 * Deliberately outside the verdict card. It is a hint, not a finding — a busy
 * permit and a copied one look the same from here, and dressing it as a verdict
 * would have somebody refuse a genuine document over it.
 */
function Checks({ count }: { count: number | undefined }) {
  const { t } = useT()
  if (!count) return null
  const text =
    count === 1 ? t('docCheck.checksOne')
      : count <= 5 ? t('docCheck.checksFew', { count: String(count) })
        : t('docCheck.checksMany', { count: String(count) })

  return (
    <p className={`mt-3 rounded-xl px-3 py-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug ${
      count > 5 ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600'
    }`}>
      {text}
    </p>
  )
}

function NotFound() {
  const { t } = useT()
  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 font-display text-[calc(16px_*_var(--text-scale))] font-bold text-rose-700">
        <XCircle size={20} /> {t('docCheck.notFoundTitle')}
      </p>
      <p className="mt-2 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
        {t('docCheck.notFoundBlurb')}
      </p>
    </section>
  )
}

function Found({ result }: { result: VerifyResult }) {
  const { t, locale } = useT()

  const day = (value: string | null | undefined) => {
    if (!value) return null
    // A `date` column arrives as YYYY-MM-DD and must not be shifted by a time
    // zone; a timestamp arrives in full. Both render as the same long date.
    const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const kind =
    result.kind === 'receipt' ? t('docCheck.kindReceipt')
      : result.kind === 'barangay_certificate' ? t('docCheck.kindCertificate')
        : t('docCheck.kindDocument')

  const status =
    result.status === 'settled' ? t('docCheck.statusPaid')
      : result.status === 'rejected' ? t('docCheck.statusNotIssued')
        : t('docCheck.statusReleased')

  // A receipt's type *is* "Official Receipt", so the row would read the kind
  // twice; the heading above already says what this is.
  const namesItself = (result.documentType ?? '').trim().toLowerCase() === kind.trim().toLowerCase()

  const rows: Array<[string, string | null]> = [
    // The document's own name first: it is what somebody is holding, and the
    // catalogue writes it the way a counter says it, in both languages.
    [kind, namesItself ? null : result.documentType ?? null],
    [t('docCheck.reference'), result.referenceNo ?? null],
    [t('docCheck.issuedTo'), result.issuedTo ?? null],
    [t('docCheck.issuedBy'), result.issuedBy ?? null],
    [t('docCheck.issuedOn'), day(result.issuedAt)],
    ...(result.kind === 'barangay_certificate'
      ? ([[t('docCheck.validUntil'), day(result.validUntil)]] as Array<[string, string | null]>)
      : []),
    ...(result.kind === 'receipt'
      ? ([
          [t('docCheck.particulars'), result.particulars ?? null],
          [
            t('docCheck.amount'),
            result.amount === undefined
              ? null
              : `PHP ${result.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          ],
        ] as Array<[string, string | null]>)
      : []),
    // The request's own status is left off a withdrawn document: "Released"
    // beside "Withdrawn" reads as a contradiction, and the withdrawal is the
    // status that decides what the counter does.
    ...(result.revoked ? [] : ([[t('docCheck.statusLabel'), status]] as Array<[string, string | null]>)),
  ]

  /*
   * Withdrawn is its own verdict, and it is red rather than amber.
   *
   * Lapsed is amber: a real document whose period ran out, and the holder needs
   * a fresh one. Withdrawn is the office saying this must not be accepted at
   * all, which is the same thing a counter does about a forgery even though the
   * document is genuine. Reporting both as one "not valid" would lose the
   * difference that decides what the clerk says next.
   */
  if (result.revoked) {
    return (
      <section className="rounded-2xl border-2 border-rose-300 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 font-display text-[calc(16px_*_var(--text-scale))] font-bold text-rose-700">
          <Ban size={20} /> {t('docCheck.revokedTitle')}
        </p>
        <p className="mt-2 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
          {t('docCheck.revokedBlurb')}
        </p>
        {/*
          Whether a replacement exists, which is the difference between "do not
          accept this" and "do not accept this, ask them for the current one".
          Withdrawing in error and reissuing is the ordinary case, so the person
          at the counter needs the second answer rather than the first.
        */}
        {result.replaced && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-navy-900">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            {t('docCheck.replaced')}
          </p>
        )}
        <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {[
            ...rows,
            [t('docCheck.revokedOn'), day(result.revokedAt)] as [string, string | null],
            [t('docCheck.revokedReason'), result.revokedReason ?? null] as [string, string | null],
          ].filter(([, value]) => value !== null).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{label}</dt>
              <dd className="min-w-0 text-right text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 font-display text-[calc(16px_*_var(--text-scale))] font-bold text-emerald-800">
        <CheckCircle2 size={20} /> {t('docCheck.foundTitle')}
      </p>
      <p className="mt-2 text-[calc(13px_*_var(--text-scale))] leading-snug text-slate-600">
        {t('docCheck.foundBlurb')}
      </p>

      <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
        {rows.filter(([, value]) => value !== null).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-[calc(12.5px_*_var(--text-scale))] text-slate-500">{label}</dt>
            <dd className="min-w-0 text-right text-[calc(13.5px_*_var(--text-scale))] font-semibold text-navy-950">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        Lapsed is amber and in words, never colour alone — the rule the workflow
        tracker and the notice board already follow. A lapsed certificate is not
        a forgery; it is a real one somebody needs to replace.
      */}
      {result.expired && result.validUntil && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-amber-900">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          {t('docCheck.lapsed', {
            date: new Date(`${result.validUntil}T00:00:00`).toLocaleDateString(locale, {
              year: 'numeric', month: 'long', day: 'numeric',
            }),
          })}
        </p>
      )}

      {/*
        A replacement for one that was withdrawn. Said plainly, because two
        papers for the same reference may both be in circulation and only this
        one is good — a clerk who was shown the other one needs to know which
        they are now holding.
      */}
      {result.reissued && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-navy-900">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          {t('docCheck.isReplacement')}
        </p>
      )}

      {/*
        The honest limit, and it belongs on this screen rather than in a manual:
        the person reading it is about to decide whether to accept a document,
        and a green tick on its own would tell them more than this check knows.
      */}
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-[calc(12.5px_*_var(--text-scale))] leading-snug text-slate-600">
        <AlertTriangle size={15} className="mt-px shrink-0" />
        {t('docCheck.copyWarning')}
      </p>
    </section>
  )
}
