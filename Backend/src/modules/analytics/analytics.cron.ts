import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { aggregateChannelSnapshot } from './analytics.service'
import { checkTablesExist } from '../../lib/db-check'

function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function runDailyAggregation(): Promise<void> {
  // Safety check: ensure tables exist
  const exists = await checkTablesExist()
  if (!exists) {
    console.warn('[AnalyticsCron] Tables not found. Database might be syncing. Skipping aggregation.')
    return
  }

  const dateStr = yesterdayUTC()
  console.log(`[AnalyticsCron] Running aggregation for ${dateStr}`)

  try {
    const channels = await prisma.channel.findMany({
      where: { status: { not: 'DISCONNECTED' } },
      select: { id: true, workspaceId: true }
    })

    let ok = 0
    let failed = 0
    for (const ch of channels) {
      try {
        await aggregateChannelSnapshot(ch.workspaceId, ch.id, dateStr)
        ok++
      } catch (err) {
        failed++
        console.error(`[AnalyticsCron] Failed for channel ${ch.id}:`, err)
      }
    }

    console.log(`[AnalyticsCron] Done — ${ok} ok, ${failed} failed`)
  } catch (err: any) {
    console.error('[AnalyticsCron] Error fetching channels:', err.message)
  }
}

export function startAnalyticsCron(): void {
  cron.schedule('0 1 * * *', () => {
    runDailyAggregation().catch(err =>
      console.error('[AnalyticsCron] Unhandled error:', err)
    )
  }, { timezone: 'UTC' })

  console.log('[AnalyticsCron] Scheduled daily at 01:00 UTC')
}
