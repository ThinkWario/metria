import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as ss from './segments.service'
import type { SegmentFilters } from './segments.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// ── List ───────────────────────────────────────────────────────────────────────

router.get('/crm/segments', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await ss.listSegments(workspaceId))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Preview (must be before /:id routes) ──────────────────────────────────────

router.post('/crm/segments/preview', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { filters } = req.body as { filters: SegmentFilters }
    if (!filters || !Array.isArray(filters.filters)) {
      res.status(400).json({ error: 'filters is required' })
      return
    }
    const count = await ss.previewSegmentCount(workspaceId, filters)
    res.json({ count })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Create ─────────────────────────────────────────────────────────────────────

router.post('/crm/segments', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { name, description, filters } = req.body
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    if (!filters || !Array.isArray(filters.filters)) {
      res.status(400).json({ error: 'filters is required' })
      return
    }
    const segment = await ss.createSegment(workspaceId, { name: name.trim(), description, filters })
    res.status(201).json(segment)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get one ────────────────────────────────────────────────────────────────────

router.get('/crm/segments/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await ss.getSegment(workspaceId, req.params.id))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Update ─────────────────────────────────────────────────────────────────────

router.patch('/crm/segments/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    res.json(await ss.updateSegment(workspaceId, req.params.id, req.body))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Delete ─────────────────────────────────────────────────────────────────────

router.delete('/crm/segments/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    await ss.deleteSegment(workspaceId, req.params.id)
    res.status(204).send()
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Duplicate ──────────────────────────────────────────────────────────────────

router.post('/crm/segments/:id/duplicate', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const duplicate = await ss.duplicateSegment(workspaceId, req.params.id)
    res.status(201).json(duplicate)
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Get contacts for a segment ─────────────────────────────────────────────────

router.get('/crm/segments/:id/contacts', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const page = parseInt(String(req.query.page ?? '1'), 10)
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? '25'), 10), 100)
    res.json(await ss.getSegmentContacts(workspaceId, req.params.id, page, pageSize))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

export default router
