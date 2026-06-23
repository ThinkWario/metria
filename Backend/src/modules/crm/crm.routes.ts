import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import {
  listContactsHandler, getContactHandler, createContactHandler, updateContactHandler,
  addNoteHandler, addTagHandler, removeTagHandler, calculateHealthScoreHandler,
  bulkUpdateContactsHandler, bulkDeleteContactsHandler,
  listPipelinesHandler, createPipelineHandler,
  createStageHandler, updateStageHandler, deleteStageHandler, reorderStagesHandler,
  listDealsHandler, createDealHandler, moveDealHandler, closeDealHandler, updateDealHandler,
  deleteDealHandler, getWorkspaceUsersHandler,
  pipelineAnalyticsHandler,
  listTicketsHandler, createTicketHandler, updateTicketHandler, resolveTicketHandler,
  listTasksHandler, completeTaskHandler
} from './crm.controller'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// Contacts
router.get('/crm/contacts', ...auth, listContactsHandler)
router.post('/crm/contacts', ...auth, createContactHandler)
router.post('/crm/contacts/bulk-update', ...auth, bulkUpdateContactsHandler)
router.post('/crm/contacts/bulk-delete', ...auth, bulkDeleteContactsHandler)
router.get('/crm/contacts/:contactId', ...auth, getContactHandler)
router.patch('/crm/contacts/:contactId', ...auth, updateContactHandler)
router.post('/crm/contacts/:contactId/notes', ...auth, addNoteHandler)
router.post('/crm/contacts/:contactId/tags', ...auth, addTagHandler)
router.delete('/crm/contacts/:contactId/tags/:tagId', ...auth, removeTagHandler)
router.post('/crm/contacts/:contactId/health-score', ...auth, calculateHealthScoreHandler)

// Pipelines + Deals
router.get('/crm/pipelines', ...auth, listPipelinesHandler)
router.post('/crm/pipelines', ...auth, createPipelineHandler)
router.get('/crm/pipelines/:pipelineId/analytics', ...auth, pipelineAnalyticsHandler)

// ROI summary — cross ad spend with deal/contact revenue
router.get('/crm/pipelines/:pipelineId/roi-summary', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { pipelineId } = req.params

    // 1. Get all deals in the pipeline (with contact email)
    const deals = await prisma.deal.findMany({
      where: { pipelineId, workspaceId },
      include: { contact: { select: { id: true, email: true } } }
    })

    // 2. Workspace ROAS last 30 days from DailyMetric
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const metrics = await prisma.dailyMetric.findMany({
      where: { workspaceId, date: { gte: since } },
      select: { totalRevenue: true, metaAdSpend: true, googleAdSpend: true }
    })
    const totalRevenue30d = metrics.reduce((s, m) => s + Number(m.totalRevenue), 0)
    const totalAdSpend30d = metrics.reduce((s, m) => s + Number(m.metaAdSpend) + Number(m.googleAdSpend), 0)
    const workspaceROAS = totalAdSpend30d > 0 ? totalRevenue30d / totalAdSpend30d : 0

    // 3. For WON deals where contact has email: batch-fetch orders
    const wonDeals = deals.filter(d => d.status === 'WON' && d.contact?.email)
    const emails = wonDeals.map(d => d.contact?.email).filter(Boolean) as string[]

    const contactRevenues: Record<string, number> = {}
    if (emails.length > 0) {
      const allOrders = await prisma.order.findMany({
        where: { workspaceId, customerEmail: { in: emails } },
        select: { customerEmail: true, totalPrice: true }
      })
      // Build email → total map
      const revenueByEmail: Record<string, number> = {}
      for (const order of allOrders) {
        if (!order.customerEmail) continue
        revenueByEmail[order.customerEmail] = (revenueByEmail[order.customerEmail] ?? 0) + Number(order.totalPrice)
      }
      // Map back to contactId
      for (const deal of wonDeals) {
        const email = deal.contact?.email
        if (email && revenueByEmail[email]) {
          contactRevenues[deal.contactId] = (contactRevenues[deal.contactId] ?? 0) + revenueByEmail[email]
        }
      }
    }

    // 4. Stage stats
    const stageStats: Record<string, { dealCount: number; totalValue: number }> = {}
    for (const deal of deals) {
      if (!stageStats[deal.stageId]) stageStats[deal.stageId] = { dealCount: 0, totalValue: 0 }
      stageStats[deal.stageId].dealCount++
      stageStats[deal.stageId].totalValue += Number(deal.value)
    }

    res.json({ workspaceROAS, totalRevenue30d, totalAdSpend30d, contactRevenues, stageStats })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
// Stage CRUD — reorder must come before /:stageId to avoid param collision
router.post('/crm/pipelines/:pipelineId/stages/reorder', ...auth, reorderStagesHandler)
router.post('/crm/pipelines/:pipelineId/stages', ...auth, createStageHandler)
router.patch('/crm/pipelines/:pipelineId/stages/:stageId', ...auth, updateStageHandler)
router.delete('/crm/pipelines/:pipelineId/stages/:stageId', ...auth, deleteStageHandler)
router.get('/crm/workspace/users', ...auth, getWorkspaceUsersHandler)
router.get('/crm/deals', ...auth, listDealsHandler)
router.post('/crm/deals', ...auth, createDealHandler)
router.patch('/crm/deals/:dealId/move', ...auth, moveDealHandler)
router.patch('/crm/deals/:dealId/close', ...auth, closeDealHandler)
router.patch('/crm/deals/:dealId', ...auth, updateDealHandler)
router.delete('/crm/deals/:dealId', ...auth, deleteDealHandler)

// Tickets
router.get('/crm/tickets', ...auth, listTicketsHandler)
router.post('/crm/tickets', ...auth, createTicketHandler)
router.patch('/crm/tickets/:ticketId', ...auth, updateTicketHandler)
router.post('/crm/tickets/:ticketId/resolve', ...auth, resolveTicketHandler)

// Tasks
router.get('/crm/tasks', ...auth, listTasksHandler)
router.patch('/crm/tasks/:taskId/complete', ...auth, completeTaskHandler)

export default router
