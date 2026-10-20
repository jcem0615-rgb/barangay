import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db.ts'
import { authenticate, requireRole } from '../auth.ts'
import { removeFile } from '../storage.ts'

export const privacyRouter = Router()
privacyRouter.use(authenticate, requireRole('resident'))

/**
 * The Data Privacy Act rights, as things a resident can do rather than read
 * about.
 *
 * RA 10173 gives a data subject the right to be informed, to access, to
 * correct, to erasure or blocking, and to data portability. The privacy notice
 * already describes them; these routes are the ones that matter in practice.
 */

/**
 * Everything the municipality holds about this resident, in one file.
 *
 * Attachments are listed rather than embedded: a JSON document with a dozen
 * photographs base64'd into it is not something a resident can open, and every
 * file here is already downloadable one at a time from the request it belongs
 * to. The manifest says what exists so nothing is hidden by omission.
 */
privacyRouter.get('/export', async (req, res) => {
  const id = req.user!.id

  const [account] = await query(
    `select u.id, u.email, u.full_name as "fullName", u.role,
            u.notify_email as "notifyEmail", u.notify_sms as "notifySms",
            u.created_at as "createdAt", u.password_changed_at as "passwordChangedAt"
       from users u where u.id = $1`,
    [id]
  )
  const [profile] = await query(
    `select barangay, municipality, province,
            birth_date::text as "birthDate", address, phone,
            photo_key is not null as "hasPhoto", photo_updated_at as "photoUpdatedAt"
       from resident_profiles where user_id = $1`,
    [id]
  )

  const requests = await query(
    `select r.id, r.reference_no as "referenceNo", r.service_id as "serviceId",
            r.department_id as "departmentId", r.status, r.fee_centavos as "feeCentavos",
            r.paid, r.payment_method as "paymentMethod", r.form_values as "formValues",
            r.rejection_reason as "rejectionReason",
            r.submitted_at as "submittedAt", r.paid_at as "paidAt"
       from requests r where r.resident_id = $1 order by r.submitted_at`,
    [id]
  )
  const events = await query(
    `select e.request_id as "requestId", e.event_type as "eventType", e.note,
            u.full_name as "actorName", e.created_at as "createdAt"
       from request_events e
       join requests r on r.id = e.request_id
       left join users u on u.id = e.actor_id
      where r.resident_id = $1 order by e.created_at`,
    [id]
  )
  const attachments = await query(
    `select a.id, a.request_id as "requestId", a.file_name as "fileName",
            a.content_type as "contentType", a.byte_size as "byteSize",
            a.requirement, a.created_at as "createdAt"
       from attachments a
       join requests r on r.id = a.request_id
      where r.resident_id = $1 order by a.created_at`,
    [id]
  )

  const [drafts, appointments, complaints, feedback, notifications, programs, idChecks, devices] =
    await Promise.all([
      query(`select service_id as "serviceId", form_values as "formValues", updated_at as "updatedAt"
               from request_drafts where resident_id = $1 order by updated_at`, [id]),
      query(`select scheduled_on::text as "scheduledOn",
                    to_char(start_time, 'HH24:MI') as "startTime", queue_no as "queueNo",
                    department_id as "departmentId", service_id as "serviceId",
                    status, note, created_at as "createdAt"
               from appointments where resident_id = $1 order by scheduled_on`, [id]),
      query(`select reference_no as "referenceNo", department_id as "departmentId", category,
                    body, status, due_on::text as "dueOn", response,
                    responded_at as "respondedAt", created_at as "createdAt"
               from complaints where resident_id = $1 order by created_at`, [id]),
      query(`select request_id as "requestId", rating, comment, created_at as "createdAt"
               from feedback where resident_id = $1 order by created_at`, [id]),
      query(`select kind, title, body, read_at as "readAt", created_at as "createdAt"
               from notifications where user_id = $1 order by created_at`, [id]),
      query(`select program_code as "programCode", reference_no as "referenceNo",
                    enrolled_on::text as "enrolledOn", valid_until::text as "validUntil"
               from resident_programs where user_id = $1 order by enrolled_on`, [id]),
      // Who checked this resident's ID at a counter, and when. Held because the
      // resident is entitled to know it, which is the whole point of recording it.
      // Who checked this resident's ID at a counter, and when. Recorded so the
      // resident can know it, which is the whole reason for recording it.
      query(`select v.consumed_at as "checkedAt", u.full_name as "checkedByName"
               from id_verifications v
               left join users u on u.id = v.verified_by
              where v.user_id = $1 and v.consumed_at is not null
              order by v.consumed_at`, [id]),
      query(`select user_agent as "userAgent", created_at as "createdAt",
                    last_used_at as "lastUsedAt"
               from push_subscriptions where user_id = $1`, [id]),
    ])

  const body = {
    exportedAt: new Date().toISOString(),
    about:
      'Everything the Municipality of Malasiqui holds about you in this portal, ' +
      'provided under your right to data portability (Republic Act 10173, the Data Privacy Act of 2012). ' +
      'Files you uploaded are listed under "attachments" and can be downloaded from each request in the app.',
    account,
    profile: profile ?? null,
    requests,
    requestHistory: events,
    attachments,
    drafts,
    appointments,
    complaints,
    feedback,
    notifications,
    programs,
    idChecksAtCounters: idChecks,
    devicesReceivingNotifications: devices,
  }

  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="elgu-my-data-${stamp}.json"`)
  res.send(JSON.stringify(body, null, 2))
})

/**
 * Correcting what the resident can correct themselves.
 *
 * Contact details are theirs: an address or a phone number is a fact about
 * them that they know better than the office does. A name is an identity
 * claim an office verified against documents, and a portal that let someone
 * retype it would not be a portal an office could trust — so that goes through
 * the Local Civil Registrar, and the screen says so rather than leaving a
 * resident wondering why the field is missing.
 */
const correctionBody = z.object({
  barangay: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  birthDate: z.union([z.iso.date(), z.null()]).optional(),
})

privacyRouter.patch('/profile', async (req, res) => {
  const parsed = correctionBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those details.' })
  }
  const patch = parsed.data
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  const existing = await one(
    `select barangay, address, phone, birth_date::text as "birthDate"
       from resident_profiles where user_id = $1`,
    [req.user!.id]
  )
  if (!existing) return res.status(404).json({ error: 'No profile to correct.' })
  const merged = { ...existing, ...patch }

  const [row] = await query(
    `update resident_profiles
        set barangay = $2, address = $3, phone = $4, birth_date = $5
      where user_id = $1
      returning barangay, municipality, province,
                birth_date::text as "birthDate", address, phone`,
    [req.user!.id, merged.barangay || null, merged.address || null, merged.phone || null, merged.birthDate || null]
  )
  res.json(row)
})

/**
 * What closing the account would and would not erase, before anything happens.
 *
 * Shown first because erasure is the one right the app cannot grant in full,
 * and finding that out afterwards would be the worst possible order. A resident
 * deserves to decide knowing what stays behind.
 */
privacyRouter.get('/closure-preview', async (req, res) => {
  res.json(await closureEffect(req.user!.id))
})

async function closureEffect(userId: string) {
  const rows = await query<{
    kept_requests: string; drafts: string; appointments: string
    notifications: string; devices: string; has_photo: boolean | null; programs: string
  }>(
    `select
       (select count(*) from requests where resident_id = $1) as kept_requests,
       (select count(*) from request_drafts where resident_id = $1) as drafts,
       (select count(*) from appointments
         where resident_id = $1 and status = 'booked' and scheduled_on >= current_date) as appointments,
       (select count(*) from notifications where user_id = $1) as notifications,
       (select count(*) from push_subscriptions where user_id = $1) as devices,
       (select photo_key is not null from resident_profiles where user_id = $1) as has_photo,
       (select count(*) from resident_programs where user_id = $1) as programs`,
    [userId]
  )
  // The aggregate always returns one row, but the type does not know that.
  const counts = rows[0] ?? {
    kept_requests: '0', drafts: '0', appointments: '0',
    notifications: '0', devices: '0', has_photo: false, programs: '0',
  }

  return {
    erased: {
      signIn: 'Your sign-in is closed and your password is destroyed.',
      contactDetails: 'Your email address, phone number and home address are removed.',
      photo: counts.has_photo ? 'The photograph on your digital ID is deleted.' : null,
      drafts: Number(counts.drafts) > 0 ? `${counts.drafts} unfinished form(s) you never submitted.` : null,
      appointments: Number(counts.appointments) > 0
        ? `${counts.appointments} upcoming appointment(s), cancelled so the slot goes to somebody else.`
        : null,
      notifications: Number(counts.notifications) > 0 ? `${counts.notifications} notification(s) held in the app.` : null,
      devices: Number(counts.devices) > 0 ? `${counts.devices} device(s) set to receive notifications.` : null,
    },
    retained: {
      requests: Number(counts.kept_requests) > 0
        ? `${counts.kept_requests} request(s) you filed, and any document released from them. ` +
          'These are public records of the municipality: a permit or certificate with no applicant ' +
          'on it is not a record, so the law requires the office to keep them.'
        : null,
      programs: Number(counts.programs) > 0
        ? `${counts.programs} programme record(s). These belong to the register that issued them ` +
          '(social welfare, OSCA, the agriculture office), not to this app, and are removed by ' +
          'applying to that office.'
        : null,
      complaints:
        'Any complaint you filed and the reply to it, because a complaints record the office can ' +
        'delete on request is not a complaints record.',
    },
    howToGoFurther:
      'For anything listed as retained, write to the Data Protection Officer. The office will tell ' +
      'you the retention period for each record and erase what it is no longer required to keep.',
  }
}

privacyRouter.post('/close', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : null
  const userId = req.user!.id

  const effect = await closureEffect(userId)

  const outcome = await transaction(async (client) => {
    // Locked separately: `for update` cannot be applied to the nullable side of
    // an outer join, and a resident may have no profile row at all.
    const found = await client.query<{ full_name: string }>(
      `select full_name from users where id = $1 and deactivated_at is null for update`,
      [userId]
    )
    if (found.rowCount === 0) return { error: 'This account is already closed.' }
    const fullName = found.rows[0]!.full_name
    const profileRow = await client.query<{ photo_key: string | null }>(
      `select photo_key from resident_profiles where user_id = $1`,
      [userId]
    )
    const photoKey = profileRow.rows[0]?.photo_key ?? null

    // Everything the app holds for its own convenience goes now. The resident
    // asked; none of this needs a review to be safe to delete.
    await client.query(`delete from request_drafts where resident_id = $1`, [userId])
    await client.query(`delete from push_subscriptions where user_id = $1`, [userId])
    await client.query(`delete from notifications where user_id = $1`, [userId])
    await client.query(
      `update appointments set status = 'cancelled', cancelled_at = now()
        where resident_id = $1 and status = 'booked' and scheduled_on >= current_date`,
      [userId]
    )
    // Outstanding ID verification codes must not survive the account.
    await client.query(`delete from id_verifications where user_id = $1 and consumed_at is null`, [userId])

    await client.query(
      `update resident_profiles set phone = null, address = null, photo_key = null, photo_updated_at = null
        where user_id = $1`,
      [userId]
    )

    // The sign-in is closed and the address released, so the same person can
    // register again later without the old account blocking the email.
    await client.query(
      `update users
          set deactivated_at = now(),
              password_hash = 'closed',
              password_changed_at = now(),
              email = 'closed+' || id::text || '@invalid',
              notify_email = false, notify_sms = false
        where id = $1`,
      [userId]
    )

    const saved = await client.query(
      `insert into privacy_closures (user_id, requested_name, reason, erased, retained)
       values ($1, $2, $3, $4, $5) returning id, created_at as "createdAt"`,
      [userId, fullName, reason, JSON.stringify(effect.erased), JSON.stringify(effect.retained)]
    )
    return { closure: saved.rows[0], photoKey }
  })

  if ('error' in outcome) return res.status(409).json({ error: outcome.error })
  // Outside the transaction: an object store is not part of it, and a failed
  // delete must not roll back an account closure the resident asked for.
  if (outcome.photoKey) await removeFile(outcome.photoKey).catch(() => undefined)

  res.json({ ...effect, closedAt: outcome.closure.createdAt })
})
