import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import { getKnowledgeSourceHandler, syncMetaKnowledgeHandler } from './knowledge.controller'

const router = Router()

router.get('/meta-ai/data-source', authenticate, requirePlan('SCALE'), getKnowledgeSourceHandler)
router.post('/meta-ai/sync', authenticate, requirePlan('SCALE'), syncMetaKnowledgeHandler)

export default router
