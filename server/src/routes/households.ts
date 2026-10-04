import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { requireRole } from '../auth.ts'

/**
 * The Record of Barangay Inhabitants.
 *
 * Mounted inside the barangay staff router, so it inherits that router's
 * authentication, its two roles, and the rule that every statement takes the
 * barangay from the signed-in account's own row rather than from anything a
 * caller passes.
 *
 * **This is the one place in the app that is deliberately a directory**, which
 * is why the boundary around it is drawn tightly. The municipal side has no
 * resident lookup on purpose; the register has to list inhabitants because that
 * is its whole function, so the containment is the barangay instead: its own
 * book, nothing readable by the municipality, by another barangay, or by any
 * resident, and no link from a member to a user account.
 *
 * Nothing here notifies anybody either. A register is compiled by the barangay
 * about the people in it; telling somebody by push that a clerk ticked a box on
 * their row is noise at best.
 */

export const householdsRouter = Router()

async function ownBarangay(userId: string) {
  return one<{ id: string; name: string }>(
    `select b.id, b.name from users u join barangays b on b.id = u.barangay_id
      where u.id = $1`,
    [userId]
  )
}

const RELATIONSHIPS = [
  'Head', 'Spouse', 'Son', 'Daughter', 'Parent', 'Grandparent', 'Grandchild',
  'Sibling', 'In-law', 'Relative', 'Boarder', 'Helper', 'Other',
] as const

const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'] as const

interface MemberRow {
  id: string; full_name: string; birth_date: string | null; sex: string | null
  relationship: string; civil_status: string | null; occupation: string | null
  is_pwd: boolean; is_four_ps: boolean; is_voter: boolean
}

/**
 * Age is computed on read rather than stored, the same rule the programme
 * registry follows for `expired`: a stored age is wrong the day after it is
 * written, and a register that quietly ages nobody is worse than one with no
 * ages at all.
 */
function ageOn(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null
  const born = new Date(birthDate)
  let age = today.getFullYear() - born.getFullYear()
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 130 ? age : null
}

const serializeMember = (m: MemberRow) => ({
  id: m.id,
  fullName: m.full_name,
  birthDate: m.birth_date,
  age: ageOn(m.birth_date),
  sex: m.sex,
  relationship: m.relationship,
  civilStatus: m.civil_status,
  occupation: m.occupation,
  isPwd: m.is_pwd,
  isFourPs: m.is_four_ps,
  isVoter: m.is_voter,
})

// ------------------------------------------------------------- the households

const householdSchema = z.object({
  address: z.string().min(2, 'Where is the household?').max(300),
  purok: z.string().max(80).optional(),
  headName: z.string().min(2, 'Who is the head of the household?').max(160),
  contact: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
})

householdsRouter.post('/', async (req, res) => {
  const parsed = householdSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const created = await transaction(async (client) => {
    const seq = await client.query<{ last_number: number }>(
      `insert into household_counters (barangay_id, last_number) values ($1, 1)
       on conflict (barangay_id)
       do update set last_number = household_counters.last_number + 1
       returning last_number`,
      [barangay.id]
    )
    const inserted = await client.query<{ id: string; household_no: number }>(
      `insert into households
         (barangay_id, household_no, address, purok, head_name, contact, notes, recorded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, household_no`,
      [
        barangay.id, seq.rows[0]!.last_number, body.address, body.purok ?? null,
        body.headName, body.contact ?? null, body.notes ?? null, req.user!.id,
      ]
    )
    const household = inserted.rows[0]!
    // The head is a member too. A register whose head is only a column cannot
    // count its own population, and every figure below counts members.
    await client.query(
      `insert into household_members (household_id, barangay_id, full_name, relationship)
       values ($1, $2, $3, 'Head')`,
      [household.id, barangay.id, body.headName]
    )
    return household
  })

  res.status(201).json({ id: created.id, householdNo: created.household_no })
})

const listSchema = z.object({
  status: z.enum(['active', 'moved', 'archived']).optional(),
  purok: z.string().max(80).optional(),
  q: z.string().max(120).optional(),
})

householdsRouter.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Unknown filter.' })
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const rows = await query<{
    id: string; household_no: number; address: string; purok: string | null
    head_name: string; contact: string | null; status: string; status_note: string | null
    updated_at: string; member_count: string
  }>(
    `select h.id, h.household_no, h.address, h.purok, h.head_name, h.contact,
            h.status, h.status_note, h.updated_at,
            (select count(*) from household_members m where m.household_id = h.id) as member_count
       from households h
      where h.barangay_id = $1
        and ($2::text is null or h.status = $2::household_status)
        and ($3::text is null or h.purok = $3)
        -- Searching the register is searching for a person, which is what it is
        -- for; the clause above is what keeps it inside one barangay.
        and ($4::text is null
             or h.head_name ilike '%' || $4 || '%'
             or h.address ilike '%' || $4 || '%'
             or exists (select 1 from household_members m
                         where m.household_id = h.id and m.full_name ilike '%' || $4 || '%'))
      order by h.status, h.household_no
      limit 300`,
    [barangay.id, parsed.data.status ?? null, parsed.data.purok ?? null, parsed.data.q?.trim() || null]
  )

  res.json(
    rows.map((h) => ({
      id: h.id,
      householdNo: h.household_no,
      address: h.address,
      purok: h.purok,
      headName: h.head_name,
      contact: h.contact,
      status: h.status,
      statusNote: h.status_note,
      updatedAt: h.updated_at,
      memberCount: Number(h.member_count),
    }))
  )
})

householdsRouter.get('/:id', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const household = await one<{
    id: string; household_no: number; address: string; purok: string | null
    head_name: string; contact: string | null; notes: string | null
    status: string; status_note: string | null; created_at: string; updated_at: string
  }>(
    `select id, household_no, address, purok, head_name, contact, notes,
            status, status_note, created_at, updated_at
       from households where id = $1 and barangay_id = $2`,
    [req.params.id, barangay.id]
  )
  if (!household) return res.status(404).json({ error: 'Household not found.' })

  const members = await query<MemberRow>(
    `select id, full_name, birth_date::text, sex, relationship, civil_status,
            occupation, is_pwd, is_four_ps, is_voter
       from household_members
      where household_id = $1 and barangay_id = $2
      -- The head first, then everybody else as they were added, which is how a
      -- paper register reads.
      order by (relationship = 'Head') desc, created_at`,
    [household.id, barangay.id]
  )

  res.json({
    id: household.id,
    householdNo: household.household_no,
    address: household.address,
    purok: household.purok,
    headName: household.head_name,
    contact: household.contact,
    notes: household.notes,
    status: household.status,
    statusNote: household.status_note,
    createdAt: household.created_at,
    updatedAt: household.updated_at,
    members: members.map(serializeMember),
  })
})

const editSchema = householdSchema.partial()

householdsRouter.patch('/:id', async (req, res) => {
  const parsed = editSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data
  if (Object.keys(body).length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await one<{ id: string }>(
    `update households
        set address = coalesce($3, address), purok = coalesce($4, purok),
            head_name = coalesce($5, head_name), contact = coalesce($6, contact),
            notes = coalesce($7, notes), updated_at = now()
      where id = $1 and barangay_id = $2
      returning id`,
    [
      req.params.id, barangay.id, body.address ?? null, body.purok ?? null,
      body.headName ?? null, body.contact ?? null, body.notes ?? null,
    ]
  )
  if (!updated) return res.status(404).json({ error: 'Household not found.' })
  res.json({ ok: true })
})

/**
 * Taking a household out of the active register.
 *
 * The administrator's, not the clerk's: recording who lives where is the day's
 * work, deciding that a household no longer counts is a change to what the
 * barangay reports upward. Nothing is deleted — a register that forgets cannot
 * be compared with last year's, and a household that moved away is a fact worth
 * keeping.
 */
const statusSchema = z.object({
  status: z.enum(['active', 'moved', 'archived']),
  statusNote: z.string().max(500).optional(),
})

householdsRouter.patch('/:id/status', requireRole('barangay_admin'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose what to set it to.' })
  const { status, statusNote } = parsed.data
  if (status !== 'active' && !statusNote?.trim()) {
    return res.status(400).json({ error: 'Say why it is leaving the active register.' })
  }

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await one<{ id: string }>(
    `update households set status = $3, status_note = $4, updated_at = now()
      where id = $1 and barangay_id = $2 returning id`,
    [req.params.id, barangay.id, status, statusNote?.trim() ?? null]
  )
  if (!updated) return res.status(404).json({ error: 'Household not found.' })
  res.json({ ok: true })
})

// ---------------------------------------------------------------- the members

const memberSchema = z.object({
  fullName: z.string().min(2, 'Who is it?').max(160),
  birthDate: z.iso.date().optional(),
  sex: z.enum(['female', 'male']).optional(),
  relationship: z.enum(RELATIONSHIPS),
  civilStatus: z.enum(CIVIL_STATUSES).optional(),
  occupation: z.string().max(120).optional(),
  isPwd: z.boolean().optional(),
  isFourPs: z.boolean().optional(),
  isVoter: z.boolean().optional(),
})

householdsRouter.post('/:id/members', async (req, res) => {
  const parsed = memberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  if (body.birthDate && new Date(body.birthDate).getTime() > Date.now()) {
    return res.status(400).json({ error: 'A date of birth cannot be in the future.' })
  }

  const household = await one<{ id: string }>(
    `select id from households where id = $1 and barangay_id = $2`,
    [req.params.id, barangay.id]
  )
  if (!household) return res.status(404).json({ error: 'Household not found.' })

  const inserted = await one<MemberRow>(
    `insert into household_members
       (household_id, barangay_id, full_name, birth_date, sex, relationship,
        civil_status, occupation, is_pwd, is_four_ps, is_voter)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, full_name, birth_date::text, sex, relationship, civil_status,
               occupation, is_pwd, is_four_ps, is_voter`,
    [
      household.id, barangay.id, body.fullName, body.birthDate ?? null, body.sex ?? null,
      body.relationship, body.civilStatus ?? null, body.occupation ?? null,
      body.isPwd ?? false, body.isFourPs ?? false, body.isVoter ?? false,
    ]
  )
  await query(`update households set updated_at = now() where id = $1`, [household.id])
  res.status(201).json(serializeMember(inserted!))
})

householdsRouter.patch('/:id/members/:memberId', async (req, res) => {
  const parsed = memberSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) })
  const body = parsed.data
  if (Object.keys(body).length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  const updated = await one<MemberRow>(
    `update household_members
        set full_name = coalesce($4, full_name), birth_date = coalesce($5::date, birth_date),
            sex = coalesce($6, sex), relationship = coalesce($7, relationship),
            civil_status = coalesce($8, civil_status), occupation = coalesce($9, occupation),
            is_pwd = coalesce($10, is_pwd), is_four_ps = coalesce($11, is_four_ps),
            is_voter = coalesce($12, is_voter), updated_at = now()
      where id = $1 and household_id = $2 and barangay_id = $3
      returning id, full_name, birth_date::text, sex, relationship, civil_status,
                occupation, is_pwd, is_four_ps, is_voter`,
    [
      req.params.memberId, req.params.id, barangay.id,
      body.fullName ?? null, body.birthDate ?? null, body.sex ?? null, body.relationship ?? null,
      body.civilStatus ?? null, body.occupation ?? null,
      body.isPwd ?? null, body.isFourPs ?? null, body.isVoter ?? null,
    ]
  )
  if (!updated) return res.status(404).json({ error: 'Member not found.' })
  res.json(serializeMember(updated))
})

householdsRouter.delete('/:id/members/:memberId', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })

  // The head is the household. Removing them means the register no longer knows
  // whose it is, so the household's head is changed rather than deleted — which
  // is an edit to the household, not a member removal.
  const member = await one<{ relationship: string }>(
    `select relationship from household_members
      where id = $1 and household_id = $2 and barangay_id = $3`,
    [req.params.memberId, req.params.id, barangay.id]
  )
  if (!member) return res.status(404).json({ error: 'Member not found.' })
  if (member.relationship === 'Head') {
    return res.status(409).json({
      error: 'The head is the household. Change who the head is instead of removing them.',
    })
  }

  await query(
    `delete from household_members where id = $1 and household_id = $2 and barangay_id = $3`,
    [req.params.memberId, req.params.id, barangay.id]
  )
  await query(`update households set updated_at = now() where id = $1`, [req.params.id])
  res.json({ ok: true })
})

// ----------------------------------------------------------------- the figures

/**
 * What the register is actually for.
 *
 * A barangay keeps this book to answer questions it is asked constantly: how
 * many households, how many people, how many seniors on which purok, how many
 * children to feed. Those figures are computed over the active register on
 * every read rather than stored, so nothing can fall out of date — the same
 * trade the municipal reports make.
 *
 * The age bands come from `birth_date`, so a member recorded without one is
 * counted in the population and in nothing else. That is reported as
 * `withoutBirthDate` rather than hidden, because a figure that silently omits
 * people is the kind a barangay plans badly from.
 */
householdsRouter.get('/figures/summary', async (req, res) => {
  const barangay = await ownBarangay(req.user!.id)
  if (!barangay) return res.status(409).json({ error: 'This account is not attached to a barangay.' })
  res.json({ barangay: barangay.name, ...(await barangayFigures(barangay.id)) })
})

/**
 * The counts themselves, apart from the route that serves them.
 *
 * Pulled out because a kagawad reads these and must never reach the register
 * they are computed from: the figures are what an elected official needs to
 * plan with, and the names and addresses underneath are the secretary's book.
 * One function, two callers, and the caller that must not see names has no
 * query of its own that could accidentally select them.
 */
export async function barangayFigures(barangayId: string) {
  const rows = await query<MemberRow & { purok: string | null }>(
    `select m.id, m.full_name, m.birth_date::text, m.sex, m.relationship, m.civil_status,
            m.occupation, m.is_pwd, m.is_four_ps, m.is_voter, h.purok
       from household_members m join households h on h.id = m.household_id
      where m.barangay_id = $1 and h.status = 'active'`,
    [barangayId]
  )

  const households = await query<{ purok: string | null; count: string }>(
    `select purok, count(*) as count from households
      where barangay_id = $1 and status = 'active' group by purok order by purok nulls last`,
    [barangayId]
  )

  const ages = rows.map((m) => ageOn(m.birth_date))
  const known = ages.filter((a): a is number => a !== null)

  return {
    households: households.reduce((total, p) => total + Number(p.count), 0),
    population: rows.length,
    female: rows.filter((m) => m.sex === 'female').length,
    male: rows.filter((m) => m.sex === 'male').length,
    children: known.filter((a) => a < 18).length,
    adults: known.filter((a) => a >= 18 && a < 60).length,
    seniors: known.filter((a) => a >= 60).length,
    withoutBirthDate: ages.length - known.length,
    pwd: rows.filter((m) => m.is_pwd).length,
    fourPs: rows.filter((m) => m.is_four_ps).length,
    voters: rows.filter((m) => m.is_voter).length,
    byPurok: households.map((p) => ({
      purok: p.purok,
      households: Number(p.count),
      population: rows.filter((m) => m.purok === p.purok).length,
    })),
  }
}

export { RELATIONSHIPS, CIVIL_STATUSES }
