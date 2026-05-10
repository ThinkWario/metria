import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  getConversations,
  getMessages
} from './messaging.controller'

const router = Router()

// Public webhook — auth via unique workspaceId in URL path (no JWT)
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)

// Protected inbox endpoints — PRO/SCALE only
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversations)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessages)

export default router
