import type { Channel, MessageDriver } from './types'
import { logDriver } from './log.driver'
import { createResendDriver } from './resend.driver'
import { createTwilioDriver } from './twilio.driver'

export type { Channel, MessageDriver, SendResult } from './types'
export { logDriver } from './log.driver'

function hasResendKeys(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

function hasTwilioKeys(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  )
}

/**
 * Pick the driver for a channel.
 *
 *   EMAIL    → Resend if RESEND_API_KEY is set, else the log driver.
 *   SMS      → Twilio if TWILIO_* are set, else the log driver.
 *   WHATSAPP → always the log driver. Real bulk WhatsApp needs Meta-approved
 *              templates + opt-in and is intentionally not implemented.
 *
 * Falling back to the log driver means the send engine always works in dev
 * without any API keys — messages are console.logged and counted as sent.
 */
export function getDriver(channel: Channel): MessageDriver {
  switch (channel) {
    case 'EMAIL':
      return hasResendKeys() ? createResendDriver() : logDriver
    case 'SMS':
      return hasTwilioKeys() ? createTwilioDriver() : logDriver
    case 'WHATSAPP':
      return logDriver
    default:
      return logDriver
  }
}

/** Whether a channel will actually deliver (vs. only logging) given current env. */
export function isLiveChannel(channel: Channel): boolean {
  if (channel === 'EMAIL') return hasResendKeys()
  if (channel === 'SMS') return hasTwilioKeys()
  return false // WHATSAPP is always log-only
}

/** Dispatch a rendered message to the right driver method for the channel. */
export function dispatch(
  driver: MessageDriver,
  channel: Channel,
  to: string,
  subject: string,
  body: string
) {
  if (channel === 'EMAIL') return driver.sendEmail(to, subject, body)
  if (channel === 'SMS') return driver.sendSms(to, body)
  return driver.sendWhatsapp(to, body)
}
