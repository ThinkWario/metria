import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { tryRunBotFlows } from '../bot/flow.engine'
import { processAiResponse } from '../ai-agent/ai.service'
import { trackAiMetric } from './inbox.service'
import { sendWhatsAppMessage } from './channels/whatsapp.service'
import { sendInstagramMessage } from './channels/instagram.service'
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

async function sendPlatformMessage(
  platform: string,
  config: any,
  to: string,
  text: string
): Promise<void> {
  switch (platform) {
    case 'WHATSAPP':
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, to, text)
      break
    case 'INSTAGRAM':
      await sendInstagramMessage(config.pageAccessToken, to, text)
      break
    case 'TELEGRAM':
      await sendTelegramMessage(config.botToken, to, text)
      break
  }
}

export async function processInboundMessage(data: InboundMessageData): Promise<ProcessedMessage> {
  const {
    workspaceId, channelId, externalConversationId, externalMessageId,
    senderExternalId, senderName, content, mediaUrl, mediaType
  } = data

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true, isAiEnabled: true, config: true }
  })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)
  const source = PLATFORM_TO_SOURCE[channel.platform] ?? 'MANUAL'

  const contact = await prisma.contact.upsert({
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

  // 1. Try AI Agent if enabled for channel
  if (channel.isAiEnabled && updatedConv.isHandledByBot) {
    try {
      const aiResponse = await processAiResponse(workspaceId, conversation.id, content)
      if (aiResponse) {
        await sendPlatformMessage(channel.platform, channel.config, conversation.externalId, aiResponse)
        
        // Broadcast AI message via socket
        const io = getIO()
        io.to(`workspace:${workspaceId}`).emit('message:new', {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          content: aiResponse,
          sentAt: new Date()
        })

        // Track AI metric
        await trackAiMetric(workspaceId, channelId, 'botHandledCount')
      }
    } catch (err) {
      console.error('[AI Agent Error]', err)
      // Fallback to rules if AI fails? or just log
    }
  } else {
    // 2. Fallback to classic Rules engine
    tryRunBotFlows(workspaceId, channelId, {
      ...updatedConv,
      contactId: contact.id
    }, content).catch(err => console.error('[BotEngine]', err))
  }

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
      createdAt: conversation.createdAt
    })
  }

  io.to(room).emit('message:new', messagePayload)

  return {
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
    isNewConversation
  }
}
