import { connect } from 'node:net'
import { env } from './env.ts'

/**
 * SMS delivery.
 *
 * In the Philippines a text reaches a resident far more reliably than email, so
 * this is the channel that matters most for an LGU — but it costs money per
 * message and needs an account with a provider, so it is off unless configured.
 *
 * `log` prints the message (development). `http` posts to a provider's REST
 * endpoint; the shape below matches Semaphore, which most Philippine LGUs use,
 * and Twilio-style providers differ only in field names.
 */

export interface Sms {
  to: string
  text: string
}

export const smsEnabled = () => env.smsTransport !== 'off'

export async function sendSms(sms: Sms): Promise<void> {
  switch (env.smsTransport) {
    case 'http': {
      const res = await fetch(env.smsUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: env.smsApiKey,
          number: sms.to,
          message: sms.text,
          sendername: env.smsSender,
        }),
      })
      if (!res.ok) {
        throw new Error(`sms provider returned ${res.status}`)
      }
      return
    }
    case 'log':
      console.log(`[sms] to=${sms.to}: ${sms.text}`)
      return
    default:
      return
  }
}

/** Texts are billed per 160 characters, so they are kept to one segment. */
export function trimForSms(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
