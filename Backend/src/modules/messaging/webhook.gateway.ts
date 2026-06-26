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

const VERIFY_TOKEN_MAP: Record<string, string | undefined> = {
  INSTAGRAM: process.env.META_INSTAGRAM_VERIFY_TOKEN,
  MESSENGER: process.env.META_MESSENGER_VERIFY_TOKEN,
}

// GET /api/webhooks/meta/:platform — no workspaceId (Facebook sends to one URL per app)
export async function metaWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  const p = (req.params.platform ?? '').toUpperCase()

  if (mode !== 'subscribe' || !PLATFORM_MAP[p]) { res.status(400).send('Bad request'); return }

  const expected = VERIFY_TOKEN_MAP[p]
  if (!expected || token !== expected) { res.status(403).send('Forbidden'); return }

  res.status(200).send(challenge)
}

// POST /api/webhooks/meta/:platform — route by pageId from payload
export async function metaWebhook(req: Request, res: Response): Promise<void> {
  const p = (req.params.platform ?? '').toUpperCase()
  const handler = PLATFORM_MAP[p]

  if (!handler) { res.status(404).send('Platform not supported'); return }

  // Respond immediately — Facebook requires 200 within 20s
  res.status(200).json({ ok: true })

  try {
    const rawBody: Buffer | undefined = (req as any).rawBody
    if (!rawBody) return

    const signature = (req.headers['x-hub-signature-256'] as string) ?? ''

    // Find the page ID from the payload to identify which workspace owns this channel
    const entries: Array<{ id?: string }> = req.body?.entry ?? []
    const pageId = entries[0]?.id
    if (!pageId) return

    // Find all connected channels for this platform + pageId
    const channels = await prisma.channel.findMany({
      where: { platform: p, status: 'CONNECTED' }
    })

    const channel = channels.find(ch => {
      const cfg = ch.config as Record<string, string> | null
      return cfg?.pageId === pageId || cfg?.instagramAccountId === pageId
    })

    if (!channel) return

    const config = channel.config as Record<string, string>
    const appSecret = config.appSecret ?? process.env.META_APP_SECRET
    if (!appSecret) return

    if (!handler.verify(rawBody, signature, appSecret)) return

    handler.parse(channel.workspaceId, channel.id, req.body).catch(
      (err: any) => console.error(`[${p} webhook error]`, err)
    )
  } catch (err) {
    console.error(`[Meta webhook error for ${p}]`, err)
  }
}
