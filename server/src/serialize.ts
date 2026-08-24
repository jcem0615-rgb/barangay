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
  updated_at: Date
  service_name?: string
  resident_name?: string
}

/** Centavos live in the database; pesos cross the wire. */
export const toPesos = (centavos: number) => centavos / 100
export const toCentavos = (pesos: number) => Math.round(pesos * 100)

export function serializeRequest(row: RequestRow) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    serviceId: row.service_id,
    serviceName: row.service_name ?? '',
    departmentId: row.department_id,
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
  r.rejection_reason, r.submitted_at, r.updated_at, s.name as service_name
`
