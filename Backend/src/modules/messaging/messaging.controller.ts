import type { Request, Response } from 'express'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { prisma } from '../../lib/prisma'
import { handleTelegramUpdate } from './channels/telegram.service'
import type { AuthRequest } from '../../middleware/auth'
import { getConversations as _getConversations, getMessages as _getMessages, sendMessage as _sendMessage } from './inbox.service'
import { verifyWhatsAppSignature, parseWhatsAppUpdate } from './channels/whatsapp.service'
import { verifyInstagramSignature, parseInstagramUpdate } from './channels/instagram.service'

async function getActiveChannel(workspaceId: string, platform: string) {
  return prisma.channel.findFirst({ where: { workspaceId, platform, status: 'CONNECTED' } })
}

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

export async function getConversationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId
    const { status, channelId, cursor } = req.query as Record<string, string>
    const convs = await _getConversations(workspaceId, { status: status as any, channelId, cursor })
    res.json(convs)
  } catch {
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
}

export async function getMessagesHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId
    const { conversationId } = req.params
    const { cursor } = req.query as Record<string, string>
    const msgs = await _getMessages(workspaceId, conversationId, cursor)
    res.json(msgs)
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId
    const userId = (req as AuthRequest).user!.id
    const { conversationId } = req.params
    const { content } = req.body
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
    await _sendMessage(workspaceId, conversationId, userId, content.trim())
    res.status(201).json({ ok: true })
  } catch (err: any) {
    const status = err.message === 'Conversation not found' ? 404 : 500
    res.status(status).json({ error: err.message })
  }
}

export async function whatsappWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
  const { workspaceId } = req.params
  const channel = await getActiveChannel(workspaceId, 'WHATSAPP')
  const config = channel?.config as Record<string, string> | undefined
  if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
  res.status(200).send(challenge)
}

export async function whatsappWebhook(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
  const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
  const channel = await getActiveChannel(workspaceId, 'WHATSAPP')
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
  const config = channel.config as Record<string, string>
  if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }
  res.status(200).json({ ok: true })
  const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body
  parseWhatsAppUpdate(workspaceId, channel.id, body).catch(err => console.error('[WhatsApp webhook]', err))
}

export async function instagramWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
  const { workspaceId } = req.params
  const channel = await getActiveChannel(workspaceId, 'INSTAGRAM')
  const config = channel?.config as Record<string, string> | undefined
  if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
  res.status(200).send(challenge)
}

export async function instagramWebhook(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
  const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
  const channel = await getActiveChannel(workspaceId, 'INSTAGRAM')
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
  const config = channel.config as Record<string, string>
  if (!verifyInstagramSignature(rawBody, signature, config.appSecret)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }
  res.status(200).json({ ok: true })
  const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body
  parseInstagramUpdate(workspaceId, channel.id, body).catch(err => console.error('[Instagram webhook]', err))
}
