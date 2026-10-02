// Payments: the one place the client used to tell the server something the
// server should have established itself — and the place where it mattered most,
// because the thing being asserted was money.
import { createHmac } from 'node:crypto'
import { formFiller, payRequest } from './fixtures.mjs'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
const SECRET = process.env.PAYMENT_SECRET ?? 'development-payment-secret'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

/** A signed callback, exactly as the provider sends one. */
const callback = async (payload, { secret = SECRET, timestamp = String(Math.floor(Date.now() / 1000)), signature } = {}) => {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = signature ?? createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')
  const res = await fetch(`${API}/payments/webhook/mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-elgu-signature': sig, 'x-elgu-timestamp': timestamp },
    body: raw,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const form = await formFiller(API)
const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`

const resident = (await j('/auth/register', { method: 'POST', body: {
  email: `pay.${stamp}@example.com`, password: 'bayad-na-2026', fullName: 'Bayani P. Reyes',
  birthDate: '1990-01-01', motherMaidenName: uniq(), residesHere: true,
  philSysId: '3131-4141-5151-6161', barangay: 'Poblacion',
} })).json.token
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@malasiqui.gov.ph', password: process.env.SEED_PASSWORD ?? 'elgu-demo-2026' } })).json.token
const health = (await j('/auth/login', { method: 'POST', body: { email: 'health@malasiqui.gov.ph', password: process.env.SEED_PASSWORD ?? 'elgu-demo-2026' } })).json.token

/** A request the treasury has assessed, ready to pay. */
const assessedRequest = async (fee) => {
  const created = await j('/requests', { method: 'POST', token: resident, body: { serviceId: 'cedula', formValues: form('cedula') } })
  await j(`/staff/requests/${created.json.id}/assess`, { method: 'POST', token: treasury, body: { fee } })
  return created.json
}

console.log('\n== the browser does not decide what anything costs ==')

const req1 = await assessedRequest(250)
const intent = await j('/payments/intents', { method: 'POST', token: resident, body: { requestId: req1.id, amount: 1, amountCentavos: 1 } })
check('an intent is created', intent.status === 201, intent.status)
check('priced from the assessment, not from the body', intent.json.amount === 250, intent.json.amount)
check('and carries a reference the resident can quote', typeof intent.json.reference === 'string' && intent.json.reference.length > 4)

const again = await j('/payments/intents', { method: 'POST', token: resident, body: { requestId: req1.id } })
check('asking twice reuses the open intent rather than stacking a second',
  again.json.reference === intent.json.reference, `${again.json.reference} vs ${intent.json.reference}`)

const stranger = await j('/payments/intents', { method: 'POST', token: treasury, body: { requestId: req1.id } })
check('staff cannot start a resident\'s payment', stranger.status === 403, stranger.status)

console.log('\n== the old route is gone ==')
const old = await j(`/requests/${req1.id}/pay`, { method: 'POST', token: resident, body: { method: 'GCash' } })
check('POST /requests/:id/pay is 410', old.status === 410, old.status)
check('and says where paying moved to', old.json.payAt === '/api/payments/intents', old.json.payAt)

console.log('\n== only a signed callback settles anything ==')

const unsigned = await fetch(`${API}/payments/webhook/mock`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reference: intent.json.reference, eventId: `e${stamp}a`, outcome: 'settled', amountCentavos: 25000 }),
})
check('an unsigned callback is refused', unsigned.status === 400, unsigned.status)

const wrongSecret = await callback(
  { reference: intent.json.reference, eventId: `e${stamp}b`, outcome: 'settled', amountCentavos: 25000 },
  { secret: 'not-the-secret' }
)
check('a callback signed with the wrong secret is refused', wrongSecret.status === 400, wrongSecret.status)

const replayed = await callback(
  { reference: intent.json.reference, eventId: `e${stamp}c`, outcome: 'settled', amountCentavos: 25000 },
  { timestamp: String(Math.floor(Date.now() / 1000) - 4000) }
)
check('a callback outside the replay window is refused', replayed.status === 400, replayed.status)

const stillUnpaid = await j(`/requests/${req1.id}`, { token: resident })
check('after all of that the request is still unpaid', stillUnpaid.json.paid === false)

console.log('\n== the amount is the server\'s ==')

const short = await callback({ reference: intent.json.reference, eventId: `e${stamp}d`, outcome: 'settled', amountCentavos: 100 })
check('a callback for a different amount is accepted but not settled', short.status === 200, short.status)
const afterMismatch = await j(`/requests/${req1.id}`, { token: resident })
check('the request stays unpaid on a mismatch', afterMismatch.json.paid === false)
const mismatchState = await j(`/payments/intents/${intent.json.reference}`, { token: resident })
check('and the payment is flagged for a human', mismatchState.json.status === 'mismatched', mismatchState.json.status)

console.log('\n== a real settlement ==')

const req2 = await assessedRequest(180)
const ref2 = await payRequest(API, resident, req2.id, 'GCash')
const paid = await j(`/requests/${req2.id}`, { token: resident })
check('the request is paid', paid.json.paid === true)
check('and sits on the release step', paid.json.currentStepIndex === 3)
// paid_at is not serialised to the resident, so the clock starting is checked
// by what it produces: an estimate, and no longer waiting on them.
check('the office clock has started',
  paid.json.awaitingResident === false && typeof paid.json.expectedReady?.from === 'string',
  JSON.stringify({ awaitingResident: paid.json.awaitingResident, expectedReady: paid.json.expectedReady }))

const state2 = await j(`/payments/intents/${ref2}`, { token: resident })
check('the payment reads as settled', state2.json.status === 'settled', state2.json.status)

const notifications = await j('/notifications', { token: resident })
check('the resident is told the payment arrived',
  notifications.json.notifications.some((n) => n.kind === 'request_paid'))

console.log('\n== a gateway retrying is normal, not an attack ==')

const settledPayment = await j(`/payments/intents/${ref2}`, { token: resident })
const retry = await callback({
  reference: ref2, eventId: `retry_${stamp}`, outcome: 'settled',
  amountCentavos: Math.round(settledPayment.json.amount * 100),
})
check('a second settled callback is accepted', retry.status === 200, retry.status)
const afterRetry = await j(`/requests/${req2.id}`, { token: resident })
check('and does not pay the request twice', afterRetry.json.paid === true && afterRetry.json.currentStepIndex === 3)

console.log('\n== the mock cannot be used against a real deployment ==')
const notMine = await j(`/payments/mock/${intent.json.reference}/complete`, { method: 'POST', token: treasury, body: {} })
check('staff cannot drive the mock', notMine.status === 403, notMine.status)

console.log('\n== the treasurer\'s book ==')

const today = new Date().toISOString().slice(0, 10)
const book = await j(`/staff/payments?from=${today}&to=${today}`, { token: treasury })
check('the treasury can read it', book.status === 200, book.status)
check('it leads with a total', typeof book.json.total === 'number')
check('the settled payment is in it', book.json.settled.some((row) => row.reference === ref2))
check('every line carries a gateway reference',
  book.json.settled.every((row) => typeof (row.providerRef ?? row.reference) === 'string'))
check('the mismatch is listed as needing a person',
  book.json.unsettled.some((row) => row.reference === intent.json.reference && row.status === 'mismatched'))

check('another office cannot read the treasury book',
  (await j(`/staff/payments?from=${today}&to=${today}`, { token: health })).status === 403)
check('and neither can a resident',
  (await j(`/staff/payments?from=${today}&to=${today}`, { token: resident })).status === 403)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
