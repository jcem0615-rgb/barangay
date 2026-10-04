import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { requireRole } from '../auth.ts'

/**
 * The barangay blotter and the summons issued from it.
 *
 * Mounted inside the barangay staff router, so it inherits that router's
 * authentication and its two roles, and inherits the rule that matters most:
 * every statement here filters on the barangay taken from the signed-in
 * account's own row. A caller cannot name a barangay, so a request for another
 * barangay's entry is not found rather than refused — there is nowhere to point
 * it.
 *
 * **Nothing here reaches a resident.** No route under `/api` outside this file
 * reads these tables, no notification is written, and the resident app has no
 * screen for them. Everywhere else in this application a change notifies the
 * person it is about, in the same transaction; here that would mean telling
 * somebody by push that they have been named in a dispute, which is both a
 * thing to do to a live quarrel and not how a summons is served. The law wants
 * personal service by the barangay, and an app notification is not it.
 *
 * What this is not is the legal record. The KP forms, the Pangkat, the ten-day
 * finality of a settlement and the Certificate to File Action are paper
 * instruments; this says the process happened and when.
 */

export const blotterRouter = Router()

/** The barangay this account works for, read from its own row. */
async function ownBarangay(userId: string) {
  return one<{ id: string; name: string }>(
    `select b.id, b.name from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [userId]
  )
}

interface EntryRow {
  id: string; reference_no: string; complainant: string; complainant_contact: string | null
  respondent: string; respondent_address: string | null; nature: string; narrative: string
  occurred_at: string | null; status: string; outcome_note: string | null
  recorded_at: string; updated_at: string; recorded_by_name?: string | null
  summons_count?: string; next_hearing?: string | null
}

function serializeEntry(row: EntryRow) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    complainant: row.complainant,
    complainantContact: row.complainant_contact,
    respondent: row.respondent,
    respondentAddress: row.respondent_address,
    nature: row.nature,
    narrative: row.narrative,
    occurredAt: row.occurred_at,
    status: row.status,
    outcomeNote: row.outcome_note,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
    recordedBy: row.recorded_by_name ?? null,
    summonsCount: row.summons_count === undefined ? undefined : Number(row.summons_count),
    nextHearing: row.next_hearing ?? null,
  }
}

// ------------------------------------------------------------------ the book

const NATURES = [
  'Dispute between neighbours', 'Family or domestic matter', 'Debt or unpaid obligation',
  'Property or boundary', 'Physical injury or altercation', 'Damage to property',
  'Noise or nuisance', 'Threat or harassment', 'Theft', 'Other',
] as const

const entrySchema = z.object({
  complainant: z.string().min(2, 'Who is complaining?').max(160),
  complainantContact: z.string().max(80).optional(),
  respondent: z.string().min(2, 'Who is it against?').max(160),
  respondentAddress: z.string().max(300).optional(),
  nature: z.enum(NATURES),
  narrative: z.string().min(20, 'Write what happened, in a few sentences.').max(4000),
  // The barangay writes the book after the fact, so this is usually in the
  // past; a dispute that has not happened yet is not a blotter entry.
  occurredAt: z.iso.datetime({ offset: true }).optional(),
})

/** What a barangay may write in its own book. Both roles — the clerk records. */
blotterRouter.post('/', async (req, res) => {
  const parsed = entrySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  if (body.occurredAt && new Date(body.occurredAt).getTime() > Date.now() + 60_000) {
    return res.status(400).json({ error: 'The incident cannot be in the future.' })
  }

  const created = await transaction(async (client) => {
    const year = new Date().getFullYear()
    const seq = await client.query<{ last_number: number }>(
      `insert into blotter_counters (year, last_number) values ($1, 1)
       on conflict (year) do update set last_number = blotter_counters.last_number + 1
       returning last_number`,
      [year]
    )
    const reference = `BLTR-${year}-${String(seq.rows[0]!.last_number).padStart(5, '0')}`
    const inserted = await client.query<EntryRow>(
      `insert into blotter_entries
         (reference_no, barangay_id, complainant, complainant_contact, respondent,
          respondent_address, nature, narrative, occurred_at, recorded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        reference, barangay.id, body.complainant, body.complainantContact ?? null,
        body.respondent, body.respondentAddress ?? null, body.nature, body.narrative,
        body.occurredAt ?? null, req.user!.id,
      ]
    )
    return inserted.rows[0]!
  })

  res.status(201).json(serializeEntry(created))
})

const listSchema = z.object({
  status: z.enum(['recorded', 'mediation', 'settled', 'unsettled', 'withdrawn', 'referred']).optional(),
  q: z.string().max(120).optional(),
})

blotterRouter.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Unknown filter.' })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<EntryRow>(
    `select e.*, u.full_name as recorded_by_name,
            (select count(*) from blotter_summons s where s.blotter_id = e.id) as summons_count,
            (select min(s.hearing_at) from blotter_summons s
              where s.blotter_id = e.id and s.outcome = 'pending' and s.hearing_at >= now()) as next_hearing
       from blotter_entries e
       left join users u on u.id = e.recorded_by
      where e.barangay_id = $1
        and ($2::text is null or e.status = $2::blotter_status)
        -- Searching the book is searching names, which is the whole point of a
        -- book of names; it is bounded to this barangay by the clause above.
        and ($3::text is null
             or e.reference_no ilike '%' || $3 || '%'
             or e.complainant ilike '%' || $3 || '%'
             or e.respondent ilike '%' || $3 || '%')
      -- Open matters first, then most recently written: the order somebody
      -- working the book would want it in.
      order by (e.status in ('recorded', 'mediation')) desc, e.recorded_at desc
      limit 200`,
    [barangay.id, parsed.data.status ?? null, parsed.data.q?.trim() || null]
  )
  res.json(rows.map(serializeEntry))
})

/** One entry, with every summons issued on it. */
blotterRouter.get('/:id', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const entry = await one<EntryRow>(
    `select e.*, u.full_name as recorded_by_name
       from blotter_entries e
       left join users u on u.id = e.recorded_by
      where e.id = $1 and e.barangay_id = $2`,
    [req.params.id, barangay.id]
  )
  if (!entry) return res.status(404).json({ error: 'Entry not found.' })

  const summons = await query<{
    id: string; sequence: number; hearing_at: string; venue: string; note: string | null
    served_at: string | null; served_note: string | null; outcome: string
    issued_at: string; issued_by_name: string | null
  }>(
    `select s.id, s.sequence, s.hearing_at, s.venue, s.note, s.served_at, s.served_note,
            s.outcome, s.issued_at, u.full_name as issued_by_name
       from blotter_summons s
       left join users u on u.id = s.issued_by
      where s.blotter_id = $1 and s.barangay_id = $2
      order by s.sequence`,
    [entry.id, barangay.id]
  )

  res.json({
    ...serializeEntry(entry),
    summons: summons.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      hearingAt: s.hearing_at,
      venue: s.venue,
      note: s.note,
      servedAt: s.served_at,
      servedNote: s.served_note,
      outcome: s.outcome,
      issuedAt: s.issued_at,
      issuedBy: s.issued_by_name,
    })),
  })
})

/**
 * Where a matter ended up.
 *
 * `recorded` and `mediation` are open; the other four are closings and are
 * final, because what a barangay concluded is not something to quietly rewrite
 * afterwards — the same rule the certificate workflow follows and that a served
 * visit follows in the appointments console.
 */
const OPEN = ['recorded', 'mediation']
const CLOSINGS = ['settled', 'unsettled', 'withdrawn', 'referred']

const statusSchema = z.object({
  status: z.enum(['mediation', 'settled', 'unsettled', 'withdrawn', 'referred']),
  outcomeNote: z.string().max(2000).optional(),
})

blotterRouter.patch('/:id', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose what to set it to.' })
  const { status, outcomeNote } = parsed.data

  // A closing has to say why. "Unsettled" with no reason is the row somebody
  // has to reconstruct from memory a year later, in front of a court that is
  // asking why the case arrived without a settlement.
  if (CLOSINGS.includes(status) && !outcomeNote?.trim()) {
    return res.status(400).json({ error: 'Say how it ended — the terms agreed, or where it was sent.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await transaction(async (client) => {
    const current = await client.query<{ id: string; status: string }>(
      `select id, status from blotter_entries
        where id = $1 and barangay_id = $2 for update`,
      [req.params.id, barangay.id]
    )
    const row = current.rows[0]
    if (!row) return { error: 'notfound' as const }
    if (!OPEN.includes(row.status)) return { error: 'closed' as const, from: row.status }

    await client.query(
      `update blotter_entries
          set status = $2, outcome_note = coalesce($3, outcome_note), updated_at = now()
        where id = $1`,
      [row.id, status, outcomeNote?.trim() ?? null]
    )

    // Closing the matter closes the callings that had not happened yet. A
    // hearing on a settled dispute is two people turning up for nothing.
    if (CLOSINGS.includes(status)) {
      await client.query(
        `update blotter_summons set outcome = 'cancelled'
          where blotter_id = $1 and outcome = 'pending'`,
        [row.id]
      )
    }
    return { ok: true as const }
  })

  if ('error' in updated && updated.error === 'notfound') {
    return res.status(404).json({ error: 'Entry not found.' })
  }
  if ('error' in updated && updated.error === 'closed') {
    return res.status(409).json({
      error: `This entry is already ${updated.from}. A concluded matter is not reopened here.`,
    })
  }
  res.json({ ok: true })
})

// --------------------------------------------------------------- the summons

const summonsSchema = z.object({
  hearingAt: z.iso.datetime({ offset: true }),
  venue: z.string().min(2).max(200),
  note: z.string().max(1000).optional(),
})

/**
 * Issuing a summons is the administrator's, not the officer's.
 *
 * A summons goes out over the Punong Barangay's name and compels two people to
 * appear on a date. The clerk who writes the book does not get to call a
 * hearing, which is the same line the fees and the officer list already draw:
 * recording what happened is the officer's, deciding what the barangay does is
 * the administrator's.
 */
blotterRouter.post('/:id/summons', requireRole('barangay_admin'), async (req, res) => {
  const parsed = summonsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const { hearingAt, venue, note } = parsed.data

  if (new Date(hearingAt).getTime() < Date.now() - 60_000) {
    return res.status(400).json({ error: 'A hearing cannot be called for a date that has passed.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const issued = await transaction(async (client) => {
    const current = await client.query<{ id: string; status: string }>(
      `select id, status from blotter_entries where id = $1 and barangay_id = $2 for update`,
      [req.params.id, barangay.id]
    )
    const entry = current.rows[0]
    if (!entry) return { error: 'notfound' as const }
    if (!OPEN.includes(entry.status)) {
      return { error: 'closed' as const, from: entry.status }
    }

    // One pending calling at a time. Two open summons on one matter is two
    // dates the parties could turn up on, and only one of them is right.
    const pending = await client.query(
      `select 1 from blotter_summons where blotter_id = $1 and outcome = 'pending'`,
      [entry.id]
    )
    if (pending.rowCount) return { error: 'pending' as const }

    const seq = await client.query<{ next: number }>(
      `select coalesce(max(sequence), 0) + 1 as next from blotter_summons where blotter_id = $1`,
      [entry.id]
    )
    const inserted = await client.query<{ id: string; sequence: number; hearing_at: string }>(
      `insert into blotter_summons
         (blotter_id, barangay_id, sequence, hearing_at, venue, note, issued_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, sequence, hearing_at`,
      [entry.id, barangay.id, seq.rows[0]!.next, hearingAt, venue, note ?? null, req.user!.id]
    )

    // Calling a hearing is what moves a matter into mediation; nobody should
    // have to set the status separately and remember to.
    await client.query(
      `update blotter_entries set status = 'mediation', updated_at = now()
        where id = $1 and status = 'recorded'`,
      [entry.id]
    )
    return { summons: inserted.rows[0]! }
  })

  if ('error' in issued && issued.error === 'notfound') {
    return res.status(404).json({ error: 'Entry not found.' })
  }
  if ('error' in issued && issued.error === 'closed') {
    return res.status(409).json({ error: `This entry is ${issued.from}. Nothing more is called on it.` })
  }
  if ('error' in issued && issued.error === 'pending') {
    return res.status(409).json({
      error: 'There is already a hearing called on this entry. Record what happened at it first.',
    })
  }

  const summons = 'summons' in issued ? issued.summons : null
  res.status(201).json({
    id: summons!.id,
    sequence: summons!.sequence,
    hearingAt: summons!.hearing_at,
  })
})

const outcomeSchema = z.object({
  outcome: z.enum(['appeared', 'failed_to_appear', 'rescheduled', 'cancelled']).optional(),
  servedAt: z.iso.datetime({ offset: true }).optional(),
  servedNote: z.string().max(500).optional(),
})

/**
 * What happened to a summons: that it was served, and whether anybody came.
 *
 * Service is recorded separately from the outcome because they are different
 * facts and the first one decides what the second one means. A respondent who
 * never received the summons did not fail to appear, and a barangay that
 * records them as having done so is building a case on a hole.
 */
blotterRouter.patch('/:id/summons/:summonsId', requireRole('barangay_admin'), async (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Nothing to record.' })
  const { outcome, servedAt, servedNote } = parsed.data
  if (!outcome && !servedAt && !servedNote) {
    return res.status(400).json({ error: 'Nothing to record.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const result = await transaction(async (client) => {
    const current = await client.query<{ id: string; outcome: string }>(
      `select id, outcome from blotter_summons
        where id = $1 and blotter_id = $2 and barangay_id = $3 for update`,
      [req.params.summonsId, req.params.id, barangay.id]
    )
    const row = current.rows[0]
    if (!row) return { error: 'notfound' as const }
    // What happened at a hearing is not rewritten later in the week, the same
    // rule the appointments console applies to a visit that was served.
    if (outcome && row.outcome !== 'pending') {
      return { error: 'settled' as const, from: row.outcome }
    }

    await client.query(
      `update blotter_summons
          set outcome = coalesce($2::summons_outcome, outcome),
              served_at = coalesce($3::timestamptz, served_at),
              served_note = coalesce($4, served_note)
        where id = $1`,
      [row.id, outcome ?? null, servedAt ?? null, servedNote?.trim() ?? null]
    )
    return { ok: true as const }
  })

  if ('error' in result && result.error === 'notfound') {
    return res.status(404).json({ error: 'Summons not found.' })
  }
  if ('error' in result && result.error === 'settled') {
    return res.status(409).json({
      error: `That hearing is already recorded as ${result.from}.`,
    })
  }
  res.json({ ok: true })
})

/** The hearings called for this barangay, soonest first — the captain's week. */
blotterRouter.get('/calendar/upcoming', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<{
    id: string; sequence: number; hearing_at: string; venue: string; served_at: string | null
    reference_no: string; complainant: string; respondent: string; blotter_id: string
  }>(
    `select s.id, s.sequence, s.hearing_at, s.venue, s.served_at,
            e.reference_no, e.complainant, e.respondent, e.id as blotter_id
       from blotter_summons s join blotter_entries e on e.id = s.blotter_id
      where s.barangay_id = $1 and s.outcome = 'pending'
      order by s.hearing_at
      limit 100`,
    [barangay.id]
  )
  res.json(
    rows.map((r) => ({
      id: r.id,
      blotterId: r.blotter_id,
      sequence: r.sequence,
      hearingAt: r.hearing_at,
      venue: r.venue,
      servedAt: r.served_at,
      referenceNo: r.reference_no,
      complainant: r.complainant,
      respondent: r.respondent,
    }))
  )
})

export { NATURES }
