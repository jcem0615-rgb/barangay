import { appendFile } from 'node:fs/promises'
import nodemailer from 'nodemailer'
import { env } from './env.ts'

/**
 * Outbound mail.
 *
 * Three transports so the reset flow can be exercised without a mail server:
 *   console — logs the message (default; development)
 *   file    — appends JSON lines to MAIL_OUTBOX, which tests read
 *   smtp    — real delivery via SMTP_URL
 *
 * A deployment that accepts public sign-ups needs smtp. Without it, a resident
 * who forgets their password has no way back into their account.
 */

export interface Mail {
  to: string
  subject: string
  text: string
}

let smtp: nodemailer.Transporter | null = null

export async function sendMail(mail: Mail): Promise<void> {
  switch (env.mailTransport) {
    case 'smtp': {
      smtp ??= nodemailer.createTransport(env.smtpUrl!)
      await smtp.sendMail({ from: env.mailFrom, ...mail })
      return
    }
    case 'file': {
      await appendFile(env.mailOutbox!, JSON.stringify({ ...mail, at: new Date().toISOString() }) + '\n')
      return
    }
    default:
      console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`)
  }
}

export function resetEmail(link: string, expiresInMinutes: number): Omit<Mail, 'to'> {
  return {
    subject: 'Reset your eLGU Citizen Portal password',
    text: [
      'We received a request to reset your password.',
      '',
      `Open this link to choose a new one: ${link}`,
      '',
      `The link works once and expires in ${expiresInMinutes} minutes.`,
      "If you didn't ask for this, you can ignore this message — your password has not changed.",
    ].join('\n'),
  }
}
