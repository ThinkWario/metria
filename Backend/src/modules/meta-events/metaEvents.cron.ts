import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { sendAndRecord, MAX_ATTEMPTS } from './metaEvents.capi'

/**
 * Sweeps ConversionEvent rows stuck in pending/retry (network error, 429,
 * 5xx) and retries them with the pixelId/accessToken stored on the row's
 * workspace at retry time — never gives up before MAX_ATTEMPTS, matching
 * the spec's "retry exponencial para 429 y 5xx" rule.
 */
export async function retryPendingConversionEvents(): Promise<void> {
  const due = await prisma.conversionEvent.findMany({
    where: {
      status: { in: ['pending', 'retry'] },
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    take: 50
  })

  for (const row of due) {
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId: row.workspaceId, platform: 'meta' } }
    })
    const config = (integration?.config ?? {}) as { accessToken?: string; pixelId?: string }
    if (!config.pixelId || !config.accessToken || !row.payload) continue
    await sendAndRecord(row.id, config.pixelId, config.accessToken, row.payload)
  }

  // sendAndRecord already flips a row to 'dead_letter' the moment its
  // attemptCount hits MAX_ATTEMPTS, so it drops out of `due` on its own —
  // this is just the operator-facing signal that it happened.
  const deadLettered = await prisma.conversionEvent.count({ where: { status: 'dead_letter' } })
  if (deadLettered > 0) console.warn(`[MetaEventsCron] ${deadLettered} event(s) in dead_letter — exhausted ${MAX_ATTEMPTS} attempts`)
}

export function startMetaEventsRetryCron(): void {
  cron.schedule('*/5 * * * *', () => {
    retryPendingConversionEvents().catch(err => console.error('[Cron: MetaEventsRetry] Error:', err))
  })
  console.log('[MetaEventsRetryCron] Scheduled every 5 minutes')
}
