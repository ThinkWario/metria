import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { tryRunBotFlows } from '../bot/flow.engine'
import { scheduleAiReply } from '../ai-agent/aiResponder'
import { sendWhatsAppMessage, sendWhatsAppTemplateMessage } from './channels/whatsapp.service'
import { sendInstagramMessage } from './channels/instagram.service'
import { sendMessengerMessage } from './channels/messenger.service'
import { sendTelegramMessage } from './channels/telegram.service'
import { LifecycleService } from '../crm/lifecycle.service'
import type { InboundMessageData, ProcessedMessage } from './types'

const PLATFORM_TO_SOURCE: Record<string, string> = {
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  TELEGRAM: 'TELEGRAM',
  TIKTOK: 'TIKTOK',
  MESSENGER: 'MESSENGER'
}

/**
 * Returns the WhatsApp-assigned externalId for native (whatsapp-web.js)
 * sends, so callers can correlate later message_ack events. undefined for
 * every other platform/path (no ACK tracking there).
 */
export async function sendPlatformMessage(
  platform: string,
  config: any,
  to: string,
  text: string,
  workspaceId?: string
): Promise<string | undefined> {
  switch (platform) {
    case 'WHATSAPP':
      if ((config as any)?.isNative && workspaceId) {
        // QR-connected via whatsapp-web.js — bypass Cloud API (no OAuth token)
        const { WhatsAppSessionManager } = await import('../../lib/whatsapp/WhatsAppManager')
        return WhatsAppSessionManager.getInstance().sendMessage(workspaceId, to, text)
      }
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, to, text)
      return undefined
    case 'INSTAGRAM':
      await sendInstagramMessage(config.pageAccessToken, to, text)
      return undefined
    case 'MESSENGER':
      await sendMessengerMessage(config.pageAccessToken, to, text)
      return undefined
    case 'TELEGRAM':
      await sendTelegramMessage(config.botToken, to, text)
      return undefined
  }
  return undefined
}

/**
 * Sends an outbound message through the conversation's channel, persists it,
 * and broadcasts it via socket. Reusable by the AI follow-up engine.
 */
export async function sendOutboundPlatformMessage(
  workspaceId: string,
  conversationId: string,
  text: string,
  senderType: 'BOT' | 'AGENT' = 'BOT'
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: { channel: true }
  })
  if (!conv) throw new Error('Conversation not found')

  const externalId = await sendPlatformMessage(conv.channel.platform, conv.channel.config, conv.externalId, text, workspaceId)
  // Native WhatsApp: real status arrives later via message_ack — stay PENDING
  // and stash externalId so that event can find this row.
  const isNativeWhatsApp = conv.channel.platform === 'WHATSAPP' && !!(conv.channel.config as any)?.isNative
  const status = isNativeWhatsApp ? 'PENDING' : 'SENT'
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType, content: text, status, externalId }
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    conversationId, direction: 'OUTBOUND', senderType, content: text, sentAt: message.sentAt, status
  })
  return message
}

/**
 * Sends an approved WhatsApp template message through the conversation's channel
 * and persists it — the only send type Cloud API allows past the 24h customer
 * service window (see sendWhatsAppTemplateMessage). Currently supports a single
 * {{1}} = contact name placeholder, matching sheets.service.ts's opening-template send.
 */
export async function sendOutboundWhatsAppTemplate(
  workspaceId: string,
  conversationId: string,
  templateId: string
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: { channel: true, contact: { select: { name: true } } }
  })
  if (!conv) throw new Error('Conversation not found')
  if (conv.channel.platform !== 'WHATSAPP') throw new Error('Template sends are WhatsApp-only')

  const config = conv.channel.config as Record<string, any>
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, channelId: conv.channelId, status: 'APPROVED' }
  })
  if (!template) throw new Error(`Template ${templateId} not found or not APPROVED for this channel`)

  const contactName = conv.contact?.name || 'Hola'
  await sendWhatsAppTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    conv.externalId,
    template.name,
    template.language,
    [contactName]
  )

  const content = template.bodyText.replace(/\{\{1\}\}/g, contactName)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType: 'BOT', content, status: 'SENT' }
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    conversationId, direction: 'OUTBOUND', senderType: 'BOT', content, sentAt: message.sentAt, status: 'SENT'
  })
  return message
}

/**
 * Sends an approved WhatsApp template to an arbitrary phone that has no
 * Conversation of its own — internal ops alerts (e.g. workspace.notifyPhone)
 * fall outside the 24h customer-service window and have no message history
 * to persist against, unlike sendOutboundWhatsAppTemplate above.
 */
export async function sendWhatsAppTemplateToPhone(
  channelId: string,
  to: string,
  templateId: string,
  params: string[] = []
): Promise<void> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } })
  if (!channel || channel.platform !== 'WHATSAPP') throw new Error('WhatsApp channel not found')
  const config = channel.config as Record<string, any>

  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, channelId, status: 'APPROVED' }
  })
  if (!template) throw new Error(`Template ${templateId} not found or not APPROVED for this channel`)

  await sendWhatsAppTemplateMessage(config.phoneNumberId, config.accessToken, to, template.name, template.language, params)
}

/**
 * Handles both sides of a handoff to a human: tells the customer (free text —
 * this reply lands within the 24h window since they just messaged, so no
 * template is needed there), and separately alerts the assigned bot agent's
 * configured commercial executive (a different phone than the customer, whose
 * own 24h window is almost never open — that side needs an approved template).
 */
export async function sendHandoffNotice(workspaceId: string, conversationId: string): Promise<void> {
  try {
    await sendOutboundPlatformMessage(
      workspaceId, conversationId,
      'En un momento un asesor de nuestro equipo continuará esta conversación contigo.',
      'BOT'
    )
  } catch (err) {
    console.error(`[Handoff] Failed to notify customer for conversation ${conversationId}:`, err)
  }

  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId, workspaceId },
      select: { assignedToBotId: true, contact: { select: { name: true, phone: true } } }
    })
    if (!conv) return

    const agent = conv.assignedToBotId
      ? await prisma.botAgent.findUnique({ where: { id: conv.assignedToBotId }, select: { config: true } })
      : await prisma.botAgent.findFirst({
          where: { workspaceId, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { config: true }
        })
    const agentConfig = (agent?.config as Record<string, any>) ?? {}
    const { salesExecutivePhone, executiveHandoffTemplateId } = agentConfig
    if (!salesExecutivePhone || !executiveHandoffTemplateId) return

    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP' } })
    if (!channel) return

    const contactName = conv.contact?.name || 'Un lead'
    const contactPhone = conv.contact?.phone || 'sin teléfono'
    await sendWhatsAppTemplateToPhone(channel.id, salesExecutivePhone, executiveHandoffTemplateId, [contactName, contactPhone])
  } catch (err) {
    console.error(`[Handoff] Failed to notify sales executive for conversation ${conversationId}:`, err)
  }
}

export async function processInboundMessage(data: InboundMessageData): Promise<ProcessedMessage> {
  const {
    workspaceId, channelId, externalConversationId, externalMessageId,
    senderExternalId, senderName, content, mediaUrl, mediaType
  } = data

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true, config: true, name: true }
  })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)
  const source = PLATFORM_TO_SOURCE[channel.platform] ?? 'MANUAL'

  // Look up conversation first so we can reuse its contact (avoids duplicates
  // when migrating from @lid-prefixed phones to clean numbers after a fix).
  let isNewConversation = false
  let conversation = await prisma.conversation.findUnique({
    where: {
      workspaceId_channelId_externalId: {
        workspaceId,
        channelId,
        externalId: externalConversationId
      }
    },
    include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
  })

  let contact: any
  if (data.contactId) {
    contact = await prisma.contact.update({
      where: { id: data.contactId },
      data: { sourceCampaignId: data.metadata?.campaign_id || undefined }
    })
  } else if (conversation) {
    // Existing conversation → update its contact's phone to the clean version
    contact = await prisma.contact.update({
      where: { id: conversation.contactId! },
      data: {
        phone: senderExternalId,
        name: senderName ?? undefined,
        sourceCampaignId: data.metadata?.campaign_id || undefined
      }
    })
  } else {
    // Truly new conversation → upsert contact by phone
    contact = await prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone: senderExternalId } },
      create: {
        workspaceId,
        name: senderName ?? senderExternalId,
        phone: senderExternalId,
        source,
        sourceCampaignId: data.metadata?.campaign_id || null,
        status: 'LEAD'
      },
      update: {
        sourceCampaignId: data.metadata?.campaign_id || undefined
      }
    })
  }

  if (!conversation) {
    isNewConversation = true
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        channelId,
        contactId: contact.id,
        externalId: externalConversationId,
        status: 'OPEN',
        isHandledByBot: true // Default to bot for new conversations
      },
      include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
    })
  }

  // Reconnect syncs can replay messages already ingested — dedup by platform message ID.
  if (externalMessageId) {
    const existing = await prisma.message.findFirst({
      where: { conversationId: conversation.id, externalId: externalMessageId },
      select: { id: true }
    })
    if (existing) {
      return {
        conversationId: conversation.id,
        messageId: existing.id,
        contactId: contact.id,
        isNewConversation
      }
    }
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      externalId: externalMessageId,
      direction: 'INBOUND',
      senderType: 'CONTACT',
      senderId: contact.id,
      content,
      mediaUrl,
      mediaType,
      status: 'DELIVERED'
    }
  })

  // The contact replied: cancel any pending AI follow-up jobs.
  // Dynamic import breaks the circular dependency (followup.service imports this module).
  try {
    const { cancelPendingFollowUps } = await import('../ai-agent/followup.service')
    await cancelPendingFollowUps(conversation.id)
  } catch (err) {
    console.error('[FollowUp] Failed to cancel pending follow-ups:', err)
  }

  // Trigger CRM Lifecycle Logic (Async)
  LifecycleService.handleSignal({
    workspaceId,
    contactId: contact.id,
    platform: channel.platform,
    content,
    metadata: data.metadata
  }).catch(err => console.error('[Lifecycle Signal Error]', err))

  const updatedConv = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
    include: { channel: { select: { platform: true, config: true } } }
  })

  // Broadcast the inbound message immediately so the inbox shows it without waiting for AI.
  const io = getIO()
  const room = `workspace:${workspaceId}`

  const messagePayload = {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    senderType: message.senderType,
    content: message.content,
    sentAt: message.sentAt
  }

  if (isNewConversation) {
    io.to(room).emit('conversation:new', {
      id: conversation.id,
      channelId: conversation.channelId,
      externalId: conversation.externalId,
      status: conversation.status,
      contact: conversation.contact,
      channel: { id: channelId, platform: channel.platform, name: channel.name },
      createdAt: conversation.createdAt
    })
  }

  io.to(room).emit('message:new', messagePayload)

  // 1. Try AI Agent if enabled for channel (isAiEnabled stored in config JSON)
  if (data.skipBotResponse) {
    // Historical/backfilled message (e.g. WhatsApp reconnect sync) — record it, don't respond.
  } else if ((channel.config as any)?.isAiEnabled && updatedConv.isHandledByBot) {
    // Debounced + serialized per conversation; retries, metrics, follow-up
    // scheduling and failure alerts live in aiResponder.
    scheduleAiReply({
      workspaceId,
      conversationId: conversation.id,
      channelId,
      content
    })
  } else {
    // 2. Fallback to classic Rules engine
    tryRunBotFlows(workspaceId, channelId, {
      ...updatedConv,
      contactId: contact.id
    }, content).catch(err => console.error('[BotEngine]', err))
  }

  return {
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
    isNewConversation
  }
}
