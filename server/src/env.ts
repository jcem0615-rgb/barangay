import 'dotenv/config'
import { configuredTier, productName } from './deployment.ts'

/**
 * The host this deployment actually answers on, taken from `PUBLIC_URL`.
 *
 * It is what the generated from-address and push contact address are built
 * from, so a deployment that never sets `MAIL_FROM` still sends as itself
 * rather than as somebody else. The old defaults were sample data — a real
 * `@malasiqui.gov.ph` address — which meant a barangay in another province
 * sent its password-reset mail signed as another town's municipal portal.
 * Falling back to `localhost` is obviously a development copy; falling back
 * to a real LGU's domain is a claim.
 */
function publicHost(raw: string): string {
  try {
    return new URL(raw).hostname || 'localhost'
  } catch {
    return 'localhost'
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy server/.env.example to server/.env and fill it in.`
    )
  }
  return value
}

const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const HOST = publicHost(PUBLIC_URL)

export const env = {
  databaseUrl: required('DATABASE_URL'),
  // No fallback on purpose: a default signing secret would let anyone mint a
  // valid staff token against a deployed server.
  jwtSecret: required('JWT_SECRET'),
  // localhost and 127.0.0.1 are different origins to a browser, so allow both
  // by default — otherwise dev hits a CORS wall depending on which URL is used.
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  port: Number(process.env.PORT ?? 4000),
  /**
   * How many reverse proxies sit in front of this server. Left at 0, express
   * ignores X-Forwarded-For and attributes attempts to the socket address.
   * Set it to the real hop count when deploying behind a load balancer —
   * setting it too high lets a client forge the address the IP limit counts.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  /**
   * The payment gateway. `mock` is the development provider: it signs and
   * verifies like a real one but takes no money, and it exposes a route that
   * settles a payment without one being made — so a production deployment must
   * set this to a real implementation.
   */
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock',
  /**
   * The shared secret the gateway signs its callbacks with. Development falls
   * back to a fixed string so the flow is clickable out of the box; production
   * must set a real one, and the server refuses to start without it.
   *
   * **Only where the deployment can actually take money.** A barangay
   * deployment settles its fees at the hall and the payments router is not
   * mounted there at all, so demanding a gateway secret from it is refusing to
   * start over a subsystem that does not exist — the first thing a barangay
   * buying this would hit, and with nothing in the message to say it is
   * irrelevant to them.
   */
  paymentSecret:
    process.env.PAYMENT_SECRET ??
    (process.env.NODE_ENV === 'production' && configuredTier() === 'municipal'
      ? required('PAYMENT_SECRET')
      : 'development-payment-secret'),
  isProduction: process.env.NODE_ENV === 'production',
  /**
   * Serve the built web app from this server. Same-origin means no CORS to get
   * wrong in production, and one thing to deploy instead of two.
   */
  serveWeb: process.env.SERVE_WEB !== 'false',
  /**
   * Directory for resident-uploaded attachments. In a container this must be a
   * mounted volume, or uploads are lost on the next deploy.
   */
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  /**
   * clamd for scanning uploads. Unset means no scanning — fine for
   * development, not for a deployment that accepts files from the public.
   */
  clamavHost: process.env.CLAMAV_HOST || undefined,
  clamavPort: Number(process.env.CLAMAV_PORT ?? 3310),
  clamavTimeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS ?? 15000),

  /** 'console' | 'file' | 'smtp'. Anything public needs 'smtp'. */
  mailTransport: (process.env.MAIL_TRANSPORT ?? (process.env.SMTP_URL ? 'smtp' : 'console')) as
    'console' | 'file' | 'smtp',
  smtpUrl: process.env.SMTP_URL || undefined,
  mailOutbox: process.env.MAIL_OUTBOX || undefined,
  mailFrom: process.env.MAIL_FROM ?? `${productName()} <no-reply@${HOST}>`,
  /**
   * Public base URL of the web app, used to build the reset link. Must be the
   * address residents actually reach, not the server's own hostname.
   */
  publicUrl: PUBLIC_URL,

  // Web Push. Absent means push is simply off — the app still records every
  // notification and still sends mail, so a deployment without these loses a
  // channel rather than the feature.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  // Who a push service should contact about a misbehaving sender.
  vapidSubject: process.env.VAPID_SUBJECT ?? `mailto:dpo@${HOST}`,

  /**
   * The bearer token the owner portal calls `/api/ops/status` with.
   *
   * Unset means the ops router is **not mounted at all**, so a deployment
   * nobody monitors has no ops surface to attack — the same rule the hall's
   * routers follow in barangay tier. It is per deployment and is not a
   * password anybody types: generate it with `openssl rand -hex 32`.
   */
  opsToken: process.env.OPS_TOKEN || undefined,

  /** 'off' | 'log' | 'http'. SMS costs money per message, so it is opt-in. */
  smsTransport: (process.env.SMS_TRANSPORT ?? 'off') as 'off' | 'log' | 'http',
  smsUrl: process.env.SMS_URL || undefined,
  smsApiKey: process.env.SMS_API_KEY || undefined,
  smsSender: process.env.SMS_SENDER ?? 'eLGU',
}
