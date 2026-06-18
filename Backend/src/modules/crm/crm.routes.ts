import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  listContactsHandler, getContactHandler, createContactHandler, updateContactHandler,
  addNoteHandler, addTagHandler, removeTagHandler, calculateHealthScoreHandler,
  bulkUpdateContactsHandler, bulkDeleteContactsHandler,
  listPipelinesHandler, createPipelineHandler,
  listDealsHandler, createDealHandler, moveDealHandler, closeDealHandler, updateDealHandler,
  pipelineAnalyticsHandler,
  listTicketsHandler, createTicketHandler, updateTicketHandler, resolveTicketHandler
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
router.get('/crm/deals', ...auth, listDealsHandler)
router.post('/crm/deals', ...auth, createDealHandler)
router.patch('/crm/deals/:dealId/move', ...auth, moveDealHandler)
router.patch('/crm/deals/:dealId/close', ...auth, closeDealHandler)
router.patch('/crm/deals/:dealId', ...auth, updateDealHandler)

// Tickets
router.get('/crm/tickets', ...auth, listTicketsHandler)
router.post('/crm/tickets', ...auth, createTicketHandler)
router.patch('/crm/tickets/:ticketId', ...auth, updateTicketHandler)
router.post('/crm/tickets/:ticketId/resolve', ...auth, resolveTicketHandler)

export default router
