import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './env.ts'
import { pool, query } from './db.ts'
import {
  loadSession, requireOwner, requireWrite, requireCsrf, csrfToken,
  startSession, endSession, verifyPassword, checkPassword, setPassword, sessionTokenHash,
} from './auth.ts'
import {
  addDeployment, decommission, editDeployment, editDeploymentSchema, eventsFor, checksFor,
  forget, getDeployment, listDeployments, newDeploymentSchema, rotateOpsToken, setStatus,
} from './registry.ts'
import { probeAndRecord, probeAll, startProbing, stopProbing } from './probe.ts'
import { posterHtml } from './poster.ts'
import * as view from './views/pages.ts'
import { one } from './db.ts'
import type { Deployment } from './registry.ts'

/**
 * The owner portal.
 *
 * It holds the registry of who bought the portal, asks each deployment how it
 * is doing, and prints the poster that gets residents onto it. What it
 * deliberately does not hold is anything *from* a customer: no resident, no
 * request, no certificate, and no connection to any deployment's database.
 *
 * That is not caution for its own sake. The portal's entire isolation model is
 * that two municipalities share no rows and no account can see across them; a
 * control plane with every `DATABASE_URL` in it would undo that in one line
 * and become the single most valuable target in the system. So the only thing
 * that ever crosses from a deployment to here is the counts its own ops
 * endpoint publishes, when asked with that deployment's own token.
 */
const app = express()

app.set('trust proxy', env.trustProxy)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The one inline style block in layout.ts, and Google Fonts. No inline
      // script at all: the only script in this console is the poster's print
      // button, which is an attribute on its own page.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}))
app.use(cookieParser())
app.use(express.urlencoded({ extended: false, limit: '64kb' }))
app.use(loadSession)

const html = (res: express.Response, body: string, status = 200) =>
  res.status(status).type('html').send(body)

// ---------------------------------------------------------------- sign in

app.get('/sign-in', (req, res) => {
  if (req.owner) return res.redirect('/')
  html(res, view.signIn({ next: typeof req.query.next === 'string' ? req.query.next : '/' }))
})

/**
 * Deliberately vague on failure.
 *
 * "No such account" tells whoever is guessing which addresses are worth
 * guessing at, and this console's accounts are two directors at a small firm
 * whose addresses are on every proposal they have sent.
 */
app.post('/sign-in', async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase()
  const password = String(req.body.password ?? '')
  const next = typeof req.body.next === 'string' && req.body.next.startsWith('/') ? req.body.next : '/'

  const user = await one<{ id: string; password_hash: string }>(
    `select id, password_hash from owner_users where lower(email) = $1 and deactivated_at is null`,
    [email]
  )
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return html(res, view.signIn({ error: 'That email and password do not match an account.', next }), 401)
  }
  await startSession(res, user.id)
  res.redirect(next)
})

/**
 * Changing your own password, which both roles may do.
 *
 * A viewer's account is still a way into the registry, so being unable to
 * change its password would be the wrong kind of read-only.
 */
app.get('/password', requireOwner, (req, res) => {
  html(res, view.password({
    user: req.owner!, csrf: csrfToken(req),
    ok: typeof req.query.ok === 'string' ? req.query.ok : undefined,
  }))
})

app.post('/password', requireOwner, requireCsrf, async (req, res) => {
  const current = String(req.body.current ?? '')
  const next = String(req.body.next ?? '')
  const confirm = String(req.body.confirm ?? '')
  const fail = (error: string) =>
    html(res, view.password({ user: req.owner!, csrf: csrfToken(req), error }), 400)

  const row = await one<{ password_hash: string }>(
    `select password_hash from owner_users where id = $1`, [req.owner!.id]
  )
  // The current password, every time. A console left open on a desk is the
  // ordinary way an account is taken over.
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return fail('That is not your current password.')
  }
  if (next !== confirm) return fail('The two new passwords do not match.')
  const problem = checkPassword(next)
  if (problem) return fail(problem)
  if (next === current) return fail('That is the password you already have.')

  await setPassword(req.owner!.id, next, sessionTokenHash(req))
  res.redirect(`/password?ok=${encodeURIComponent('Changed. Every other session for this account has been signed out.')}`)
})

app.get('/sign-out', async (req, res) => {
  await endSession(req, res)
  res.redirect('/sign-in')
})

// ------------------------------------------------------------- the registry

app.get('/', requireOwner, async (req, res) => {
  const rows = await listDeployments()
  html(res, view.list({
    user: req.owner!, rows, csrf: csrfToken(req),
    ok: typeof req.query.ok === 'string' ? req.query.ok : undefined,
    error: typeof req.query.error === 'string' ? req.query.error : undefined,
  }))
})

app.get('/activity', requireOwner, async (req, res) => {
  const rows = await query<{
    deployment_id: string | null; deployment_slug: string; kind: string
    summary: string; actor_name: string; created_at: string
  }>(`select deployment_id, deployment_slug, kind, summary, actor_name, created_at
        from deployment_events order by created_at desc limit 200`)
  html(res, view.activity({ user: req.owner!, rows }))
})

app.get('/new', requireWrite, (req, res) => {
  html(res, view.form({ user: req.owner!, csrf: csrfToken(req) }))
})

app.post('/new', requireWrite, requireCsrf, async (req, res) => {
  const body = { ...req.body }
  delete body._csrf
  const parsed = newDeploymentSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return html(res, view.form({
      user: req.owner!, csrf: csrfToken(req), values: body,
      error: first ? `${first.path.join('.') || 'That'}: ${first.message}` : 'Check the form.',
    }), 400)
  }
  try {
    const { deployment, opsToken } = await addDeployment(parsed.data, req.owner!)
    html(res, view.added({ user: req.owner!, d: deployment, opsToken }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add that.'
    html(res, view.form({
      user: req.owner!, csrf: csrfToken(req), values: body,
      // A unique violation here is almost always the real mistake it looks
      // like: a second row for a place that already has an instance.
      error: /duplicate key|unique/.test(message)
        ? 'There is already a deployment for that slug or that place. Two instances pointed at one database is the mistake this refuses.'
        : message,
    }), 400)
  }
})

/** Everything under /d/:id needs the row, so it is loaded once. */
async function withDeployment(
  req: express.Request, res: express.Response
): Promise<Deployment | null> {
  const d = await getDeployment(String(req.params.id))
  if (!d) {
    html(res, view.notFound(req.owner), 404)
    return null
  }
  return d
}

app.get('/d/:id', requireOwner, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  html(res, view.detail({
    user: req.owner!, csrf: csrfToken(req), d,
    events: await eventsFor(d.id),
    checks: await checksFor(d.id),
    ok: typeof req.query.ok === 'string' ? req.query.ok : undefined,
    error: typeof req.query.error === 'string' ? req.query.error : undefined,
  }))
})

app.get('/d/:id/setup', requireOwner, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  html(res, view.setup({ user: req.owner!, d }))
})

/**
 * The poster, which is the whole point of recording the address.
 *
 * It exists the moment a deployment is added — there is no step, no setting
 * and nothing for the office to configure. A PWA has no store listing, so
 * somebody has to tell residents the address, and that somebody is whoever
 * sold them the portal.
 */
app.get('/d/:id/poster', requireOwner, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  html(res, posterHtml(d))
})

app.get('/d/:id/edit', requireWrite, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  html(res, view.form({ user: req.owner!, csrf: csrfToken(req), deployment: d }))
})

app.post('/d/:id/edit', requireWrite, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  const body = { ...req.body }
  delete body._csrf
  const parsed = editDeploymentSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return html(res, view.form({
      user: req.owner!, csrf: csrfToken(req), deployment: d, values: body,
      error: first ? `${first.path.join('.') || 'That'}: ${first.message}` : 'Check the form.',
    }), 400)
  }
  await editDeployment(d.id, parsed.data, req.owner!)
  res.redirect(`/d/${d.id}?ok=${encodeURIComponent('Saved.')}`)
})

app.post('/d/:id/status', requireWrite, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  const status = String(req.body.status ?? '')
  if (!['draft', 'provisioning', 'live', 'suspended'].includes(status)) {
    return res.redirect(`/d/${d.id}?error=${encodeURIComponent('That is not a status.')}`)
  }
  await setStatus(d.id, status as never, req.owner!)
  res.redirect(`/d/${d.id}?ok=${encodeURIComponent(`Marked ${status}.`)}`)
})

app.post('/d/:id/rotate', requireWrite, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  const { deployment, opsToken } = await rotateOpsToken(d.id, req.owner!)
  // Shown on the same once-only screen as a new deployment's, and for the same
  // reason: the old token stops working the moment the instance is updated,
  // and this is the only time the new one can be copied.
  html(res, view.added({ user: req.owner!, d: deployment, opsToken }))
})

app.post('/d/:id/probe', requireOwner, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  const result = await probeAndRecord(d)
  res.redirect(`/d/${d.id}?${result.ok ? 'ok=' + encodeURIComponent('It answered.') : 'error=' + encodeURIComponent(result.error ?? 'It did not answer.')}`)
})

app.post('/probe', requireOwner, requireCsrf, async (_req, res) => {
  const { checked, down, skipped } = await probeAll()
  // Saying how many were skipped, and why. "Checked 0" on a console where two
  // deployments are plainly listed reads as the button not working, which is
  // the same mistake the appointment screen made by putting its refusal seven
  // hundred pixels above the control that caused it.
  const skip = skipped ? ` ${skipped} not stood up yet, so not checked.` : ''
  const summary = checked === 0
    ? `Nothing to check.${skip}`
    : `Checked ${checked}${down ? `, ${down} not answering` : ', all answering'}.${skip}`
  res.redirect(`/?ok=${encodeURIComponent(summary)}`)
})

app.post('/d/:id/decommission', requireWrite, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  const reason = String(req.body.reason ?? '').trim()
  if (!reason) {
    return res.redirect(`/d/${d.id}?error=${encodeURIComponent('Say why. A decommissioned customer with no reason is a row somebody reconstructs from memory a year later.')}`)
  }
  await decommission(d.id, reason, req.owner!)
  res.redirect(`/d/${d.id}?ok=${encodeURIComponent('Decommissioned. Their database was not touched.')}`)
})

app.post('/d/:id/forget', requireWrite, requireCsrf, async (req, res) => {
  const d = await withDeployment(req, res)
  if (!d) return
  if (String(req.body.confirm ?? '').trim() !== d.slug) {
    return res.redirect(`/d/${d.id}?error=${encodeURIComponent('That did not match the slug, so nothing was removed.')}`)
  }
  try {
    const slug = await forget(d.id, req.owner!)
    res.redirect(`/?ok=${encodeURIComponent(`Removed ${slug} from the registry. The activity log kept its history.`)}`)
  } catch (err) {
    res.redirect(`/d/${d.id}?error=${encodeURIComponent(err instanceof Error ? err.message : 'Could not remove that.')}`)
  }
})

// ------------------------------------------------------------------ health

/**
 * A favicon, so the console does not log a 404 on every page.
 *
 * Inline rather than a file, because this service has no static directory at
 * all and adding one to serve nineteen bytes would be the wrong shape.
 */
app.get('/favicon.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="#111c44"/>` +
    `<circle cx="16" cy="16" r="9" fill="none" stroke="#fbbf24" stroke-width="2.4"/>` +
    `<circle cx="16" cy="16" r="3.4" fill="#fbbf24"/></svg>`
  )
})

app.get('/health', async (_req, res) => {
  try {
    await query('select 1')
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

app.use((_req, res) => html(res, view.notFound(), 404))

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  html(res, view.notFound(), 500)
})

const server = app.listen(env.port, () => {
  console.log(`eLGU owner portal on http://localhost:${env.port}`)
  startProbing()
})

const shutdown = () => {
  stopProbing()
  server.close(() => pool.end().then(() => process.exit(0)))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
