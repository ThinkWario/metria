import type { MessageDriver, SendResult } from './types'
import { logDriver } from './log.driver'

/**
 * Twilio SMS driver (stub).
 *
 * Activated only when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_FROM_NUMBER are present. It attempts a real send via Twilio's REST API
 * (https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource).
 * Email defers to the log driver.
 *
 * Required env for real delivery:
 *   - TWILIO_ACCOUNT_SID
 *   - TWILIO_AUTH_TOKEN
 *   - TWILIO_FROM_NUMBER   sender phone, e.g. "+14155238886"
 *
 * The driver is defensive: any failure resolves a failed SendResult instead of
 * throwing, so one bad recipient never aborts the batch.
 */
export function createTwilioDriver(): MessageDriver {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_FROM_NUMBER!

  return {
    name: 'twilio',

    // Twilio isn't an email provider — fall back to logging.
    sendEmail: logDriver.sendEmail,

    async sendSms(to: string, body: string): Promise<SendResult> {
      try {
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
        const form = new URLSearchParams({ To: to, From: from, Body: body })

        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
          }
        )

        if (!res.ok) {
          const detail = await safeText(res)
          return { ok: false, provider: 'twilio', error: `Twilio ${res.status}: ${detail}` }
        }
        return { ok: true, provider: 'twilio' }
      } catch (err: any) {
        return { ok: false, provider: 'twilio', error: err?.message ?? 'Twilio request failed' }
      }
    },

    // TODO(whatsapp): Real bulk WhatsApp requires Meta-approved message
    // templates, opt-in, and a WhatsApp Business sender — it cannot be sent as
    // free-form bulk text. We intentionally log instead of delivering.
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
