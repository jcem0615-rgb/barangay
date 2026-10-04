/**
 * How long a barangay certificate is good for, said the way a person would say
 * it.
 *
 * The catalogue stores days because a day is the only unit that divides
 * cleanly and the server's arithmetic needs one. Nobody says "180 days" at a
 * counter, so the round cases are spelled as months and a year and the rest
 * falls back to days. `formatProcessingTime` makes the same trade for the other
 * direction: store the number, render the sentence.
 */

/**
 * Narrowed to the keys this helper actually asks for, like
 * `formatProcessingTime` — so a renamed string is a compile error here rather
 * than a missing sentence on a screen.
 */
type Translate = (
  key: 'brgy.validFor' | 'brgy.validForYear' | 'brgy.validForMonths',
  vars?: Record<string, string>
) => string

export function formatValidity(days: number | null | undefined, t: Translate): string | null {
  if (days === null || days === undefined) return null
  if (days === 365) return t('brgy.validForYear')
  // Months only where the division is exact — "Good for 2 months" from 61 days
  // is a rounding somebody will later be held to at a window.
  if (days % 30 === 0 && days >= 30) return t('brgy.validForMonths', { months: String(days / 30) })
  return t('brgy.validFor', { days: String(days) })
}

/**
 * A lapse date, rendered as a day. The stored value is already a calendar day
 * (`date`, not a timestamp), so it is split by hand rather than passed through
 * `new Date()` — parsing "2026-10-04" as UTC midnight and formatting it in
 * Manila would print the day before.
 */
export function formatValidUntil(iso: string, locale: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
