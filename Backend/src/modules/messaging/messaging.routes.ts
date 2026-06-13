import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  getConversationsHandler,
  getMessagesHandler,
  sendMessageHandler,
  getChannelsHandler,
  upsertChannelConfigHandler,
  handoverToHumanHandler,
  handbackToBotHandler,
  initWhatsAppSessionHandler,
  disconnectWhatsAppSessionHandler
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
router.post('/messaging/conversations/:conversationId/handover', authenticate, requirePlan('PRO', 'SCALE'), handoverToHumanHandler)
router.post('/messaging/conversations/:conversationId/handback', authenticate, requirePlan('PRO', 'SCALE'), handbackToBotHandler)

// Native WhatsApp QR flow
router.post('/messaging/whatsapp/init', authenticate, requirePlan('PRO', 'SCALE'), initWhatsAppSessionHandler)
router.post('/messaging/whatsapp/disconnect', authenticate, requirePlan('PRO', 'SCALE'), disconnectWhatsAppSessionHandler)

export default router
