import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set. Copy owner/.env.example to owner/.env and fill it in.`)
  }
  return value
}

/**
 * The owner service's own configuration.
 *
 * It is deliberately short. This service does one job — keep the registry of
 * who bought the portal and ask each deployment how it is doing — and the less
 * it is configured to do, the less there is to get wrong in the one place that
 * holds every customer's ops token.
 */
export const env = {
  /** Its own database. Never a customer's. */
  databaseUrl: required('OWNER_DATABASE_URL'),

  /**
   * Seals each deployment's ops token at rest.
   *
   * A password is hashed because nobody ever needs it back; an ops token has
   * to be *presented* to the deployment, so it must be recoverable. Encrypting
   * it means a dump of this database on its own is not a working key to every
   * customer's status endpoint. 32 bytes, hex: `openssl rand -hex 32`.
   */
  tokenKey: required('OWNER_TOKEN_KEY'),

  /** Signs nothing; sessions are random tokens with only their hash stored. */
  port: Number(process.env.PORT ?? 4500),

  /**
   * How often the prober wakes. Deployments are municipal halls — they do not
   * change by the second, and polling hard from one box is how a monitor
   * becomes the thing that takes a customer down. Five minutes by default.
   */
  probeIntervalMs: Number(process.env.OWNER_PROBE_INTERVAL_MS ?? 5 * 60_000),
  /** How long to wait on a deployment before calling it unreachable. */
  probeTimeoutMs: Number(process.env.OWNER_PROBE_TIMEOUT_MS ?? 8_000),

  /** How long a sign-in lasts. Shorter than the portal's own 12 hours. */
  sessionHours: Number(process.env.OWNER_SESSION_HOURS ?? 8),

  isProduction: process.env.NODE_ENV === 'production',

  /** Behind a proxy, how many hops to trust for the client address. */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
}
