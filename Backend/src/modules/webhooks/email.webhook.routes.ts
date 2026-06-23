import { Router, Request, Response } from 'express'
import { handleInboundEmail } from '../messaging/channels/email.inbound.service'

export const emailWebhookRouter = Router()

emailWebhookRouter.post('/email/inbound', async (req: Request, res: Response) => {
  const workspaceId = req.query['workspaceId'] as string | undefined

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId query param is required' })
  }

  try {
    await handleInboundEmail(workspaceId, req.body as Record<string, unknown>)
    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    console.error('[email.webhook] Error processing inbound email:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
