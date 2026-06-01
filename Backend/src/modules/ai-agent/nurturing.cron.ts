import cron from 'node-cron'
import { runAiNurturingCycle } from './nurturing.service'

/**
 * AI Nurturing Cron
 * Schedules the AI Nurturing cycle to run every 6 hours.
 */
export function startNurturingCron(): void {
  cron.schedule('0 */6 * * *', () => {
    runAiNurturingCycle().catch(err => 
      console.error('[Cron: AI Nurturing] Unhandled error:', err)
    )
  })

  console.log('[NurturingCron] Scheduled every 6 hours')
}
