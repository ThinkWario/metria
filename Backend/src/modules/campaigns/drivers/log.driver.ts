import type { MessageDriver, SendResult } from './types'

/**
 * Default driver used when no provider API keys are configured.
 *
 * It console.logs the message and resolves success, so the entire send engine
 * works end-to-end in development WITHOUT any third-party credentials. Real
 * delivery requires configuring a provider (see resend.driver / twilio.driver
 * and getDriver()).
 */
export const logDriver: MessageDriver = {
  name: 'log',

  async sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
    console.log(`[campaigns:log] EMAIL → ${to} | subject="${subject}" | body="${truncate(body)}"`)
    return { ok: true, provider: 'log' }
  },

  async sendSms(to: string, body: string): Promise<SendResult> {
    console.log(`[campaigns:log] SMS → ${to} | body="${truncate(body)}"`)
    return { ok: true, provider: 'log' }
  },

  async sendWhatsapp(to: string, body: string): Promise<SendResult> {
    console.log(`[campaigns:log] WHATSAPP → ${to} | body="${truncate(body)}"`)
    return { ok: true, provider: 'log' }
  },
}

function truncate(s: string, max = 80): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}
