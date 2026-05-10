import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  whatsappWebhookVerify,
  whatsappWebhook,
  instagramWebhookVerify,
  instagramWebhook,
  getConversationsHandler,
  getMessagesHandler,
  sendMessageHandler
} from './messaging.controller'

const router = Router()

// Public webhooks — no JWT, identified by workspaceId in URL
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)
router.get('/webhooks/whatsapp/:workspaceId', whatsappWebhookVerify)
router.post('/webhooks/whatsapp/:workspaceId', whatsappWebhook)
router.get('/webhooks/instagram/:workspaceId', instagramWebhookVerify)
router.post('/webhooks/instagram/:workspaceId', instagramWebhook)

// Authenticated inbox routes — PRO and SCALE plans only
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversationsHandler)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessagesHandler)
router.post('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), sendMessageHandler)

export default router
