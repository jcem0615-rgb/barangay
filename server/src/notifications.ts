import type { PoolClient } from 'pg'
import { productName } from './deployment.ts'
import { one } from './db.ts'
import { sendMail } from './mailer.ts'
import { sendSms, smsEnabled, trimForSms } from './sms.ts'
import { env } from './env.ts'
import { pushBodyFor, pushToResident } from './push.ts'

/**
 * Resident notifications.
 *
 * Recorded in the database as part of the same transaction as the change they
 * describe, so a request can never advance without the resident being told.
 * Email and SMS are attempted afterwards, outside the transaction and without
 * blocking the response: a mail server being slow must not make an office's
 * "Advance" button hang, and a bounced message must not roll back the work.
 */

/** Notices about a request's progress. */
export type RequestNotificationKind =
  | 'assessed' | 'advanced' | 'released' | 'rejected' | 'request_paid'
  | 'document_revoked' | 'document_reissued'

/** Everything a notification row can be, including notices tied to no request. */
export type NotificationKind =
  | RequestNotificationKind
  | 'program_granted' | 'program_revoked'
  | 'appointment_booked' | 'appointment_cancelled' | 'appointment_missed'
  | 'complaint_filed' | 'complaint_answered'
  | 'incident_updated'
  | 'barangay_request'
  | 'barangay_announcement'
  | 'barangay_complaint_filed'
  | 'barangay_complaint_updated'

export interface NotificationInput {
  userId: string
  /** Null for notices that are not about a request, such as a programme record. */
  requestId: string | null
  kind: NotificationKind
  title: string
  body: string
}

/** Call inside the transaction that makes the change. */
export async function recordNotification(client: PoolClient, input: NotificationInput): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `insert into notifications (user_id, request_id, kind, title, body)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.userId, input.requestId ?? null, input.kind, input.title, input.body]
  )
  return inserted.rows[0]!.id
}

/**
 * Best-effort delivery to whichever channels the resident has enabled. Never
 * throws: the notification is already saved, and the caller has already
 * committed the change this describes.
 */
export async function deliverNotification(input: NotificationInput): Promise<void> {
  try {
    const person = await one<{
      email: string; notify_email: boolean; notify_sms: boolean; phone: string | null
    }>(
      `select u.email, u.notify_email, u.notify_sms, rp.phone
         from users u
         left join resident_profiles rp on rp.user_id = u.id
        where u.id = $1 and u.deactivated_at is null`,
      [input.userId]
    )
    if (!person) return

    if (person.notify_email) {
      await sendMail({
        to: person.email,
        subject: input.title,
        text: `${input.body}\n\nView it here: ${env.publicUrl}\n\n— ${productName()}`,
      }).catch((err) => console.error('notification email failed', err))
    }

    // Push goes to every device the resident registered. It is not behind
    // notify_email: granting the browser permission *is* the opt-in, and a
    // resident who turned off email did not thereby ask their phone to stay
    // silent.
    await pushToResident(input.userId, {
      title: input.title,
      body: pushBodyFor(input.kind, input.body),
      url: env.publicUrl,
    }).catch((err) => console.error('notification push failed', err))

    if (person.notify_sms && person.phone && smsEnabled()) {
      await sendSms({
        to: person.phone,
        text: trimForSms(`${input.title}: ${input.body}`),
      }).catch((err) => console.error('notification sms failed', err))
    }
  } catch (err) {
    console.error('notification delivery failed', err)
  }
}

/** The wording residents actually receive, kept in one place. */
export function notificationFor(
  kind: RequestNotificationKind,
  ctx: { serviceName: string; referenceNo: string; officeName: string; fee?: number; reason?: string }
): { title: string; body: string } {
  switch (kind) {
    case 'assessed':
      return {
        title: `${ctx.serviceName} — fee assessed`,
        body:
          `${ctx.officeName} has assessed your ${ctx.serviceName} (${ctx.referenceNo}). ` +
          `Amount due: PHP ${(ctx.fee ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
          'Pay in the app to continue.',
      }
    case 'advanced':
      return {
        title: `${ctx.serviceName} — update`,
        body: `${ctx.officeName} has moved your ${ctx.serviceName} (${ctx.referenceNo}) to the next step.`,
      }
    case 'released':
      return {
        title: `${ctx.serviceName} — ready`,
        body:
          `Your ${ctx.serviceName} (${ctx.referenceNo}) has been released by ${ctx.officeName}. ` +
          'You can download it from the app.',
      }
    case 'rejected':
      return {
        title: `${ctx.serviceName} — needs your attention`,
        body:
          `${ctx.officeName} could not process your ${ctx.serviceName} (${ctx.referenceNo}). ` +
          `Reason: ${ctx.reason ?? 'see the app for details'}`,
      }
    // A resident whose document was withdrawn and not told finds out at a
    // counter, holding paper that no longer checks out. The reason is required
    // at the point of revoking precisely so this message can carry one.
    case 'document_revoked':
      return {
        title: `${ctx.serviceName} — no longer valid`,
        body:
          `${ctx.officeName} has withdrawn your ${ctx.serviceName} (${ctx.referenceNo}). ` +
          `It will no longer pass a check. Reason: ${ctx.reason ?? 'see the app for details'}`,
      }
    // A replacement, after a withdrawal. The resident is holding paper that
    // stopped checking out, so the message has to say that a new copy exists
    // and that the old one is still no good — a reissue does not revive it.
    case 'document_reissued':
      return {
        title: `${ctx.serviceName} — replacement issued`,
        body:
          `${ctx.officeName} has issued a replacement for your ${ctx.serviceName} ` +
          `(${ctx.referenceNo}). Download the new copy in the app and use that one; the ` +
          `withdrawn copy will not pass a check.`,
      }
  }
}
