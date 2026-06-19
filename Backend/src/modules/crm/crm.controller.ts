import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/auth'
import * as cs from './contact.service'
import * as ps from './pipeline.service'
import * as ts from './ticket.service'
import { prisma } from '../../lib/prisma'

function notFoundStatus(msg: string) {
  return msg.toLowerCase().includes('not found') ? 404 : 500
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function listContactsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId!
    const { search, status, leadTemperature, leadType, cursor, limit } = req.query as Record<string, string>
    res.json(await cs.listContacts(workspaceId, { search, status, leadTemperature, leadType, cursor, limit: limit ? parseInt(limit, 10) : undefined }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function getContactHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await cs.getContact(req.user!.workspaceId!, req.params.contactId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function createContactHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, email, phone, status } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await cs.createContact(req.user!.workspaceId!, { name, email, phone, status }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function updateContactHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, email, phone, status, temperature, contactType, ltv, shopifyCustomerId } = req.body
    res.json(await cs.updateContact(req.user!.workspaceId!, req.params.contactId, {
      name, email, phone, status, temperature, contactType, ltv, shopifyCustomerId
    }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function addNoteHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { content } = req.body
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
    res.status(201).json(await cs.addNote(req.user!.workspaceId!, req.params.contactId, req.user!.id!, content.trim()))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function addTagHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await cs.addTag(req.user!.workspaceId!, req.params.contactId, name.trim(), color))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function removeTagHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await cs.removeTag(req.user!.workspaceId!, req.params.contactId, req.params.tagId)
    res.status(204).send()
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function calculateHealthScoreHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await cs.calculateHealthScore(req.user!.workspaceId!, req.params.contactId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function bulkUpdateContactsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids, status, tags } = req.body
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'ids array is required' }); return }
    const updated = await cs.bulkUpdateContacts(req.user!.workspaceId!, ids, { status, tags })
    res.json({ updated })
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function bulkDeleteContactsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'ids array is required' }); return }
    const deleted = await cs.bulkDeleteContacts(req.user!.workspaceId!, ids)
    res.json({ deleted })
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

// ── Pipelines + Deals ─────────────────────────────────────────────────────────

export async function listPipelinesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ps.listPipelines(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createPipelineHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await ps.createPipeline(req.user!.workspaceId!, name.trim()))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function listDealsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { pipelineId } = req.query as Record<string, string>
    res.json(await ps.listDeals(req.user!.workspaceId!, pipelineId))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { contactId, pipelineId, stageId, title, value, probability, expectedCloseAt } = req.body
    if (!contactId || !pipelineId || !stageId || !title?.trim()) {
      res.status(400).json({ error: 'contactId, pipelineId, stageId, title are required' }); return
    }
    res.status(201).json(await ps.createDeal(req.user!.workspaceId!, { contactId, pipelineId, stageId, title: title.trim(), value, probability, expectedCloseAt }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function moveDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { stageId } = req.body
    if (!stageId) { res.status(400).json({ error: 'stageId is required' }); return }
    res.json(await ps.moveDeal(req.user!.workspaceId!, req.params.dealId, stageId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function closeDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { outcome, lostReason } = req.body
    if (outcome !== 'WON' && outcome !== 'LOST') { res.status(400).json({ error: 'outcome must be WON or LOST' }); return }
    res.json(await ps.closeDeal(req.user!.workspaceId!, req.params.dealId, outcome, lostReason))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function updateDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { title, value, probability, expectedCloseAt, assignedToUserId } = req.body
    res.json(await ps.updateDeal(req.user!.workspaceId!, req.params.dealId, { title, value, probability, expectedCloseAt, assignedToUserId }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function deleteDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await ps.deleteDeal(req.user!.workspaceId!, req.params.dealId)
    res.status(204).send()
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function getWorkspaceUsersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { workspaceId: req.user!.workspaceId! },
      select: { id: true, name: true, email: true }
    })
    res.json(users)
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function pipelineAnalyticsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ps.getPipelineAnalytics(req.user!.workspaceId!, req.params.pipelineId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

// ── Stage CRUD ────────────────────────────────────────────────────────────────

export async function createStageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color, order } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await ps.createStage(req.user!.workspaceId!, req.params.pipelineId, { name: name.trim(), color, order }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function updateStageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color } = req.body
    res.json(await ps.updateStage(req.user!.workspaceId!, req.params.pipelineId, req.params.stageId, { name, color }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function deleteStageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await ps.deleteStage(req.user!.workspaceId!, req.params.pipelineId, req.params.stageId)
    res.status(204).send()
  } catch (err: any) {
    if ((err as any).code === 'STAGE_HAS_DEALS') { res.status(409).json({ error: err.message }); return }
    res.status(notFoundStatus(err.message)).json({ error: err.message })
  }
}

export async function reorderStagesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { orderedIds } = req.body
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) { res.status(400).json({ error: 'orderedIds array is required' }); return }
    await ps.reorderStages(req.user!.workspaceId!, req.params.pipelineId, orderedIds)
    res.status(204).send()
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export async function listTicketsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, priority, contactId, cursor, limit } = req.query as Record<string, string>
    res.json(await ts.listTickets(req.user!.workspaceId!, { status, priority, contactId, cursor, limit: limit ? parseInt(limit, 10) : undefined }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { contactId, title, description, priority, orderId, conversationId, assignedToUserId } = req.body
    if (!contactId || !title?.trim()) { res.status(400).json({ error: 'contactId and title are required' }); return }
    res.status(201).json(await ts.createTicket(req.user!.workspaceId!, { contactId, title: title.trim(), description, priority, orderId, conversationId, assignedToUserId }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function updateTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ts.updateTicket(req.user!.workspaceId!, req.params.ticketId, req.body))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function resolveTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ts.resolveTicket(req.user!.workspaceId!, req.params.ticketId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function listTasksHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId!
    const filter = (req.query.filter as string) ?? 'all'

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

    const dateFilter: Record<string, unknown> =
      filter === 'today'    ? { dueAt: { gte: startOfToday, lt: startOfTomorrow } } :
      filter === 'overdue'  ? { dueAt: { lt: startOfToday } } :
      filter === 'upcoming' ? { dueAt: { gte: startOfTomorrow } } :
      {}

    const tasks = await prisma.contactTask.findMany({
      where: {
        workspaceId,
        completedAt: null,
        ...dateFilter,
      },
      include: {
        contact: { select: { id: true, name: true } },
      },
      orderBy: [
        { dueAt: { sort: 'asc', nulls: 'last' } },
        { priority: 'desc' },
      ],
    })

    res.json(tasks)
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function completeTaskHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId!
    const { taskId } = req.params

    const task = await prisma.contactTask.findFirst({ where: { id: taskId, workspaceId } })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }

    const updated = await prisma.contactTask.update({
      where: { id: taskId },
      data: { completedAt: new Date() },
      include: { contact: { select: { id: true, name: true } } },
    })

    res.json(updated)
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}
