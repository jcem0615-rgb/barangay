import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './env.ts'
import { isDatabaseReachable, pool } from './db.ts'
import { authRouter } from './routes/auth.ts'
import { catalogueRouter } from './routes/catalogue.ts'
import { requestsRouter } from './routes/requests.ts'
import { paymentsRouter, paymentWebhookRouter } from './routes/payments.ts'
import { incidentsRouter } from './routes/incidents.ts'
import { appointmentsRouter } from './routes/appointments.ts'
import { feedbackRouter } from './routes/feedback.ts'
import { privacyRouter } from './routes/privacy.ts'
import { staffRouter } from './routes/staff.ts'
import { verifyRouter } from './routes/verify.ts'
import { adminRouter } from './routes/admin.ts'
import { notificationsRouter } from './routes/notifications.ts'
import { MAX_FILE_BYTES } from './uploads.ts'
import { scanningEnabled } from './antivirus.ts'

const app = express()

// Only trust as many forwarding hops as are actually deployed, so the client
// address used for rate limiting can't be spoofed by a header.
app.set('trust proxy', env.trustProxy)
app.disable('x-powered-by')

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Tailwind ships as a stylesheet, but the SPA still injects some
        // inline style; fonts come from Google Fonts.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // The app is same-origin in production; this header would otherwise block
    // the fonts it loads.
    crossOriginEmbedderPolicy: false,
  })
)
app.use(compression())

// CORS only matters when the web app is served from somewhere else (dev, or a
// split deployment). Same-origin production traffic never reaches this.
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    // Without this the browser hides Content-Disposition from JavaScript, and
    // a downloaded document is saved as a generic "document.pdf".
    exposedHeaders: ['Content-Disposition'],
  })
)
// Ahead of the JSON parser on purpose. A signed callback has to be checked
// against the bytes that were actually sent: re-serialising parsed JSON will
// disagree with the sender about key order or whitespace sooner or later, and
// then every real payment fails verification with no visible cause.
app.use('/api/payments/webhook', paymentWebhookRouter)

app.use(express.json({ limit: '256kb' }))

/**
 * Liveness *and* readiness: a process that is up but cannot reach Postgres
 * cannot serve anything, and reporting it healthy would keep a broken instance
 * in the load balancer's rotation.
 */
app.get('/api/health', async (_req, res) => {
  const dbOk = await isDatabaseReachable()
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    database: dbOk ? 'up' : 'unreachable',
    // Visible so a deployment that meant to scan uploads but isn't can be spotted.
    virusScanning: scanningEnabled() ? 'enabled' : 'disabled',
  })
})

app.use('/api/auth', authRouter)
app.use('/api/catalogue', catalogueRouter)
app.use('/api/requests', requestsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/incidents', incidentsRouter)
app.use('/api/appointments', appointmentsRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/privacy', privacyRouter)
app.use('/api/staff', staffRouter)
app.use('/api/verify', verifyRouter)
app.use('/api/admin', adminRouter)
app.use('/api/notifications', notificationsRouter)

// Unknown API routes are an error, never the SPA's index.html — returning HTML
// to a fetch() would surface as a confusing parse error in the client.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
if (env.serveWeb && existsSync(webRoot)) {
  // Hashed assets are immutable; index.html must not be cached or clients keep
  // booting an old bundle after a deploy.
  app.use(
    express.static(webRoot, {
      index: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
        else if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      },
    })
  )
  app.get(/.*/, (_req, res) => {
    // Must go through sendFile's options: it writes its own Cache-Control from
    // maxAge and would overwrite a header set beforehand.
    res.sendFile(join(webRoot, 'index.html'), {
      cacheControl: false,
      headers: { 'Cache-Control': 'no-cache' },
    })
  })
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))
}

// Log the real error server-side; hand the client something it can act on.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // An upload over the size limit is the caller's problem, not a server fault.
  if (err && typeof err === 'object' && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `That file is too large. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.` })
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' })
})

const server = app.listen(env.port, () => {
  console.log(`eLGU API listening on http://localhost:${env.port}`)
  if (env.serveWeb && existsSync(webRoot)) console.log(`serving web app from ${webRoot}`)
})

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * pool. Without this a deploy can cut off a request mid-transaction.
 */
let shuttingDown = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received, shutting down`)

    const forced = setTimeout(() => {
      // A client holding a keep-alive socket open would otherwise stall the
      // deploy indefinitely; cut the remaining sockets and go.
      console.error('shutdown timed out, closing remaining connections')
      server.closeAllConnections()
      pool.end().catch(() => undefined).finally(() => process.exit(1))
    }, 10_000)
    forced.unref()

    server.close(async () => {
      await pool.end().catch(() => undefined)
      clearTimeout(forced)
      process.exit(0)
    })

    // close() alone waits for idle keep-alive sockets to time out on their own.
    // Requests already in flight are untouched and still finish.
    server.closeIdleConnections()
  })
}
