import { sendMail } from './mailer.ts'
import { sendSms, smsEnabled, trimForSms } from './sms.ts'

/**
 * Telling the parties that a hearing has been called.
 *
 * The blotter notifies nobody, everywhere, on purpose — elsewhere in this app a
 * change writes a notification row in the same transaction, and here that would
 * mean telling somebody by push that they have been named in a live quarrel.
 * A summons is the one case where that silence is wrong: the whole point is
 * that two people have to know a date, and a barangay that cannot reach them
 * spends its week walking.
 *
 * **The rule that mattered is kept intact.** The parties are still free text and
 * still unmatched to any account, because a link would turn this book into a way
 * to look up what a named resident stands accused of. So this does not touch the
 * notifications table — which is keyed on a user id and would have forced a
 * lookup to attach a row to. It sends to a number or an address *the barangay
 * typed in*, and if the barangay typed nothing, nobody is told.
 *
 * **What it says is deliberately almost nothing**: who is asking, when, where,
 * and the reference. No narrative, no nature of the complaint, and never the
 * other party's name — a lock screen is not private, and the one thing this must
 * not do is publish an accusation to whoever is holding the phone.
 *
 * **It is not service.** The law wants personal service by the barangay, and
 * `blotter_summons.served_at` remains the record of that. This is a courtesy
 * that makes the trip more likely to find somebody at home, and it says so.
 */

export interface SummonsNotice {
  barangayName: string
  referenceNo: string
  hearingAt: string
  venue: string
  /** Whatever the barangay wrote down for each party; either may be absent. */
  contacts: Array<string | null | undefined>
}

const looksLikeEmail = (contact: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)
const hasDigits = (contact: string) => /\d/.test(contact)

function wording(notice: SummonsNotice): { subject: string; body: string } {
  const when = new Date(notice.hearingAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'full',
    timeStyle: 'short',
  })
  return {
    subject: `Barangay ${notice.barangayName}: you are asked to appear on ${when}`,
    body:
      `Barangay ${notice.barangayName} asks you to appear on ${when} at ${notice.venue}, ` +
      `about barangay record ${notice.referenceNo}. ` +
      'Please bring a valid ID. If you cannot attend, tell the barangay before the date. ' +
      'This message is a reminder only — the barangay serves the summons itself.',
  }
}

/**
 * Sends to every contact the barangay has, and reports what happened to each.
 *
 * The result is stored on the summons rather than thrown away: a reminder that
 * silently went nowhere is worse than none, because the barangay stops checking
 * and assumes the parties know. A contact with no digits and no `@` is not
 * something either transport can take, so it is reported as unusable instead of
 * being attempted and failing obscurely.
 */
export async function sendSummonsNotice(notice: SummonsNotice): Promise<string> {
  const contacts = notice.contacts
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c))

  if (contacts.length === 0) return 'no contact on file'

  const { subject, body } = wording(notice)
  const results: string[] = []

  for (const contact of contacts) {
    const masked = contact.length > 4 ? `…${contact.slice(-4)}` : contact
    try {
      if (looksLikeEmail(contact)) {
        await sendMail({ to: contact, subject, text: body })
        results.push(`emailed ${masked}`)
      } else if (hasDigits(contact)) {
        if (!smsEnabled()) {
          results.push(`${masked}: SMS is not configured`)
          continue
        }
        await sendSms({ to: contact, text: trimForSms(body, 320) })
        results.push(`texted ${masked}`)
      } else {
        results.push(`${masked}: not a number or an address`)
      }
    } catch (err) {
      results.push(`${masked} failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }
  return results.join('; ')
}
