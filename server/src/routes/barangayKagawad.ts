import { Router } from 'express'
import { one, query } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { toPesos } from '../serialize.ts'
import { barangayFigures } from './households.ts'
import { liveAnnouncementsFor } from './announcements.ts'

/**
 * The Sangguniang Barangay member's view.
 *
 * **This is a separate router, and that is the whole security design.** The
 * clerk's router opens with `requireRole('barangay_admin','barangay_officer')`
 * across everything, so every route on it — including every route somebody adds
 * next year without thinking about this — is closed to a kagawad by default.
 * Putting a third role on that gate and then carving it back out route by route
 * would make the blotter one forgotten `requireRole` away from a councillor,
 * and a forgotten gate is exactly the thing that happens. Same reasoning as the
 * barangay console being a separate shell rather than a tab in the municipal
 * one: there is no filter to get wrong.
 *
 * **A kagawad is elected, not clerical.** They legislate, they sit on
 * committees, and they answer to the people who voted for them — so what they
 * need is what the barangay is *doing*, which is counts and money and the
 * barangay's own public word. What they do not need is any individual resident,
 * and the line this draws is figures, never people:
 *
 * - **The register's counts, never its names.** A kagawad planning a feeding
 *   programme needs how many children live on which purok. The names and
 *   addresses under that number are the secretary's book and are not reachable
 *   from here at all — not filtered out of a response, not present in one.
 * - **No blotter, and this is the one worth saying out loud.** A blotter entry
 *   names a respondent: somebody accused of something who has been found to
 *   have done nothing. Handing seven elected politicians a searchable book of
 *   accusations against their own constituents is a political weapon, and
 *   nothing about holding the office requires it. A kagawad who sits on the
 *   Lupong Tagapamayapa is appointed to that separately, and would need an
 *   account that says so.
 * - **No certificate queue.** Who asked the barangay for what, and why, is
 *   every resident's business with the office and none of the council's.
 *
 * **Read-only, deliberately.** A notice goes out over the barangay's name, and
 * the board is how the barangay speaks; keeping that with the captain and the
 * clerk means a council seat is not a megaphone. Widening this later is one
 * route — narrowing it after seven people have used it is not.
 */

export const barangayKagawadRouter = Router()
barangayKagawadRouter.use(authenticate, requireRole('barangay_kagawad'))

/** The barangay on this account's own row. Null is a misconfigured account. */
async function ownBarangay(userId: string) {
  return one<{ id: string; name: string; captain: string | null }>(
    `select b.id, b.name, b.captain
       from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [userId]
  )
}

barangayKagawadRouter.use(async (req, res, next) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) {
    return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  }
  res.locals.barangay = barangay
  next()
})

const here = (res: { locals: Record<string, unknown> }) =>
  res.locals.barangay as { id: string; name: string; captain: string | null }

barangayKagawadRouter.get('/me', (_req, res) => {
  res.json({ barangay: here(res), role: 'barangay_kagawad' })
})

/**
 * What the barangay has issued, and what it has taken in.
 *
 * The same figures the administrator's summary shows. An elected official
 * asking what the office did this year is the ordinary case, and answering it
 * from the council's own screen is cheaper than answering it in a session.
 */
barangayKagawadRouter.get('/summary', async (_req, res) => {
  const barangay = here(res)
  const rows = await query<{ status: string; count: string; fees: string }>(
    `select status, count(*) as count, coalesce(sum(fee_centavos), 0) as fees
       from barangay_requests where barangay_id = $1 group by status`,
    [barangay.id]
  )
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]))
  const released = rows.find((r) => r.status === 'released')
  res.json({
    barangay: barangay.name,
    counts: {
      pending: byStatus.pending ?? 0,
      processing: byStatus.processing ?? 0,
      ready: byStatus.ready ?? 0,
      released: byStatus.released ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
    // Only what was released, like the administrator's: a fee on a pending
    // request is not money the barangay has.
    collected: toPesos(Number(released?.fees ?? 0)),
  })
})

/**
 * The register, as counts.
 *
 * `barangayFigures` is the same function the secretary's own screen calls, so
 * the council and the clerk are never quoting different population numbers at
 * each other. `withoutBirthDate` comes through as it does everywhere else — a
 * figure that silently omits people is the kind a barangay plans badly from,
 * and a council planning badly is a budget.
 */
barangayKagawadRouter.get('/figures', async (_req, res) => {
  const barangay = here(res)
  res.json({ barangay: barangay.name, ...(await barangayFigures(barangay.id)) })
})

/** The board, as residents see it — so a kagawad knows what has been said. */
barangayKagawadRouter.get('/announcements', async (_req, res) => {
  res.json(await liveAnnouncementsFor(here(res).id))
})
