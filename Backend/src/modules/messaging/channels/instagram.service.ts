/**
 * Instagram Messaging API — outbound message dispatch + inbound webhook handling.
 * contact.phone stores platform-specific IDs (ig_<userId> for Instagram).
 */

import crypto from 'crypto'
import { processInboundMessage } from '../message.service'

const GRAPH_API_VERSION = 'v19.0'

interface MessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{ type: string; payload: { url?: string } }>
  }
}

interface InstagramBody {
  object?: string
  entry?: Array<{ id: string; messaging?: MessagingEvent[] }>
}

export async function sendInstagramMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string
): Promise<void> {
  // Strip optional ig_ prefix so both raw IDs and prefixed IDs work
  const normalizedId = recipientId.startsWith('ig_') ? recipientId.slice(3) : recipientId

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: normalizedId },
      message: { text }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Instagram API error ${response.status}: ${body}`)
  }
}

export function verifyInstagramSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  try {
    if (!signatureHeader.startsWith('sha256=')) {
      return false
    }

    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig))
  } catch {
    return false
  }
}

export async function parseInstagramUpdate(
  workspaceId: string,
  channelId: string,
  body: InstagramBody
): Promise<void> {
  const entries = body.entry || []

  for (const entry of entries) {
    const events = entry.messaging || []

    for (const event of events) {
      // Skip if no message or if it's an echo (message sent by us)
      if (!event.message || event.message.is_echo === true) {
        continue
      }

      try {
        await processInboundMessage({
          workspaceId,
          channelId,
          externalConversationId: event.sender.id,
          externalMessageId: event.message.mid,
          senderExternalId: `ig_${event.sender.id}`,
          senderName: undefined,
          content: event.message.text,
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          mediaType: event.message.attachments?.[0]?.type
        })
      } catch (error) {
        console.error(`[Instagram] Error processing inbound message in workspace ${workspaceId}:`, error)
        // Continue processing other messages even if one fails
      }
    }
  }
}
