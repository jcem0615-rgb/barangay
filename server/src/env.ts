import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy server/.env.example to server/.env and fill it in.`
    )
  }
  return value
}

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
}
