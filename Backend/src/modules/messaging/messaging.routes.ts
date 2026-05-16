import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  metaWebhookVerify,
  metaWebhook,
  getConversationsHandler,
  getMessagesHandler,
  sendMessageHandler,
  getChannelsHandler,
  upsertChannelConfigHandler
} from './messaging.controller'
import { metaWebhookVerify as gatewayVerify, metaWebhook as gatewayWebhook } from './webhook.gateway'

const router = Router()

// Public webhooks — no JWT, identified by workspaceId and platform in URL
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)
router.get('/webhooks/meta/:platform/:workspaceId', gatewayVerify)
router.post('/webhooks/meta/:platform/:workspaceId', gatewayWebhook)

// Authenticated inbox routes — PRO and SCALE plans only
router.get('/messaging/channels', authenticate, requirePlan('PRO', 'SCALE'), getChannelsHandler)
router.post('/messaging/channels/:platform/config', authenticate, requirePlan('PRO', 'SCALE'), upsertChannelConfigHandler)
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversationsHandler)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessagesHandler)
router.post('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), sendMessageHandler)

export default router
