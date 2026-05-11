import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { tryRunBotFlows } from '../bot/flow.engine'
import type { InboundMessageData, ProcessedMessage } from './types'

const PLATFORM_TO_SOURCE: Record<string, string> = {
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  TELEGRAM: 'TELEGRAM',
  TIKTOK: 'TIKTOK'
}

export async function processInboundMessage(data: InboundMessageData): Promise<ProcessedMessage> {
  const {
    workspaceId, channelId, externalConversationId, externalMessageId,
    senderExternalId, senderName, content, mediaUrl, mediaType
  } = data

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true }
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
      status: 'LEAD'
    },
    update: {}
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
        status: 'OPEN'
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

  const updatedConv = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
    include: { channel: { select: { platform: true, config: true } } }
  })

  tryRunBotFlows(workspaceId, channelId, {
    ...updatedConv,
    contactId: contact.id
  }, content).catch(err => console.error('[BotEngine]', err))

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
