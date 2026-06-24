import crypto from 'crypto'
import { prisma } from '../../../lib/prisma'
import { processInboundMessage } from '../message.service'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TwilioInboundPayload {
  From: string
  To: string
  Body: string
  MessageSid: string
  AccountSid: string
  NumMedia?: string
  [key: string]: string | undefined
}

// ── Twilio signature validation ───────────────────────────────────────────────

/**
 * Validate Twilio's X-Twilio-Signature header.
 *
 * Algorithm (from Twilio docs):
 *   1. Take the full URL of the request.
 *   2. Sort the POST parameters alphabetically and concatenate key+value.
 *   3. Sign url+params with HMAC-SHA1 using authToken as key.
 *   4. Base64-encode the result and compare to the header value.
 *
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security#validating-signatures-from-twilio
 */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: TwilioInboundPayload
): boolean {
  const sortedKeys = Object.keys(params).sort()
  const paramString = sortedKeys
    .map((k) => `${k}${params[k] ?? ''}`)
    .join('')

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + paramString)
    .digest('base64')

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * Validate and process an inbound SMS webhook from Twilio.
 *
 * @returns 'ok' on success, 'no_channel' when workspace has no SMS channel,
 *          'invalid_signature' on signature mismatch.
 */
export async function handleInboundSms(
  workspaceId: string,
  params: TwilioInboundPayload,
  twilioSignature: string,
  requestUrl: string
): Promise<'ok' | 'no_channel' | 'invalid_signature' | 'error'> {
  try {
    const channel = await prisma.channel.findFirst({
      where: { workspaceId, platform: 'SMS' },
      select: { id: true, config: true },
    })

    if (!channel) {
      return 'no_channel'
    }

    // config may be null/non-object for misconfigured channels — guard before access
    const config =
      channel.config && typeof channel.config === 'object'
        ? (channel.config as Record<string, string>)
        : {}
    const authToken: string = config['authToken'] ?? config['auth_token'] ?? ''

    // Twilio signs over the exact URL it called. Use the real request URL,
    // not one reconstructed from BACKEND_URL (which may not match Twilio's console).
    const isValid = validateTwilioSignature(authToken, twilioSignature, requestUrl, params)
    if (!isValid) {
      return 'invalid_signature'
    }

    await processInboundMessage({
      workspaceId,
      channelId: channel.id,
      externalConversationId: params.From,
      externalMessageId: params.MessageSid,
      senderExternalId: params.From,
      senderName: params.From,
      content: params.Body,
      mediaUrl: undefined,
      mediaType: undefined,
    })

    return 'ok'
  } catch (err) {
    console.error('[sms.inbound] Error processing inbound SMS:', err)
    return 'error'
  }
}
