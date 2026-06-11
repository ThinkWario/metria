import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  listAgentsHandler, createAgentHandler, updateAgentHandler, deleteAgentHandler,
  listFlowsHandler, createFlowHandler, updateFlowHandler, deleteFlowHandler,
  getBusinessHoursHandler, upsertBusinessHoursHandler,
  getPrimaryAgentHandler, listAiChannelsHandler, toggleChannelAiHandler,
  listFollowUpRulesHandler, createFollowUpRuleHandler, deleteFollowUpRuleHandler
} from './bot.controller'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/bot/agent', ...auth, getPrimaryAgentHandler)
router.patch('/bot/agent/:agentId', ...auth, updateAgentHandler)
router.get('/bot/channels', ...auth, listAiChannelsHandler)
router.patch('/bot/channels/:platform/ai', ...auth, toggleChannelAiHandler)

router.get('/bots/agents', ...auth, listAgentsHandler)
router.post('/bots/agents', ...auth, createAgentHandler)
router.patch('/bots/agents/:agentId', ...auth, updateAgentHandler)
router.delete('/bots/agents/:agentId', ...auth, deleteAgentHandler)

router.get('/bots/agents/:agentId/flows', ...auth, listFlowsHandler)
router.post('/bots/agents/:agentId/flows', ...auth, createFlowHandler)
router.patch('/bots/flows/:flowId', ...auth, updateFlowHandler)
router.delete('/bots/flows/:flowId', ...auth, deleteFlowHandler)

router.get('/bots/:botId/followup-rules', ...auth, listFollowUpRulesHandler)
router.post('/bots/:botId/followup-rules', ...auth, createFollowUpRuleHandler)
router.delete('/bots/:botId/followup-rules/:ruleId', ...auth, deleteFollowUpRuleHandler)

router.get('/bots/business-hours', ...auth, getBusinessHoursHandler)
router.put('/bots/business-hours', ...auth, upsertBusinessHoursHandler)

export default router
