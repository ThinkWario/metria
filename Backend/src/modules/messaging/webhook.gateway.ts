import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { verifyWhatsAppSignature, parseWhatsAppUpdate } from './channels/whatsapp.service'
import { verifyInstagramSignature, parseInstagramUpdate } from './channels/instagram.service'
import { verifyMessengerSignature, parseMessengerUpdate } from './channels/messenger.service'

const PLATFORM_MAP: Record<string, { verify: any, parse: any }> = {
  WHATSAPP: { verify: verifyWhatsAppSignature, parse: parseWhatsAppUpdate },
  INSTAGRAM: { verify: verifyInstagramSignature, parse: parseInstagramUpdate },
  MESSENGER: { verify: verifyMessengerSignature, parse: parseMessengerUpdate }
}

export async function metaWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  const { workspaceId, platform } = req.params
  const p = platform.toUpperCase()
  
  if (mode !== 'subscribe' || !PLATFORM_MAP[p]) { res.status(400).send('Bad request'); return }
  
  const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: p, status: 'CONNECTED' } })
  const config = channel?.config as Record<string, string> | undefined
  
  if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
  res.status(200).send(challenge)
}

export async function metaWebhook(req: Request, res: Response): Promise<void> {
  const { workspaceId, platform } = req.params
  const p = platform.toUpperCase()
  const handler = PLATFORM_MAP[p]

  if (!handler) { res.status(404).send('Platform not supported'); return }

  try {
    const rawBody: Buffer | undefined = (req as any).rawBody
    if (!rawBody) {
      console.error(`[webhook.gateway] Missing raw body for platform ${p}, workspaceId ${workspaceId}`)
      res.status(400).json({ error: 'Missing raw body' }); return
    }

    const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: p, status: 'CONNECTED' } })

    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
    const config = channel.config as Record<string, string>

    if (!config.appSecret) {
      console.error(`[webhook.gateway] Missing appSecret for platform ${p}, workspaceId ${workspaceId}`)
      res.status(400).json({ error: 'Webhook not configured' }); return
    }

    if (!handler.verify(rawBody, signature, config.appSecret)) {
      res.status(401).json({ error: 'Invalid signature' }); return
    }

    res.status(200).json({ ok: true })
    handler.parse(workspaceId, channel.id, req.body).catch((err: any) => console.error(`[${p} webhook error]`, err))
  } catch (err) {
    console.error(`[Meta webhook error for ${p}]`, err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' })
  }
}
