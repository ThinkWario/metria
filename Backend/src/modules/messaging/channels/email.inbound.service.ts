import { prisma } from '../../../lib/prisma'
import { processInboundMessage } from '../message.service'

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedSender {
  email: string
  name: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "Name <email@example.com>" or plain "email@example.com" into parts.
 */
function parseSenderEmail(raw: string): ParsedSender {
  const match = /^(.+?)\s*<([^>]+)>/.exec(raw.trim())
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: raw.trim(), email: raw.trim() }
}

// ── Provider detection ────────────────────────────────────────────────────────

function isPostmark(payload: Record<string, unknown>): boolean {
  return 'TextBody' in payload
}

function isResend(payload: Record<string, unknown>): boolean {
  return 'text' in payload && 'from' in payload
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * Process an inbound email webhook from Postmark or Resend.
 * Returns false if the workspace has no EMAIL channel configured.
 */
export async function handleInboundEmail(
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  let fromRaw: string
  let messageId: string
  let textBody: string

  if (isPostmark(payload)) {
    fromRaw = String(payload['From'] ?? payload['from'] ?? '')
    messageId = String(payload['MessageID'] ?? payload['messageId'] ?? '')
    textBody = String(payload['TextBody'] ?? '')
  } else if (isResend(payload)) {
    fromRaw = String(payload['from'] ?? '')
    messageId = String(payload['email_id'] ?? payload['id'] ?? '')
    textBody = String(payload['text'] ?? '')
  } else {
    // Unknown provider shape — log and ignore
    console.warn('[email.inbound] Unknown provider payload shape for workspace', workspaceId)
    return false
  }

  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: 'EMAIL' },
    select: { id: true },
  })

  if (!channel) {
    // Workspace not configured for email — swallow silently
    return false
  }

  const { email, name } = parseSenderEmail(fromRaw)

  // Email contacts are keyed by email, not phone. Resolve the contact here so
  // processInboundMessage does not upsert the email into the `phone` column.
  const contact = await prisma.contact.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    create: {
      workspaceId,
      name: name || email,
      email,
      source: 'MANUAL',
      status: 'LEAD',
    },
    update: {},
    select: { id: true },
  })

  await processInboundMessage({
    workspaceId,
    channelId: channel.id,
    externalConversationId: email,
    externalMessageId: messageId || email,
    senderExternalId: email,
    contactId: contact.id,
    senderName: name || email,
    content: textBody,
    mediaUrl: undefined,
    mediaType: undefined,
  })

  return true
}
