import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { sendCampaign } from './campaigns.service'

/**
 * Campaigns Cron
 * Every minute: finds SCHEDULED campaigns whose scheduledAt is now due and
 * kicks off sendCampaign for each one. The send engine immediately marks them
 * SENDING so a second tick cannot double-fire the same campaign.
 */
export function startCampaignsCron(): void {
  cron.schedule('* * * * *', () => {
    prisma.campaign
      .findMany({
        where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        select: { id: true, workspaceId: true },
      })
      .then((due) => {
        for (const c of due) {
          sendCampaign(c.workspaceId, c.id).catch((err) =>
            console.error(`[Cron: Campaigns] Failed to send campaign ${c.id}:`, err)
          )
        }
      })
      .catch((err) => console.error('[Cron: Campaigns] Query error:', err))
  })
  console.log('[CampaignsCron] Scheduled every minute')
}
