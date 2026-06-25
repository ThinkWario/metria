import { prisma } from '../../lib/prisma'
import { createContactEvent } from '../crm/contactEvents.service'

/**
 * Motor de ejecución de workflows.
 *
 * Un WorkflowRun avanza por una lista ordenada de nodos. Cada nodo es una acción
 * inmediata, un nodo de espera (suspende el run hasta resumeAt) o una condición
 * (guard: si es falsa, detiene el run).
 *
 * REGLA IMPORTANTE: el executor NUNCA llama a emitContactEvent — escribe eventos
 * vía createContactEvent (solo persistencia) para evitar cascadas infinitas de
 * automatizaciones.
 */

type Node = {
  type: string
  config?: Record<string, any>
}

const httpFetch: typeof fetch | undefined = (globalThis as any).fetch

function isSafeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    if (url.protocol !== 'https:') return false
    const hostname = url.hostname.toLowerCase()
    const blocked = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/,
      /^0\./,
      /^metadata\.google\.internal$/,
      /^169\.254\.169\.254$/,
    ]
    return !blocked.some(r => r.test(hostname))
  } catch {
    return false
  }
}

export async function startRun(runId: string): Promise<void> {
  return resumeRun(runId)
}

export async function resumeRun(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true }
  })
  if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return

  const nodes: Node[] = Array.isArray(run.workflow.nodes) ? (run.workflow.nodes as any) : []
  const log: any[] = Array.isArray(run.log) ? (run.log as any) : []

  for (let i = run.cursor; i < nodes.length; i++) {
    const node = nodes[i]

    if (node?.type === 'wait') {
      const cfg = node.config ?? {}
      const ms = ((Number(cfg.hours) || 0) * 60 + (Number(cfg.minutes) || 0)) * 60_000
      const resumeAt = new Date(Date.now() + Math.max(ms, 60_000)) // mínimo 1 min
      log.push({ node: i, type: 'wait', waitingUntil: resumeAt.toISOString() })
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: 'WAITING', cursor: i + 1, resumeAt, log: log as any }
      })
      return
    }

    if (node?.type === 'wait_for_reply') {
      const cfg = node.config ?? {}
      const timeoutHours = Math.max(Number(cfg.timeoutHours) || 24, 1)
      const resumeAt = new Date(Date.now() + timeoutHours * 3_600_000)
      const existingMeta = (run.meta as Record<string, any>) ?? {}
      log.push({ node: i, type: 'wait_for_reply', timeoutAt: resumeAt.toISOString() })
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'WAITING',
          cursor: i + 1,
          resumeAt,
          meta: { ...existingMeta, waitingForReply: true, waitingForContactId: run.contactId },
          log: log as any
        }
      })
      return
    }

    try {
      const cont = await executeNode(run.workspaceId, run.contactId, node, run.context)
      log.push({ node: i, type: node?.type, ok: true, at: new Date().toISOString() })
      if (node?.type === 'branch' && cont === false) {
        log.push({ node: i, type: 'branch', stopped: true })
        break
      }
    } catch (err: any) {
      log.push({ node: i, type: node?.type, ok: false, error: String(err?.message ?? err) })
    }
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', cursor: nodes.length, completedAt: new Date(), log: log as any }
  })
}

async function executeNode(
  workspaceId: string,
  contactId: string | null,
  node: Node,
  context: any
): Promise<boolean | void> {
  const cfg = node?.config ?? {}

  switch (node?.type) {
    case 'add_note':
      if (contactId) {
        await createContactEvent(workspaceId, contactId, 'NOTE_ADDED', cfg.title ?? 'Nota automática', cfg.text)
      }
      return

    case 'create_task':
      if (contactId) {
        await prisma.contactTask.create({
          data: {
            workspaceId,
            contactId,
            title: cfg.title ?? 'Tarea automática',
            description: cfg.description ?? undefined,
            priority: (cfg.priority as any) ?? 'MEDIUM',
            dueAt: cfg.dueInHours ? new Date(Date.now() + Number(cfg.dueInHours) * 3_600_000) : undefined
          }
        })
      }
      return

    case 'update_status':
      if (contactId && cfg.status) {
        await prisma.contact.update({ where: { id: contactId }, data: { status: cfg.status } })
      }
      return

    case 'add_tag':
      if (contactId && cfg.name) {
        await prisma.contactTag.upsert({
          where: { contactId_name: { contactId, name: cfg.name } },
          create: { workspaceId, contactId, name: cfg.name, color: cfg.color ?? '#6366f1' },
          update: { color: cfg.color ?? '#6366f1' }
        })
      }
      return

    case 'remove_tag':
      if (contactId && cfg.name) {
        await prisma.contactTag.deleteMany({ where: { workspaceId, contactId, name: cfg.name } })
      }
      return

    case 'move_deal':
      if (contactId && cfg.stageId) {
        const deal = await prisma.deal.findFirst({
          where: { workspaceId, contactId, status: 'OPEN' },
          orderBy: { createdAt: 'desc' }
        })
        if (deal) await prisma.deal.update({ where: { id: deal.id }, data: { stageId: cfg.stageId } })
      }
      return

    case 'send_campaign': {
      const campaignId = cfg.campaignId
      if (!contactId || !campaignId) return
      const { sendToSingleContact } = await import('../campaigns/campaigns.service')
      await sendToSingleContact({ campaignId, contactId, workspaceId })
      return
    }

    case 'webhook':
      if (cfg.url && httpFetch) {
        if (!isSafeUrl(cfg.url)) {
          console.warn(`[executor] Blocked unsafe webhook URL (SSRF guard): ${cfg.url} (workspace ${workspaceId})`)
          throw new Error('Webhook URL blocked: not a safe public HTTPS endpoint')
        }
        const res = await httpFetch(cfg.url, {
          method: cfg.method ?? 'POST',
          headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
          body: JSON.stringify({ workspaceId, contactId, context }),
          signal: AbortSignal.timeout(10000)
        })
        const len = Number(res.headers.get('content-length') ?? 0)
        if (len > 1_000_000) {
          // Response too large — discard without buffering it into memory.
          await res.body?.cancel()
        }
      }
      return

    case 'branch': {
      if (!contactId) return false
      const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
      return evalCondition(contact, cfg)
    }

    default:
      // Acción desconocida o no implementada aún (p.ej. send_message): se omite.
      return
  }
}

function evalCondition(contact: any, cfg: Record<string, any>): boolean {
  if (!contact || !cfg.field) return true
  const left = contact[cfg.field]
  const right = cfg.value
  switch (cfg.op) {
    case 'eq': return String(left) === String(right)
    case 'neq': return String(left) !== String(right)
    case 'gt': return Number(left) > Number(right)
    case 'gte': return Number(left) >= Number(right)
    case 'lt': return Number(left) < Number(right)
    case 'lte': return Number(left) <= Number(right)
    case 'contains': return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase())
    case 'is_true': return left === true
    case 'is_false': return left === false || left == null
    default: return true
  }
}
