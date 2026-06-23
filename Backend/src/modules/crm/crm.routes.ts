import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
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
import type { AuthRequest } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// Revenue summary for contact profile (ROAS en contacto)
router.get('/crm/contacts/:id/revenue-summary', ...auth, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.user!.workspaceId!
    const contactId = req.params.id

    const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
    if (!contact) return res.status(404).json({ error: 'Contact not found' })

    const orders = contact.email
      ? await prisma.order.findMany({ where: { workspaceId, customerEmail: contact.email } })
      : []

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0)
    const lastPurchaseDate = orders.length
      ? orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt
      : null

    const since = new Date(Date.now() - 30 * 86_400_000)
    const metrics = await prisma.dailyMetric.aggregate({
      where: { workspaceId, date: { gte: since } },
      _sum: { totalRevenue: true, metaAdSpend: true, googleAdSpend: true, tiktokAdSpend: true, netProfit: true }
    })

    const rev30 = Number(metrics._sum.totalRevenue ?? 0)
    const spend30 =
      Number(metrics._sum.metaAdSpend ?? 0) +
      Number(metrics._sum.googleAdSpend ?? 0) +
      Number(metrics._sum.tiktokAdSpend ?? 0)

    res.json({
      contactRevenue: {
        totalRevenue,
        orderCount: orders.length,
        lastPurchaseDate,
        avgOrderValue: orders.length ? totalRevenue / orders.length : 0
      },
      workspaceContext: {
        avgROAS: spend30 > 0 ? Number((rev30 / spend30).toFixed(2)) : null,
        totalAdSpend30d: spend30,
        totalRevenue30d: rev30,
        netProfit30d: Number(metrics._sum.netProfit ?? 0)
      },
      contactAttribution: {
        source: contact.source ?? null,
        estimatedAdCost: null,
        note: 'Atribución exacta no disponible — mostrando ROAS promedio del workspace'
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

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
