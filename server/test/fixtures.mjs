/**
 * Valid submissions, built from the catalogue the API is actually serving.
 *
 * The tests used to hand-write partial forms, which worked only because the
 * server did not enforce required fields. Deriving them from `/api/catalogue`
 * means a fixture can never drift from the service it is filling in.
 */
export async function formFiller(API) {
  const catalogue = await (await fetch(`${API}/catalogue`)).json()

  const sample = (field) => {
    if (field.type === 'select') return field.options?.[0] ?? 'Other'
    if (field.type === 'number') return '1000'
    if (field.type === 'date') return '1990-04-17'
    return `Sample ${field.label ?? field.id}`
  }

  /** Every required field filled, plus whatever the caller wants to pin down. */
  return function form(serviceId, overrides = {}) {
    const service = catalogue.services.find((s) => s.id === serviceId)
    if (!service) throw new Error(`no such service: ${serviceId}`)
    const values = {}
    for (const field of service.fields) {
      if (field.required) values[field.id] = sample(field)
    }
    return { ...values, ...overrides }
  }
}
