import { estimateReady } from './schedule.ts'

export interface RequestRow {
  id: string
  reference_no: string
  resident_id: string
  service_id: string
  department_id: string
  status: string
  current_step_index: number
  fee_centavos: number
  paid: boolean
  payment_method: string | null
  form_values: Record<string, string>
  rejection_reason: string | null
  submitted_at: Date
  paid_at: Date | null
  updated_at: Date
  service_name?: string
  resident_name?: string
  requires_payment?: boolean
  processing_days_min?: number
  processing_days_max?: number
}

/** Centavos live in the database; pesos cross the wire. */
export const toPesos = (centavos: number) => centavos / 100
export const toCentavos = (pesos: number) => Math.round(pesos * 100)

/**
 * The synchronous shape. `withReadyDates` adds the expected-ready estimate,
 * which needs the holiday calendar and so cannot be worked out inline.
 */
export function serializeRequest(row: RequestRow) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    serviceId: row.service_id,
    serviceName: row.service_name ?? '',
    categoryId: row.department_id,
    status: row.status,
    currentStepIndex: row.current_step_index,
    fee: toPesos(row.fee_centavos),
    paid: row.paid,
    paymentMethod: row.payment_method ?? undefined,
    formValues: row.form_values,
    rejectionReason: row.rejection_reason ?? undefined,
    dateSubmitted: row.submitted_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.resident_name ? { residentName: row.resident_name } : {}),
  }
}

export const REQUEST_SELECT = `
  r.id, r.reference_no, r.resident_id, r.service_id, r.department_id, r.status,
  r.current_step_index, r.fee_centavos, r.paid, r.payment_method, r.form_values,
  r.rejection_reason, r.submitted_at, r.paid_at, r.updated_at,
  s.name as service_name, s.requires_payment,
  s.processing_days_min, s.processing_days_max
`

/**
 * Serializes rows with their expected-ready dates. Async because the estimate
 * needs the holiday calendar; the calendar is cached, so a list of requests
 * costs one lookup rather than one per row.
 */
export async function withReadyDates(rows: RequestRow[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...serializeRequest(row),
      ...(await estimateReady({
        status: row.status,
        paid: row.paid,
        requiresPayment: row.requires_payment ?? false,
        submittedAt: row.submitted_at,
        paidAt: row.paid_at,
        daysMin: row.processing_days_min ?? 0,
        daysMax: row.processing_days_max ?? 0,
      })),
    }))
  )
}

/** The single-row case, which is most of the call sites. */
export async function serializeWithReady(row: RequestRow) {
  return (await withReadyDates([row]))[0]!
}
