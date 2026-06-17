import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { resumeRun } from './executor'

/**
 * Workflow Resume Cron
 * Reanuda los runs en estado WAITING cuyo nodo de espera ya venció.
 * Corre cada minuto para mantener baja la latencia de los nodos "esperar".
 */
export function startWorkflowCron(): void {
  cron.schedule('* * * * *', async () => {
    try {
      const due = await prisma.workflowRun.findMany({
        where: { status: 'WAITING', resumeAt: { lte: new Date() } },
        select: { id: true },
        take: 100
      })
      for (const run of due) {
        await resumeRun(run.id).catch(err => console.error('[Cron: Workflow] resume error:', err))
      }
    } catch (err) {
      console.error('[Cron: Workflow] Unhandled error:', err)
    }
  })
  console.log('[WorkflowCron] Scheduled every minute')
}
