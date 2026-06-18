import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/auth'
import * as cs from './contact.service'
import * as ps from './pipeline.service'
import * as ts from './ticket.service'

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
    res.json(await cs.updateContact(req.user!.workspaceId!, req.params.contactId, req.body))
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
    const { title, value, probability, expectedCloseAt } = req.body
    res.json(await ps.updateDeal(req.user!.workspaceId!, req.params.dealId, { title, value, probability, expectedCloseAt }))
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
