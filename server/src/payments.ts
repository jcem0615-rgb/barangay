import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env.ts'

/**
 * Taking money.
 *
 * The shape here is the one every gateway expects, and the reason it looks the
 * same everywhere is that every other shape is broken:
 *
 *   1. The server creates an **intent** for an amount *it* read off the
 *      request's assessment.
 *   2. The resident pays at the provider. This app is not involved.
 *   3. The provider calls back, **signed**. The server verifies, then settles.
 *
 * Nothing the browser sends moves a peso. A resident who closes the tab at the
 * gateway is still paid up; one who forges the return trip is not.
 */

/** Seconds a signed callback stays acceptable, to bound replay. */
export const WEBHOOK_TOLERANCE_SECONDS = 300

export interface PaymentIntent {
  /** Where to send the resident. */
  redirectUrl: string
  /** The provider's own id for this payment, when it issues one up front. */
  providerRef: string | null
}

export interface VerifiedCallback {
  /** Our reference, which is what the intent handed the provider. */
  reference: string
  /** The provider's event id, so a retried delivery settles once. */
  eventId: string
  outcome: 'settled' | 'failed'
  amountCentavos: number
  providerRef: string | null
  method: string | null
}

export interface PaymentProvider {
  readonly name: string
  /** Price is the server's; this only arranges where the resident pays it. */
  createIntent(input: {
    reference: string
    amountCentavos: number
    description: string
    returnUrl: string
  }): Promise<PaymentIntent>
  /**
   * Verify a callback against the raw request body.
   *
   * Raw, not parsed-and-re-serialised: re-serialising JSON to check a signature
   * will disagree with the sender about key order or whitespace sooner or
   * later, and then every real payment fails verification with no visible
   * cause. Throws on anything it will not accept.
   */
  verifyCallback(raw: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedCallback
}

/** Our own reference. Short enough to read down a phone line. */
export function newReference(): string {
  return `PAY-${randomBytes(5).toString('hex').toUpperCase()}`
}

export function signPayload(secret: string, timestamp: string, raw: Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')
}

/**
 * Constant-time comparison, with a length check first: timingSafeEqual throws
 * on a length mismatch, and that throw is itself a timing signal.
 */
export function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export class PaymentError extends Error {}

/**
 * The development provider.
 *
 * It signs and verifies exactly as a real gateway does — same headers, same
 * HMAC over the raw body, same replay window — so what runs in development is
 * what runs in production. What it does not do is take money.
 *
 * Its "the resident paid" route is refused outright unless PAYMENT_PROVIDER is
 * `mock`, and it settles nothing itself: it sends the same signed callback a
 * real gateway would.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock'
  private readonly secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  async createIntent(input: {
    reference: string
    amountCentavos: number
    description: string
    returnUrl: string
  }): Promise<PaymentIntent> {
    // A real provider hosts this page. The mock points back at the app, which
    // is what makes the flow clickable without a gateway.
    const url = new URL(input.returnUrl)
    url.searchParams.set('reference', input.reference)
    return { redirectUrl: url.toString(), providerRef: `mock_${input.reference}` }
  }

  verifyCallback(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>
  ): VerifiedCallback {
    const signature = header(headers, 'x-elgu-signature')
    const timestamp = header(headers, 'x-elgu-timestamp')
    if (!signature || !timestamp) throw new PaymentError('Missing signature headers.')

    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) {
      throw new PaymentError('Callback timestamp is outside the accepted window.')
    }
    if (!signaturesMatch(signature, signPayload(this.secret, timestamp, raw))) {
      throw new PaymentError('Signature does not match.')
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new PaymentError('Callback body is not JSON.')
    }

    const reference = typeof body.reference === 'string' ? body.reference : null
    const eventId = typeof body.eventId === 'string' ? body.eventId : null
    const outcome = body.outcome === 'settled' || body.outcome === 'failed' ? body.outcome : null
    const amount = typeof body.amountCentavos === 'number' ? body.amountCentavos : null
    if (!reference || !eventId || !outcome || amount === null || !Number.isInteger(amount)) {
      throw new PaymentError('Callback is missing required fields.')
    }

    return {
      reference,
      eventId,
      outcome,
      amountCentavos: amount,
      providerRef: typeof body.providerRef === 'string' ? body.providerRef : null,
      method: typeof body.method === 'string' ? body.method : null,
    }
  }

  /** Only the mock has this: it is how the development flow produces a callback. */
  sign(timestamp: string, raw: Buffer): string {
    return signPayload(this.secret, timestamp, raw)
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name]
  if (Array.isArray(value)) return value[0] ?? null
  return typeof value === 'string' ? value : null
}

let provider: PaymentProvider | null = null

/**
 * The configured provider.
 *
 * Adding GCash, Maya or Landbank means implementing `PaymentProvider` and
 * setting two environment variables; nothing else about the flow changes.
 */
export function paymentProvider(): PaymentProvider {
  if (provider) return provider
  switch (env.paymentProvider) {
    case 'mock':
      provider = new MockProvider(env.paymentSecret)
      return provider
    default:
      throw new Error(
        `PAYMENT_PROVIDER="${env.paymentProvider}" is not implemented. ` +
          'Implement PaymentProvider for your gateway, or set it to "mock" in development.'
      )
  }
}

/** Tests swap the configured provider underneath a running process. */
export function resetPaymentProvider(): void {
  provider = null
}
