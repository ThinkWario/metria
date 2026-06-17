import { prisma } from '../../lib/prisma'
import type { ContactEventType } from '@prisma/client'
import { startRun } from './executor'

/**
 * Encuentra los workflows activos cuyo trigger coincide con el evento emitido y
 * arranca un run por cada uno. Es fire-and-forget desde el emisor: no debe
 * bloquear la operación de negocio que disparó el evento.
 */
export async function dispatchWorkflows(
  workspaceId: string,
  contactId: string | null,
  type: ContactEventType,
  ctx: { event?: any; metadata?: Record<string, any> }
): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: { workspaceId, isActive: true, triggerType: type }
  })
  if (workflows.length === 0) return

  for (const wf of workflows) {
    if (!matchesTriggerConfig(wf.triggerConfig, ctx)) continue

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        workspaceId,
        contactId: contactId ?? undefined,
        status: 'RUNNING',
        cursor: 0,
        context: (ctx ?? {}) as any
      }
    })
    await prisma.workflow.update({
      where: { id: wf.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() }
    })
    // No await en cadena para no acoplar la latencia de un run con el siguiente
    await startRun(run.id).catch(err => console.error('[automation] run error:', err))
  }
}

/**
 * Filtro opcional del trigger. Si triggerConfig define claves, todas deben
 * coincidir con el metadata del evento. Sin config => siempre coincide.
 */
function matchesTriggerConfig(triggerConfig: any, ctx: { metadata?: Record<string, any> }): boolean {
  if (!triggerConfig || typeof triggerConfig !== 'object') return true
  const meta = ctx?.metadata ?? {}
  return Object.entries(triggerConfig).every(([k, v]) => {
    if (v == null || v === '') return true
    return String(meta[k]) === String(v)
  })
}
