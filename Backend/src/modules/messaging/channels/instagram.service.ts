/**
 * Instagram Messaging API — outbound message dispatch + inbound webhook handling.
 * contact.phone stores platform-specific IDs (ig_<userId> for Instagram).
 */

import crypto from 'crypto'
import { processInboundMessage } from '../message.service'
import { sendPrivateReply } from './privateReply'

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
  entry?: Array<{
    id: string
    messaging?: MessagingEvent[]
    changes?: Array<{ field: string; value: { id: string; text: string; from: { id: string; username?: string } } }>
  }>
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
  rawBody: string | Buffer,
  signatureHeader: string,
  appSecret: string
): boolean {
  try {
    if (!signatureHeader.startsWith('sha256=')) {
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

export async function parseInstagramUpdate(
  workspaceId: string,
  channelId: string,
  body: InstagramBody,
  config: Record<string, any>
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
          content: event.message.text ?? '', 
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          mediaType: event.message.attachments?.[0]?.type
        })
      } catch (error) {
        console.error(`[Instagram] Error processing inbound message in workspace ${workspaceId}:`, error)
        // Continue processing other messages even if one fails
      }
    }

    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field !== 'comments') continue

      const { id: commentId, text, from } = change.value

      try {
        if (config.pageAccessToken) {
          await sendPrivateReply(
            config.pageAccessToken,
            commentId,
            'Hola! Vimos tu comentario, te escribimos por privado para ayudarte 🙌'
          )
        }

        await processInboundMessage({
          workspaceId,
          channelId,
          externalConversationId: from.id,
          externalMessageId: commentId,
          senderExternalId: `ig_${from.id}`,
          senderName: from.username,
          content: text
        })
      } catch (error) {
        console.error(`[Instagram] Error processing comment in workspace ${workspaceId}:`, error)
      }
    }
  }
}
