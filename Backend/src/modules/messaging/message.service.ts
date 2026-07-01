import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { tryRunBotFlows } from '../bot/flow.engine'
import { processAiResponse } from '../ai-agent/ai.service'
import { trackAiMetric } from './inbox.service'
import { sendWhatsAppMessage } from './channels/whatsapp.service'
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

async function sendPlatformMessage(
  platform: string,
  config: any,
  to: string,
  text: string,
  workspaceId?: string
): Promise<void> {
  switch (platform) {
    case 'WHATSAPP':
      if ((config as any)?.isNative && workspaceId) {
        // QR-connected via whatsapp-web.js — bypass Cloud API (no OAuth token)
        const { WhatsAppSessionManager } = await import('../../lib/whatsapp/WhatsAppManager')
        await WhatsAppSessionManager.getInstance().sendMessage(workspaceId, to, text)
      } else {
        await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, to, text)
      }
      break
    case 'INSTAGRAM':
      await sendInstagramMessage(config.pageAccessToken, to, text)
      break
    case 'MESSENGER':
      await sendMessengerMessage(config.pageAccessToken, to, text)
      break
    case 'TELEGRAM':
      await sendTelegramMessage(config.botToken, to, text)
      break
  }
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

  await sendPlatformMessage(conv.channel.platform, conv.channel.config, conv.externalId, text, workspaceId)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType, content: text, status: 'SENT' }
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    conversationId, direction: 'OUTBOUND', senderType, content: text, sentAt: message.sentAt
  })
  return message
}

export async function processInboundMessage(data: InboundMessageData): Promise<ProcessedMessage> {
  const {
    workspaceId, channelId, externalConversationId, externalMessageId,
    senderExternalId, senderName, content, mediaUrl, mediaType
  } = data

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true, config: true }
  })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)
  const source = PLATFORM_TO_SOURCE[channel.platform] ?? 'MANUAL'

  const contact = data.contactId
    ? await prisma.contact.update({
        where: { id: data.contactId },
        data: { sourceCampaignId: data.metadata?.campaign_id || undefined }
      })
    : await prisma.contact.upsert({
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
      createdAt: conversation.createdAt
    })
  }

  io.to(room).emit('message:new', messagePayload)

  // 1. Try AI Agent if enabled for channel (isAiEnabled stored in config JSON)
  if (data.skipBotResponse) {
    // Historical/backfilled message (e.g. WhatsApp reconnect sync) — record it, don't respond.
  } else if ((channel.config as any)?.isAiEnabled && updatedConv.isHandledByBot) {
    try {
      const aiResponse = await processAiResponse(workspaceId, conversation.id, content)
      if (aiResponse) {
        await sendPlatformMessage(channel.platform, channel.config, conversation.externalId, aiResponse, workspaceId)

        // Persist the bot reply (the send already happened above, so write directly)
        const botMessage = await prisma.message.create({
          data: {
            workspaceId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            senderType: 'BOT',
            content: aiResponse,
            status: 'SENT'
          }
        })
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() }
        })

        // Broadcast AI message via socket
        const io = getIO()
        io.to(`workspace:${workspaceId}`).emit('message:new', {
          id: botMessage.id,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          content: aiResponse,
          sentAt: botMessage.sentAt
        })

        // Track AI metric
        await trackAiMetric(workspaceId, channelId, 'botHandledCount')

        // Schedule the next AI follow-up in the sequence (dynamic import: see note above)
        try {
          const botId = updatedConv.assignedToBotId
            ?? (await prisma.botAgent.findFirst({
              where: { workspaceId, isActive: true },
              orderBy: { createdAt: 'desc' },
              select: { id: true }
            }))?.id
          if (botId) {
            const { scheduleNextFollowUp } = await import('../ai-agent/followup.service')
            await scheduleNextFollowUp(workspaceId, conversation.id, botId)
          }
        } catch (err) {
          console.error('[FollowUp] Failed to schedule follow-up:', err)
        }
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

  return {
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
    isNewConversation
  }
}
