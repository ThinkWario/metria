import type { MessageDriver, SendResult } from './types'
import { logDriver } from './log.driver'

/**
 * Resend email driver (stub).
 *
 * Activated only when RESEND_API_KEY is present. It attempts a real send via
 * Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
 * SMS/WhatsApp aren't Resend's concern, so they defer to the log driver.
 *
 * Required env for real delivery:
 *   - RESEND_API_KEY        Resend API key
 *   - RESEND_FROM_EMAIL     verified sender, e.g. "Metria <hola@tudominio.com>"
 *
 * The driver is defensive: any network/parse failure resolves a failed
 * SendResult instead of throwing, so one bad recipient never aborts the batch.
 */
export function createResendDriver(): MessageDriver {
  const apiKey = process.env.RESEND_API_KEY!
  const from = process.env.RESEND_FROM_EMAIL || 'Metria <onboarding@resend.dev>'

  return {
    name: 'resend',

    async sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            // Body may be plain text or HTML; Resend renders HTML.
            html: body,
            text: body,
          }),
        })

        if (!res.ok) {
          const detail = await safeText(res)
          return { ok: false, provider: 'resend', error: `Resend ${res.status}: ${detail}` }
        }
        return { ok: true, provider: 'resend' }
      } catch (err: any) {
        return { ok: false, provider: 'resend', error: err?.message ?? 'Resend request failed' }
      }
    },

    // Resend doesn't do SMS / WhatsApp — fall back to logging so the batch still runs.
    sendSms: logDriver.sendSms,
    sendWhatsapp: logDriver.sendWhatsapp,
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200)
  } catch {
    return 'unknown error'
  }
}
