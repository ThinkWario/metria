import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'
import { Update } from 'telegraf/types'
import { handleTelegramUpdate } from './channels/telegram.service'
import { getChannels, upsertChannelConfig } from './channel.service'
import { getConversations as _getConversations, getMessages as _getMessages, sendMessage as _sendMessage, trackAiMetric } from './inbox.service'
import { verifyWhatsAppSignature, parseWhatsAppUpdate } from './channels/whatsapp.service'
import { verifyInstagramSignature, parseInstagramUpdate } from './channels/instagram.service'
import { verifyMessengerSignature, parseMessengerUpdate } from './channels/messenger.service'
import { WhatsAppSessionManager } from '../../lib/whatsapp/WhatsAppManager'

async function getActiveChannel(workspaceId: string, platform: string) {
  return prisma.channel.findFirst({ where: { workspaceId, platform, status: 'CONNECTED' } })
}

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[Telegram webhook error]', err)
    if (!res.headersSent) res.sendStatus(200) // Still return 200 to Telegram to avoid retries
  }
}

export async function getConversationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { status, channelId, cursor } = req.query as Record<string, string>
    const convs = await _getConversations(workspaceId, { status: status as any, channelId, cursor })
    res.json(convs)
  } catch {
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
}

export async function getMessagesHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
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
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
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
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
    if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
    const { workspaceId } = req.params
    const channel = await getActiveChannel(workspaceId, 'WHATSAPP')
    const config = channel?.config as Record<string, string> | undefined
    if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
    res.status(200).send(challenge)
  } catch (err) {
    console.error('[WhatsApp webhook verify error]', err)
    if (!res.headersSent) res.status(500).send('Internal error')
  }
}

export async function whatsappWebhook(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[WhatsApp webhook error]', err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' })
  }
}

export async function instagramWebhookVerify(req: Request, res: Response): Promise<void> {
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
    if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
    const { workspaceId } = req.params
    const channel = await getActiveChannel(workspaceId, 'INSTAGRAM')
    const config = channel?.config as Record<string, string> | undefined
    if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
    res.status(200).send(challenge)
  } catch (err) {
    console.error('[Instagram webhook verify error]', err)
    if (!res.headersSent) res.status(500).send('Internal error')
  }
}

export async function instagramWebhook(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[Instagram webhook error]', err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' })
  }
}

export async function messengerWebhookVerify(req: Request, res: Response): Promise<void> {
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
    if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
    const { workspaceId } = req.params
    const channel = await getActiveChannel(workspaceId, 'MESSENGER')
    const config = channel?.config as Record<string, string> | undefined
    if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
    res.status(200).send(challenge)
  } catch (err) {
    console.error('[Messenger webhook verify error]', err)
    if (!res.headersSent) res.status(500).send('Internal error')
  }
}

export async function messengerWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.params
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
    const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
    const channel = await getActiveChannel(workspaceId, 'MESSENGER')
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
    const config = channel.config as Record<string, string>
    if (!verifyMessengerSignature(rawBody, signature, config.appSecret)) {
      res.status(401).json({ error: 'Invalid signature' }); return
    }
    res.status(200).json({ ok: true })
    const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body
    parseMessengerUpdate(workspaceId, channel.id, body).catch(err => console.error('[Messenger webhook]', err))
  } catch (err) {
    console.error('[Messenger webhook error]', err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' })
  }
}

export async function getChannelsHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const channels = await getChannels(workspaceId)
    res.json(channels)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels' })
  }
}

export async function upsertChannelConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { platform } = req.params
    const { name, config, status } = req.body

    if (!platform || !name || !config) {
      res.status(400).json({ error: 'platform, name and config are required' })
      return
    }

    const channel = await upsertChannelConfig(workspaceId, {
      platform: platform as any,
      name,
      config,
      status
    })
    res.status(200).json(channel)
  } catch (err) {
    res.status(500).json({ error: 'Failed to upsert channel config' })
  }
}
export async function handoverToHumanHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { conversationId } = req.params

    await prisma.conversation.update({
      where: { id: conversationId, workspaceId },
      data: { isHandledByBot: false }
    })

    // Track metric
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { channelId: true } })
    if (conv) {
      await trackAiMetric(workspaceId, conv.channelId, 'humanHandoffCount')
    }

    // Log system action
    await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        content: 'El agente humano tomó el control de la conversación.',
        isInternal: true
      }
    })
    
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function initWhatsAppSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const manager = WhatsAppSessionManager.getInstance()
    await manager.initSession(workspaceId)
    res.json({ ok: true, message: 'WhatsApp session initialization started' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function disconnectWhatsAppSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const manager = WhatsAppSessionManager.getInstance()
    await manager.destroySession(workspaceId)
    res.json({ ok: true, message: 'WhatsApp session disconnected' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

