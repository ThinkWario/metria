import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as cs from './campaigns.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// ── List ───────────────────────────────────────────────────────────────────────

router.get('/crm/campaigns', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await cs.listCampaigns(workspaceId))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Preview audience (must be before /:id routes) ──────────────────────────────

router.post('/crm/campaigns/preview-audience', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { segmentId } = req.body as { segmentId?: string }
    if (!segmentId) {
      res.status(400).json({ error: 'segmentId is required' })
      return
    }
    res.json(await cs.previewAudience(workspaceId, segmentId))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Create ─────────────────────────────────────────────────────────────────────

router.post('/crm/campaigns', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const campaign = await cs.createCampaign(workspaceId, req.body)
    res.status(201).json(campaign)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ── Get one (with recipient stats) ─────────────────────────────────────────────

router.get('/crm/campaigns/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await cs.getCampaign(workspaceId, req.params.id))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Update ─────────────────────────────────────────────────────────────────────

router.patch('/crm/campaigns/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await cs.updateCampaign(workspaceId, req.params.id, req.body))
  } catch (err: any) {
    const msg = err.message.toLowerCase()
    const status = msg.includes('not found') ? 404 : 400
    res.status(status).json({ error: err.message })
  }
})

// ── Delete (DRAFT / SCHEDULED only) ────────────────────────────────────────────

router.delete('/crm/campaigns/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    await cs.deleteCampaign(workspaceId, req.params.id)
    res.status(204).send()
  } catch (err: any) {
    const msg = err.message.toLowerCase()
    const status = msg.includes('not found') ? 404 : 400
    res.status(status).json({ error: err.message })
  }
})

// ── Duplicate ─────────────────────────────────────────────────────────────────

router.post('/crm/campaigns/:id/duplicate', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.status(201).json(await cs.duplicateCampaign(workspaceId, req.params.id))
  } catch (err: any) {
    const msg = err.message.toLowerCase()
    const status = msg.includes('not found') ? 404 : 400
    res.status(status).json({ error: err.message })
  }
})

// ── Send now ───────────────────────────────────────────────────────────────────

router.post('/crm/campaigns/:id/send', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await cs.sendCampaign(workspaceId, req.params.id))
  } catch (err: any) {
    const msg = err.message.toLowerCase()
    const status = msg.includes('not found') ? 404 : 400
    res.status(status).json({ error: err.message })
  }
})

export default router
