/**
 * WhatsApp Cloud API — outbound message dispatch + inbound webhook verification and parsing.
 */

import crypto from 'crypto'
import { processInboundMessage } from '../message.service'

const WA_API_VERSION = 'v19.0'

export interface WhatsAppBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
        messages?: Array<{
          id: string
          from: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string }
          video?: { id: string; mime_type: string }
          audio?: { id: string; mime_type: string }
          referral?: { ref: string }
        }>
        statuses?: unknown[]
      }
    }>
  }>
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`WhatsApp API error ${response.status}: ${body}`)
  }
}

/**
 * Downloads inbound media from Meta Cloud API. Two-step flow: resolve the
 * media_id to a temporary URL, then fetch it — both requests need the same
 * bearer token.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const infoResp = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!infoResp.ok) throw new Error(`Media info fetch failed: ${infoResp.status}`)
    const info = await infoResp.json() as { url?: string; mime_type?: string }
    if (!info.url) return null

    const fileResp = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!fileResp.ok) throw new Error(`Media download failed: ${fileResp.status}`)
    const buffer = Buffer.from(await fileResp.arrayBuffer())
    return { data: buffer.toString('base64'), mimeType: info.mime_type || 'audio/ogg' }
  } catch (err) {
    console.error(`[WhatsApp] Failed to download media ${mediaId}:`, err)
    return null
  }
}

/** Best-effort read receipt — never interrupt the inbound flow over its failure. */
export async function markWhatsAppMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId })
    })
  } catch {
    // Non-critical — a failed read receipt must never block message processing.
  }
}

/**
 * Verify WhatsApp webhook signature using HMAC-SHA256.
 * Returns false if verification fails or signature format is invalid.
 */
export function verifyWhatsAppSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  appSecret: string
): boolean {
  try {
    // Check if signature header is present and starts with sha256=
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false
    }

    // Compute expected signature
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature)
    const providedBuffer = Buffer.from(signatureHeader)

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  } catch {
    // If buffers have different lengths or any error occurs, return false
    return false
  }
}

/**
 * Parse inbound WhatsApp webhook and process text messages.
 * Skips non-text messages and status updates silently.
 */
export async function parseWhatsAppUpdate(
  workspaceId: string,
  channelId: string,
  body: WhatsAppBody,
  credentials?: { accessToken: string; phoneNumberId: string }
): Promise<void> {
  if (!body.entry) return

  for (const entry of body.entry) {
    if (!entry.changes) continue

    for (const change of entry.changes) {
      const value = change.value
      if (!value || !value.messages || value.messages.length === 0) {
        continue
      }

      // Build contact map: wa_id → name
      const contactMap = new Map<string, string | undefined>()
      if (value.contacts) {
        for (const contact of value.contacts) {
          if (contact.wa_id) {
            contactMap.set(contact.wa_id, contact.profile?.name)
          }
        }
      }

      for (const msg of value.messages) {
        if (msg.type === 'text' && msg.text?.body) {
          try {
            // Check for referral/ref data in payload (if available)
            const metadata = msg.referral ? { campaign_id: msg.referral.ref } : {}

            await processInboundMessage({
              workspaceId,
              channelId,
              externalConversationId: msg.from,
              externalMessageId: msg.id,
              senderExternalId: msg.from,
              senderName: contactMap.get(msg.from),
              content: msg.text.body,
              mediaUrl: undefined,
              mediaType: undefined,
              metadata
            })
          } catch (err) {
            console.error(`[WhatsApp] Failed to process message ${msg.id}:`, err)
          }
        } else if (msg.type === 'audio' && msg.audio?.id) {
          try {
            if (!credentials) {
              console.warn(`[WhatsApp] Audio message ${msg.id} received but no credentials configured — skipped`)
              continue
            }

            markWhatsAppMessageRead(credentials.phoneNumberId, credentials.accessToken, msg.id).catch(() => {})

            const media = await downloadWhatsAppMedia(msg.audio.id, credentials.accessToken)
            if (!media) continue

            const { transcribeAudio } = await import('../../ai-agent/providers/gemini.provider')
            const transcript = await transcribeAudio(media.data, media.mimeType)
            if (!transcript) continue

            const metadata = msg.referral ? { campaign_id: msg.referral.ref } : {}
            await processInboundMessage({
              workspaceId,
              channelId,
              externalConversationId: msg.from,
              externalMessageId: msg.id,
              senderExternalId: msg.from,
              senderName: contactMap.get(msg.from),
              content: transcript,
              mediaType: 'audio',
              metadata
            })
          } catch (err) {
            console.error(`[WhatsApp] Failed to process audio message ${msg.id}:`, err)
          }
        }
      }
    }
  }
}
