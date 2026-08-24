import express from 'express'
import cors from 'cors'
import { env } from './env.ts'
import { authRouter } from './routes/auth.ts'
import { catalogueRouter } from './routes/catalogue.ts'
import { requestsRouter } from './routes/requests.ts'
import { staffRouter } from './routes/staff.ts'

const app = express()

app.use(cors({ origin: env.corsOrigins, credentials: true }))
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/catalogue', catalogueRouter)
app.use('/api/requests', requestsRouter)
app.use('/api/staff', staffRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))

// Log the real error server-side; hand the client something it can act on.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' })
})

app.listen(env.port, () => {
  console.log(`eLGU API listening on http://localhost:${env.port}`)
})
