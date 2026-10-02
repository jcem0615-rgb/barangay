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

/**
 * Pay a request the way the app does: ask the server for an intent, then let
 * the development provider send the signed callback a real gateway would.
 *
 * Tests used to POST /requests/:id/pay, which is exactly the route that is gone
 * — it marked a request paid because the caller said so. Going through the real
 * flow here means a suite that only needs a paid request cannot accidentally
 * keep the old shortcut alive.
 */
export async function payRequest(API, token, requestId, method = 'GCash') {
  const call = async (path, options = {}) => {
    const res = await fetch(API + path, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }

  const intent = await call('/payments/intents', { method: 'POST', body: { requestId } })
  if (intent.status !== 201) {
    throw new Error(`could not start payment: ${intent.status} ${JSON.stringify(intent.json)}`)
  }
  const done = await call(`/payments/mock/${intent.json.reference}/complete`, {
    method: 'POST',
    body: { method },
  })
  if (done.status !== 200) {
    throw new Error(`payment did not settle: ${done.status} ${JSON.stringify(done.json)}`)
  }
  return intent.json.reference
}
