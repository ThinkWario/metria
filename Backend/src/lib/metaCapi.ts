import crypto from 'crypto'
import { prisma } from './prisma'

function hashPii(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Sends a server-side Purchase event to Meta's Conversions API for the
 * workspace's connected Pixel. No-ops silently if Meta isn't connected or
 * no pixelId has been configured yet — never throws, so callers (e.g. the
 * Shopify order webhook) can fire this without risking their own response.
 */
export async function sendPurchaseEvent(
  workspaceId: string,
  params: { value: number; currency: string; email?: string; phone?: string }
): Promise<void> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: 'meta' } }
    })
    const config = (integration?.config ?? {}) as { accessToken?: string; pixelId?: string }
    if (!config.pixelId || !config.accessToken) return

    const userData: Record<string, string[]> = {}
    if (params.email) userData.em = [hashPii(params.email)]
    if (params.phone) userData.ph = [hashPii(params.phone)]

    const res = await fetch(`https://graph.facebook.com/v19.0/${config.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: config.accessToken,
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            user_data: userData,
            custom_data: { value: params.value, currency: params.currency }
          }
        ]
      })
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[metaCapi] Purchase event failed for workspace ${workspaceId}: ${res.status} ${detail}`)
    }
  } catch (err) {
    console.error(`[metaCapi] Purchase event error for workspace ${workspaceId}:`, err)
  }
}
