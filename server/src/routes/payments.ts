import express, { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { env } from '../env.ts'
import { STEP_ASSESSMENT, STEP_RELEASE } from '../workflow.ts'
import { deliverNotification, recordNotification } from '../notifications.ts'
import {
  MockProvider, PaymentError, newReference, paymentProvider, signPayload,
} from '../payments.ts'
import { toPesos } from '../serialize.ts'

/**
 * The resident-facing half of paying, and the provider-facing half.
 *
 * They are separate routers because they are mounted differently: the webhook
 * needs the raw request body to check a signature, so it goes on before
 * express.json() has had a chance to consume and re-shape it.
 */

export const paymentsRouter = Router()
export const paymentWebhookRouter = Router()

// ---------------------------------------------------------------- the resident

paymentsRouter.use(authenticate, requireRole('resident'))

const intentSchema = z.object({ requestId: z.uuid() })

/**
 * Start a payment.
 *
 * The amount comes off the request's own assessment. Nothing in the body says
 * what it costs, because the browser does not decide that.
 */
paymentsRouter.post('/intents', async (req, res) => {
  const parsed = intentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Which request is this for?' })

  const request = await one<{
    id: string; reference_no: string; fee_centavos: number; paid: boolean
    current_step_index: number; service_name: string
  }>(
    `select r.id, r.reference_no, r.fee_centavos, r.paid, r.current_step_index,
            s.name as service_name
       from requests r join services s on s.id = r.service_id
      where r.id = $1 and r.resident_id = $2`,
    [parsed.data.requestId, req.user!.id]
  )
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.paid) return res.status(409).json({ error: 'This request is already paid.' })
  if (request.current_step_index < STEP_ASSESSMENT) {
    return res.status(409).json({ error: 'Wait for the treasury assessment before paying.' })
  }
  if (request.fee_centavos <= 0) {
    return res.status(409).json({ error: 'This request has nothing to pay.' })
  }

  // An intent already in flight is reused rather than stacked: a resident who
  // taps twice, or comes back to a tab they left open, should land on the same
  // payment rather than create a second one the treasury has to reconcile.
  const existing = await one<{ id: string; reference: string; amount_centavos: number }>(
    `select id, reference, amount_centavos from payments
      where request_id = $1 and status = 'pending'
      order by created_at desc limit 1`,
    [request.id]
  )

  const provider = paymentProvider()
  const reference = existing?.reference ?? newReference()
  const amount = existing?.amount_centavos ?? request.fee_centavos

  const intent = await provider.createIntent({
    reference,
    amountCentavos: amount,
    description: `${request.service_name} (${request.reference_no})`,
    returnUrl: `${req.protocol}://${req.get('host')}/api/payments/return`,
  })

  if (!existing) {
    await query(
      `insert into payments (request_id, resident_id, reference, provider, provider_ref, amount_centavos)
       values ($1, $2, $3, $4, $5, $6)`,
      [request.id, req.user!.id, reference, provider.name, intent.providerRef, amount]
    )
  }

  res.status(201).json({
    reference,
    amount: toPesos(amount),
    provider: provider.name,
    redirectUrl: intent.redirectUrl,
    status: 'pending',
  })
})

/**
 * What the payment screen polls.
 *
 * It polls rather than trusting its own return trip, because the server's
 * record is the only thing that decides whether money arrived.
 */
paymentsRouter.get('/intents/:reference', async (req, res) => {
  const payment = await one<{
    reference: string; status: string; amount_centavos: number
    provider_ref: string | null; method: string | null; request_id: string; note: string | null
  }>(
    `select reference, status, amount_centavos, provider_ref, method, request_id, note
       from payments where reference = $1 and resident_id = $2`,
    [req.params.reference, req.user!.id]
  )
  if (!payment) return res.status(404).json({ error: 'Payment not found.' })
  res.json({
    reference: payment.reference,
    status: payment.status,
    amount: toPesos(payment.amount_centavos),
    providerRef: payment.provider_ref,
    method: payment.method,
    requestId: payment.request_id,
    note: payment.note,
  })
})

/**
 * The development shortcut: "the resident paid".
 *
 * It settles nothing itself. It sends the same signed callback a real gateway
 * would, through the same webhook, so the path exercised in development is the
 * one that runs in production.
 */
paymentsRouter.post('/mock/:reference/complete', async (req, res) => {
  if (env.paymentProvider !== 'mock') {
    return res.status(404).json({ error: 'Not found.' })
  }
  const provider = paymentProvider()
  if (!(provider instanceof MockProvider)) {
    return res.status(404).json({ error: 'Not found.' })
  }

  const payment = await one<{ reference: string; amount_centavos: number; provider_ref: string | null }>(
    `select reference, amount_centavos, provider_ref from payments
      where reference = $1 and resident_id = $2`,
    [req.params.reference, req.user!.id]
  )
  if (!payment) return res.status(404).json({ error: 'Payment not found.' })

  const body = Buffer.from(
    JSON.stringify({
      reference: payment.reference,
      eventId: `evt_${payment.reference}_${Date.now()}`,
      outcome: 'settled',
      // Deliberately the server's figure: the mock cannot be used to settle a
      // different amount than the one that was priced.
      amountCentavos: payment.amount_centavos,
      providerRef: payment.provider_ref,
      method: typeof req.body?.method === 'string' ? req.body.method : 'gcash',
    }),
    'utf8'
  )
  const timestamp = String(Math.floor(Date.now() / 1000))

  const callback = await fetch(
    `${req.protocol}://${req.get('host')}/api/payments/webhook/mock`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-elgu-signature': provider.sign(timestamp, body),
        'x-elgu-timestamp': timestamp,
      },
      body,
    }
  )
  res.status(callback.ok ? 200 : 502).json({ delivered: callback.ok })
})

// ---------------------------------------------------------------- the provider

/**
 * The signed callback. Mounted ahead of express.json() so the signature is
 * checked against the bytes that were actually sent.
 *
 * Idempotency is the provider's normal behaviour rather than an attack: a
 * gateway retries until it gets a 2xx, so the same event arrives more than once
 * as a matter of course. `payment_events` is unique on (provider, event_id), and
 * a partial unique index makes one settled payment per request a database
 * guarantee rather than something this code has to remember.
 */
paymentWebhookRouter.post(
  '/:provider',
  express.raw({ type: '*/*', limit: '64kb' }),
  async (req, res) => {
    const provider = paymentProvider()
    if (req.params.provider !== provider.name) {
      return res.status(404).json({ error: 'Unknown provider.' })
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
    let verified
    try {
      verified = provider.verifyCallback(raw, req.headers)
    } catch (error) {
      // Recorded, not dropped. A run of refusals is either a misconfigured
      // provider or somebody trying it on, and neither is visible otherwise.
      await recordRejected(provider.name, raw, error instanceof PaymentError ? error.message : 'Rejected.')
      return res.status(400).json({ error: 'Callback rejected.' })
    }

    const payment = await one<{
      id: string; request_id: string; resident_id: string; amount_centavos: number; status: string
    }>(
      `select id, request_id, resident_id, amount_centavos, status
         from payments where reference = $1`,
      [verified.reference]
    )
    if (!payment) {
      await recordRejected(provider.name, raw, 'No payment with that reference.', verified.eventId)
      return res.status(404).json({ error: 'Unknown reference.' })
    }

    // The amount is the server's. A callback for a different figure is flagged
    // and left for a human: settling it either short-changes the municipality or
    // overcharges the resident, and both are worse than a row a treasurer sees
    // the same day.
    if (verified.outcome === 'settled' && verified.amountCentavos !== payment.amount_centavos) {
      await transaction(async (client) => {
        await client.query(
          `update payments set status = 'mismatched', note = $2, provider_ref = coalesce($3, provider_ref)
            where id = $1 and status = 'pending'`,
          [
            payment.id,
            `Provider confirmed ${toPesos(verified.amountCentavos)} against ${toPesos(payment.amount_centavos)} assessed.`,
            verified.providerRef,
          ]
        )
        await client.query(
          `insert into payment_events (provider, event_id, payment_id, accepted, reason, payload)
           values ($1, $2, $3, false, $4, $5)
           on conflict (provider, event_id) do nothing`,
          [provider.name, verified.eventId, payment.id, 'Amount does not match the assessment.', safeJson(raw)]
        )
      })
      // 2xx on purpose: the callback was understood and recorded. Telling the
      // gateway to retry would bury the mismatch under duplicates.
      return res.json({ received: true })
    }

    const settled = await transaction(async (client) => {
      const event = await client.query(
        `insert into payment_events (provider, event_id, payment_id, accepted, reason, payload)
         values ($1, $2, $3, true, null, $4)
         on conflict (provider, event_id) do nothing
         returning id`,
        [provider.name, verified.eventId, payment.id, safeJson(raw)]
      )
      // Already seen. The provider is retrying; nothing more to do.
      if (event.rowCount === 0) return null

      if (verified.outcome === 'failed') {
        await client.query(
          `update payments set status = 'failed', note = $2 where id = $1 and status = 'pending'`,
          [payment.id, 'The provider reported a failed payment.']
        )
        return null
      }

      const updated = await client.query(
        `update payments
            set status = 'settled', settled_at = now(),
                provider_ref = coalesce($2, provider_ref), method = coalesce($3, method)
          where id = $1 and status = 'pending'
          returning id`,
        [payment.id, verified.providerRef, verified.method]
      )
      if (updated.rowCount === 0) return null

      const request = await client.query<{ current_step_index: number; reference_no: string }>(
        `update requests
            set paid = true, payment_method = coalesce($2, payment_method), status = 'in_progress',
                current_step_index = $3, updated_at = now(),
                -- The office's clock starts here, not at submission: it has only
                -- now been handed work it can act on.
                paid_at = coalesce(paid_at, now())
          where id = $1
          returning current_step_index, reference_no`,
        [payment.request_id, verified.method, STEP_RELEASE]
      )
      const row = request.rows[0]
      if (!row) return null

      await client.query(
        `insert into request_events (request_id, actor_id, event_type, from_step, to_step, note)
         values ($1, $2, 'paid', $3, $4, $5)`,
        [
          payment.request_id, payment.resident_id, STEP_ASSESSMENT, STEP_RELEASE,
          `Paid ${toPesos(payment.amount_centavos)} via ${verified.method ?? provider.name}`,
        ]
      )

      const notification = {
        userId: payment.resident_id,
        requestId: payment.request_id,
        kind: 'request_paid' as const,
        title: 'Payment received',
        body: `We have received ${toPesos(payment.amount_centavos)} for ${row.reference_no}.`,
      }
      await recordNotification(client, notification)
      return notification
    })

    // After the commit, and not blocking the gateway's response.
    if (settled) void deliverNotification(settled).catch(() => undefined)

    res.json({ received: true })
  }
)

async function recordRejected(
  provider: string,
  raw: Buffer,
  reason: string,
  eventId?: string
): Promise<void> {
  await query(
    `insert into payment_events (provider, event_id, accepted, reason, payload)
     values ($1, $2, false, $3, $4)
     on conflict (provider, event_id) do nothing`,
    [provider, eventId ?? `rejected_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, reason, safeJson(raw)]
  ).catch(() => undefined)
}

/** A rejected body may not be JSON at all; keep it as text rather than lose it. */
function safeJson(raw: Buffer): string {
  const text = raw.toString('utf8').slice(0, 4000)
  try {
    JSON.parse(text)
    return text
  } catch {
    return JSON.stringify({ raw: text })
  }
}
