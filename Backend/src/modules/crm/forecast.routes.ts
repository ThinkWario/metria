import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { getPipelineForecast } from './forecast.service'
import type { AuthRequest } from '../../middleware/auth'
import type { Response } from 'express'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/crm/pipeline/forecast', ...auth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getPipelineForecast(req.user!.workspaceId!)
    res.json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
