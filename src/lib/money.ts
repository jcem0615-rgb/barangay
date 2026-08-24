/**
 * Peso amounts always render with two decimals. Bare toLocaleString() drops a
 * trailing zero (1850.5 -> "1,850.5"), which reads as a typo on a fee notice.
 */
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
