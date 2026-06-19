import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'

export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED'

export interface GetConversationsOpts {
  /** A concrete status filters by it; 'ALL' (or undefined) returns every status. */
  status?: ConversationStatus | 'ALL'
  channelId?: string
  /** Case-insensitive match against the contact's name OR phone. */
  search?: string
  limit?: number
  cursor?: string
}

export async function getConversations(workspaceId: string, opts: GetConversationsOpts) {
  const { status, channelId, search, limit = 30, cursor } = opts
  const term = search?.trim()

  const rows = await prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(status && status !== 'ALL' && { status }),
      ...(channelId && { channelId }),
      ...(cursor && { id: { lt: cursor } }),
      ...(term && {
        OR: [
          { contact: { name: { contains: term, mode: 'insensitive' } } },
          { contact: { phone: { contains: term, mode: 'insensitive' } } }
        ]
      })
    },
    include: {
      contact: {
        select: {
          id: true, name: true, status: true, phone: true, avatarUrl: true,
          email: true, ltv: true, source: true,
          leadScore: true, leadTemperature: true, leadType: true
        }
      },
      channel: { select: { id: true, platform: true, name: true } },
      _count: { select: { messages: { where: { readAt: null, direction: 'INBOUND' } } } }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit
  })

  // Conversation has no Prisma relation to its assignee, so resolve names in one batch query.
  const assigneeIds = [...new Set(rows.map(r => r.assignedToUserId).filter(Boolean) as string[])]
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds }, workspaceId },
        select: { id: true, name: true, email: true }
      })
    : []
  const assigneeById = new Map(assignees.map(u => [u.id, u]))

  // Patch orphaned conversations (contact deleted by cleanup scripts)
  return rows.map(r => {
    const assignee = r.assignedToUserId ? assigneeById.get(r.assignedToUserId) ?? null : null
    return {
      ...r,
      unreadCount: r._count.messages,
      assignedToUser: assignee
        ? { id: assignee.id, name: assignee.name ?? assignee.email }
        : null,
      contact: r.contact ?? {
        id: '',
        name: r.externalId?.split('@')[0] ?? 'Contacto',
        status: 'LEAD',
        phone: r.externalId ?? '',
        avatarUrl: null,
        email: null,
        ltv: 0,
        source: 'whatsapp',
        leadScore: null,
        leadTemperature: null,
        leadType: null
      }
    }
  })
}

/**
 * Changes a conversation's workflow status. Sets resolvedAt when CLOSED, clears it otherwise.
 * Scoped to the workspace; emits a socket event so every connected agent's list refreshes.
 */
export async function changeConversationStatus(
  workspaceId: string,
  conversationId: string,
  status: ConversationStatus
) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  })
  if (!existing) throw new Error('Conversation not found')

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      resolvedAt: status === 'CLOSED' ? new Date() : null
    },
    select: { id: true, status: true, resolvedAt: true, assignedToUserId: true }
  })

  getIO().to(`workspace:${workspaceId}`).emit('conversation:updated', {
    id: conversation.id,
    status: conversation.status,
    resolvedAt: conversation.resolvedAt,
    assignedToUserId: conversation.assignedToUserId
  })

  return conversation
}

/**
 * Assigns (or unassigns, with null) a conversation to a workspace user.
 * Validates the target user belongs to the same workspace. Emits a socket event.
 */
export async function assignConversation(
  workspaceId: string,
  conversationId: string,
  userId: string | null
) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  })
  if (!existing) throw new Error('Conversation not found')

  let assignee: { id: string; name: string | null; email: string } | null = null
  if (userId) {
    assignee = await prisma.user.findFirst({
      where: { id: userId, workspaceId },
      select: { id: true, name: true, email: true }
    })
    if (!assignee) throw new Error('User does not belong to this workspace')
  }

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedToUserId: userId },
    select: { id: true, status: true, assignedToUserId: true }
  })

  const payload = {
    id: conversation.id,
    status: conversation.status,
    assignedToUserId: conversation.assignedToUserId,
    assignedToUser: assignee ? { id: assignee.id, name: assignee.name ?? assignee.email } : null
  }

  getIO().to(`workspace:${workspaceId}`).emit('conversation:updated', payload)

  return payload
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
  content: string,
  isInternal = false
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId }
  })
  if (!conversation) throw new Error('Conversation not found')

  // Internal notes are team-only: persist + broadcast, but never dispatch to the customer.
  if (isInternal) {
    const note = await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        senderId: userId,
        content,
        isInternal: true,
        status: 'SENT'
      }
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), messageCount: { increment: 1 } }
    })

    getIO().to(`workspace:${workspaceId}`).emit('message:new', {
      id: note.id,
      conversationId: note.conversationId,
      direction: note.direction,
      senderType: note.senderType,
      content: note.content,
      isInternal: true,
      status: note.status,
      sentAt: note.sentAt
    })
    return
  }

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
      isInternal: false,
      status: 'SENT',
      sentAt: message.sentAt
    })
}

/**
 * Marks all unread inbound messages in a conversation as read.
 * Scoped to the workspace to prevent cross-tenant access.
 */
export async function markConversationAsRead(workspaceId: string, conversationId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  })
  if (!existing) throw new Error('Conversation not found')

  const result = await prisma.message.updateMany({
    where: { conversationId, readAt: null, direction: 'INBOUND' },
    data: { readAt: new Date() }
  })

  return { marked: result.count }
}

/**
 * Marks the last inbound message in a conversation as unread by setting readAt to null.
 * Scoped to the workspace to prevent cross-tenant access.
 */
export async function markConversationAsUnread(workspaceId: string, conversationId: string): Promise<void> {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  })
  if (!existing) throw new Error('Conversation not found')

  const last = await prisma.message.findFirst({
    where: { conversationId, direction: 'INBOUND' },
    orderBy: { sentAt: 'desc' }
  })
  if (last) {
    await prisma.message.update({ where: { id: last.id }, data: { readAt: null } })
  }
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
