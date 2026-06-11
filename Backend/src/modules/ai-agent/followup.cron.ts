import cron from 'node-cron'
import { processDueFollowUps } from './followup.service'

/**
 * AI Follow-up Cron
 * Dispatches due follow-up jobs every 15 minutes.
 */
export function startFollowUpCron(): void {
  cron.schedule('*/15 * * * *', () => {
    processDueFollowUps().catch(err => console.error('[Cron: FollowUp] Unhandled error:', err))
  })
  console.log('[FollowUpCron] Scheduled every 15 minutes')
}
