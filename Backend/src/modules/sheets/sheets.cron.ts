import cron from 'node-cron'
import { syncAllActiveSheets } from './sheets.service'

export function startSheetsSyncCron(): void {
  cron.schedule('*/5 * * * *', () => {
    syncAllActiveSheets().catch(err => console.error('[Cron: SheetsSync] Error:', err))
  })
  console.log('[SheetsSyncCron] Scheduled every 5 minutes')
}
