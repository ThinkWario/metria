import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { getContactValue, getRevenueSummary } from './contactValue.service'
import type { AuthRequest } from '../../middleware/auth'
import type { Response } from 'express'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/crm/contacts/:contactId/value', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getContactValue(req.user!.workspaceId!, req.params.contactId)
    res.json(data)
  } catch (e: any) {
    if (e.message === 'Contact not found') return res.status(404).json({ error: e.message })
    res.status(500).json({ error: e.message })
  }
})

router.get('/crm/contacts/:contactId/revenue-summary', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRevenueSummary(req.user!.workspaceId!, req.params.contactId)
    res.json(data)
  } catch (e: any) {
    if (e.message === 'Contact not found') return res.status(404).json({ error: e.message })
    res.status(500).json({ error: e.message })
  }
})

export default router
