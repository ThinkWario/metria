/**
 * Facebook Messenger API — outbound message dispatch + inbound webhook handling.
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

interface MessengerBody {
  object?: string
  entry?: Array<{ id: string; messaging?: MessagingEvent[] }>
}

export async function sendMessengerMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Messenger API error ${response.status}: ${body}`)
  }
}

export function verifyMessengerSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  appSecret: string
): boolean {
  try {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false
    }

    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
    const expectedBuffer = Buffer.from(expectedSig)
    const providedBuffer = Buffer.from(signatureHeader)
    if (expectedBuffer.length !== providedBuffer.length) return false
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  } catch {
    return false
  }
}

export async function parseMessengerUpdate(
  workspaceId: string,
  channelId: string,
  body: MessengerBody
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
          senderExternalId: `msgr_${event.sender.id}`,
          senderName: undefined,
          content: event.message.text ?? '',
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          mediaType: event.message.attachments?.[0]?.type
        })
      } catch (error) {
        console.error(`[Messenger] Error processing inbound message in workspace ${workspaceId}:`, error)
      }
    }
  }
}
