import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as es from './contactEvents.service'
import * as ts from './contactTasks.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// ── Events (read-only from UI; written internally by other services) ──────────
router.get('/crm/contacts/:contactId/events', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await es.listContactEvents(req.user!.workspaceId!, req.params.contactId)
    res.json(data)
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/crm/contacts/:contactId/tasks', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await ts.listTasks(req.user!.workspaceId!, req.params.contactId))
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

router.post('/crm/contacts/:contactId/tasks', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await ts.createTask(req.user!.workspaceId!, req.params.contactId, req.body))
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

router.patch('/crm/tasks/:taskId', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await ts.updateTask(req.user!.workspaceId!, req.params.taskId, req.body))
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

router.delete('/crm/tasks/:taskId', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    await ts.deleteTask(req.user!.workspaceId!, req.params.taskId)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

export default router
