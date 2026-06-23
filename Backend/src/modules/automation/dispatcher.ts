import { prisma } from '../../lib/prisma'
import type { ContactEventType } from '@prisma/client'
import { startRun, resumeRun } from './executor'

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
  // Un mensaje entrante reanuda los runs que esperaban respuesta de este contacto.
  if (type === 'MESSAGE_RECEIVED' && contactId) {
    await resumeWaitingForReply(workspaceId, contactId)
  }

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
 * Reanuda los runs en estado WAITING que esperaban una respuesta de este
 * contacto (nodo wait_for_reply). Limpia las marcas en meta y continúa la
 * ejecución desde el cursor guardado.
 */
async function resumeWaitingForReply(workspaceId: string, contactId: string): Promise<void> {
  const waitingRuns = await prisma.workflowRun.findMany({
    where: {
      workspaceId,
      status: 'WAITING',
      meta: { path: ['waitingForContactId'], equals: contactId }
    }
  })
  for (const run of waitingRuns) {
    const existingMeta = (run.meta as Record<string, any>) ?? {}
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        resumeAt: null,
        meta: { ...existingMeta, waitingForReply: false, waitingForContactId: null }
      }
    })
    await resumeRun(run.id).catch(err => console.error('[automation] resume-on-reply error:', err))
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
