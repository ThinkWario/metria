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
  changeStatusHandler,
  assignConversationHandler,
  markAsReadHandler,
  markAsUnreadHandler,
  initWhatsAppSessionHandler,
  disconnectWhatsAppSessionHandler
} from './messaging.controller'
import { metaWebhookVerify as gatewayVerify, metaWebhook as gatewayWebhook } from './webhook.gateway'

const router = Router()

// Public webhooks — no JWT
// Meta: single URL per app (no workspaceId), workspace identified by pageId in payload
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)
router.get('/webhooks/meta/:platform', gatewayVerify)
router.post('/webhooks/meta/:platform', gatewayWebhook)

// Authenticated inbox routes — PRO and SCALE plans only
router.get('/messaging/channels', authenticate, requirePlan('PRO', 'SCALE'), getChannelsHandler)
router.post('/messaging/channels/:platform/config', authenticate, requirePlan('PRO', 'SCALE'), upsertChannelConfigHandler)
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversationsHandler)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessagesHandler)
router.post('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), sendMessageHandler)
router.post('/messaging/conversations/:conversationId/handover', authenticate, requirePlan('PRO', 'SCALE'), handoverToHumanHandler)
router.post('/messaging/conversations/:conversationId/handback', authenticate, requirePlan('PRO', 'SCALE'), handbackToBotHandler)
router.patch('/messaging/conversations/:conversationId/status', authenticate, requirePlan('PRO', 'SCALE'), changeStatusHandler)
router.patch('/messaging/conversations/:conversationId/assign', authenticate, requirePlan('PRO', 'SCALE'), assignConversationHandler)
router.patch('/messaging/conversations/:conversationId/read', authenticate, requirePlan('PRO', 'SCALE'), markAsReadHandler)
router.patch('/messaging/conversations/:conversationId/unread', authenticate, requirePlan('PRO', 'SCALE'), markAsUnreadHandler)

// Native WhatsApp QR flow
router.post('/messaging/whatsapp/init', authenticate, requirePlan('PRO', 'SCALE'), initWhatsAppSessionHandler)
router.post('/messaging/whatsapp/disconnect', authenticate, requirePlan('PRO', 'SCALE'), disconnectWhatsAppSessionHandler)

export default router
