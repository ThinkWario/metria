import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { getMetaEventsSummaryHandler, getMetaEventsRecentHandler } from './metaEvents.controller'

const router = Router()

router.get('/meta-events/summary', authenticate, getMetaEventsSummaryHandler)
router.get('/meta-events/recent', authenticate, getMetaEventsRecentHandler)

export default router
