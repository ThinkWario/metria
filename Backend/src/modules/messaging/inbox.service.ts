import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'

export interface GetConversationsOpts {
  status?: 'OPEN' | 'PENDING' | 'CLOSED'
  channelId?: string
  limit?: number
  cursor?: string
}

export async function getConversations(workspaceId: string, opts: GetConversationsOpts) {
  const { status, channelId, limit = 30, cursor } = opts
  return prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(channelId && { channelId }),
      ...(cursor && { id: { lt: cursor } })
    },
    include: {
      contact: {
        select: {
          id: true, name: true, status: true, phone: true, avatarUrl: true,
          email: true, ltv: true, source: true,
          leadScore: true, leadTemperature: true, leadType: true
        }
      },
      channel: { select: { id: true, platform: true, name: true } }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit
  })
}

export async function getMessages(workspaceId: string, conversationId: string, cursor: string | undefined) {
  return prisma.message.findMany({
    where: {
      workspaceId,
      conversationId,
      ...(cursor && { id: { lt: cursor } })
    },
    orderBy: { sentAt: 'asc' },
    take: 50
  })
}

export async function sendMessage(
  workspaceId: string,
  conversationId: string,
  userId: string,
  content: string
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId }
  })
  if (!conversation) throw new Error('Conversation not found')

  const [channel, contact] = await Promise.all([
    prisma.channel.findUnique({ where: { id: conversation.channelId } }),
    prisma.contact.findUnique({ where: { id: conversation.contactId! } })
  ])
  if (!channel) throw new Error(`Channel not found: ${conversation.channelId}`)
  if (!contact) throw new Error(`Contact not found: ${conversation.contactId}`)

  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      senderId: userId,
      content,
      status: 'PENDING'
    }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } }
  })

  if (!contact.phone) {
    throw new Error(`Contact ${contact.id} has no identifier — cannot send outbound message`)
  }

  if (!channel.config || typeof channel.config !== 'object' || Array.isArray(channel.config)) {
    throw new Error(`Channel ${channel.id} has invalid config`)
  }

  const config = channel.config as Record<string, string>

  try {
    switch (channel.platform) {
      case 'WHATSAPP': {
        if (config.isNative) {
          const { WhatsAppSessionManager } = await import('../../lib/whatsapp/WhatsAppManager')
          await WhatsAppSessionManager.getInstance().sendMessage(workspaceId, contact.phone!, content)
        } else {
          const { sendWhatsAppMessage } = await import('./channels/whatsapp.service')
          await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, contact.phone!, content)
        }
        break
      }
      case 'INSTAGRAM': {
        const { sendInstagramMessage } = await import('./channels/instagram.service')
        // contact.phone stores platform-specific IDs (ig_<userId> for Instagram)
        await sendInstagramMessage(config.pageAccessToken, contact.phone!, content)
        break
      }
      case 'TELEGRAM': {
        const { sendTelegramMessage } = await import('./channels/telegram.service')
        await sendTelegramMessage(config.botToken, contact.phone!, content)
        break
      }
      default:
        throw new Error(`Unsupported platform for outbound: ${channel.platform}`)
    }
  } catch (dispatchError) {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED' } })
    throw dispatchError
  }

  await prisma.message.update({ where: { id: message.id }, data: { status: 'SENT' } })

  getIO()
    .to(`workspace:${workspaceId}`)
    .emit('message:new', {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      senderType: message.senderType,
      content: message.content,
      sentAt: message.sentAt
    })
}

export async function trackAiMetric(
  workspaceId: string,
  channelId: string,
  metric: 'botHandledCount' | 'botResolvedCount' | 'humanHandoffCount'
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await prisma.channelAnalyticSnapshot.upsert({
    where: {
      workspaceId_channelId_date: {
        workspaceId,
        channelId,
        date: today
      }
    },
    create: {
      workspaceId,
      channelId,
      date: today,
      [metric]: 1
    },
    update: {
      [metric]: { increment: 1 }
    }
  })
}
