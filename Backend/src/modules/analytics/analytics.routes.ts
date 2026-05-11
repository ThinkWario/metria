import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { listSnapshots, funnelSummary, runAggregation } from './analytics.controller'

const router = Router()

router.get('/analytics/snapshots', authenticate, listSnapshots)
router.get('/analytics/funnel', authenticate, funnelSummary)
router.post('/analytics/run', authenticate, runAggregation)

export default router
