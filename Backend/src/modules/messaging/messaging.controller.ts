import type { Request, Response } from 'express'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { prisma } from '../../lib/prisma'
import { handleTelegramUpdate } from './channels/telegram.service'

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: 'TELEGRAM', status: 'CONNECTED' }
  })
  if (!channel) {
    res.sendStatus(404)
    return
  }
  const config = channel.config as Record<string, string>
  await handleTelegramUpdate(workspaceId, channel.id, config.botToken, req.body as Update)
  res.sendStatus(200)
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  const workspaceId = (req as any).user?.workspaceId as string
  const { status, channelId } = req.query

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(status ? { status: String(status) } : {}),
      ...(channelId ? { channelId: String(channelId) } : {})
    },
    include: {
      contact: { select: { id: true, name: true, status: true, phone: true } },
      channel: { select: { id: true, platform: true, name: true } }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50
  })
  res.json(conversations)
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  const workspaceId = (req as any).user?.workspaceId as string
  const { conversationId } = req.params

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  })
  if (!conversation || conversation.workspaceId !== workspaceId) {
    res.sendStatus(404)
    return
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, workspaceId },
    orderBy: { sentAt: 'asc' }
  })
  res.json(messages)
}
