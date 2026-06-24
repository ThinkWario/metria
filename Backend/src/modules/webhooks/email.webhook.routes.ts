import crypto from 'crypto'
import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { handleInboundEmail } from '../messaging/channels/email.inbound.service'

export const emailWebhookRouter = Router()

/**
 * Constant-time comparison of the provided secret against the configured one.
 * Returns false on length mismatch (timingSafeEqual throws on unequal lengths).
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    return false
  }
  return crypto.timingSafeEqual(a, b)
}

emailWebhookRouter.post('/email/inbound', async (req: Request, res: Response) => {
  const workspaceId = req.query['workspaceId'] as string | undefined

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId query param is required' })
  }

  try {
    // Validate a shared secret stored in the channel config, when configured.
    const channel = await prisma.channel.findFirst({
      where: { workspaceId, platform: 'EMAIL' },
      select: { config: true },
    })

    const config =
      channel?.config && typeof channel.config === 'object'
        ? (channel.config as Record<string, unknown>)
        : {}
    const expectedSecret =
      typeof config['webhookSecret'] === 'string' ? (config['webhookSecret'] as string) : ''

    if (expectedSecret) {
      const provided = (req.headers['x-webhook-secret'] as string) ?? ''
      if (!secretMatches(provided, expectedSecret)) {
        return res.status(401).json({ error: 'Invalid webhook secret' })
      }
    } else {
      // No secret configured — allow for backward compatibility, but warn.
      console.warn(
        '[email.webhook] No webhookSecret configured for workspace',
        workspaceId,
        '— accepting unauthenticated inbound email'
      )
    }

    await handleInboundEmail(workspaceId, req.body as Record<string, unknown>)
    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    console.error('[email.webhook] Error processing inbound email:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
