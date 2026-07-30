import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { getMetaEventsSummaryHandler } from './metaEvents.controller'

const router = Router()

router.get('/meta-events/summary', authenticate, getMetaEventsSummaryHandler)

export default router
