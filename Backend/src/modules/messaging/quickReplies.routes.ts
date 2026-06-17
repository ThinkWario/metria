import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as qs from './quickReplies.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/messaging/quick-replies', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await qs.listQuickReplies(req.user!.workspaceId!))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/messaging/quick-replies', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, shortcut } = req.body
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'title and content are required' }); return
    }
    const qr = await qs.createQuickReply(req.user!.workspaceId!, { title: title.trim(), content, shortcut })
    res.status(201).json(qr)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/messaging/quick-replies/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await qs.updateQuickReply(req.user!.workspaceId!, req.params.id, req.body))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

router.delete('/messaging/quick-replies/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await qs.deleteQuickReply(req.user!.workspaceId!, req.params.id)
    res.status(204).send()
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

export default router
