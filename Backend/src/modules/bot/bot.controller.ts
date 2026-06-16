import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/auth'
import * as bs from './bot.service'
import * as bh from './businessHours.service'
import { compileSystemPrompt } from '../ai-agent/promptCompiler'
import { prisma } from '../../lib/prisma'

function notFound(msg: string) {
  return msg.toLowerCase().includes('not found') ? 404 : 500
}

export async function listAgentsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listAgents(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, description, avatarUrl } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await bs.createAgent(req.user!.workspaceId!, { name: name.trim(), description, avatarUrl }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function updateAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.updateAgent(req.user!.workspaceId!, req.params.agentId, req.body))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function deleteAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await bs.deleteAgent(req.user!.workspaceId!, req.params.agentId)
    res.json({ ok: true })
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function listFlowsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listFlows(req.user!.workspaceId!, req.params.agentId))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function createFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, triggerType, triggerValue, channel, actions, priority } = req.body
    if (!name?.trim() || !triggerType) { res.status(400).json({ error: 'name and triggerType are required' }); return }
    if (!Array.isArray(actions)) { res.status(400).json({ error: 'actions must be an array' }); return }
    res.status(201).json(await bs.createFlow(req.user!.workspaceId!, req.params.agentId, { name: name.trim(), triggerType, triggerValue, channel, actions, priority }))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function updateFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.updateFlow(req.user!.workspaceId!, req.params.flowId, req.body))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function deleteFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await bs.deleteFlow(req.user!.workspaceId!, req.params.flowId)
    res.json({ ok: true })
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function listFollowUpRulesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listFollowUpRules(req.user!.workspaceId!, req.params.botId))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function createFollowUpRuleHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { delayHours, order, isActive } = req.body
    if (typeof delayHours !== 'number' || delayHours <= 0) {
      res.status(400).json({ error: 'delayHours must be a positive number' }); return
    }
    res.status(201).json(await bs.createFollowUpRule(req.user!.workspaceId!, req.params.botId, { delayHours, order, isActive }))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function deleteFollowUpRuleHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await bs.deleteFollowUpRule(req.user!.workspaceId!, req.params.botId, req.params.ruleId)
    res.json({ ok: true })
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function getBusinessHoursHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await bh.getBusinessHours(req.user!.workspaceId!)
    res.json(result ?? {})
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function upsertBusinessHoursHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bh.upsertBusinessHours(req.user!.workspaceId!, req.body))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function getPrimaryAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.getPrimaryAgent(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function previewPromptHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId!
    const agent = await bs.getPrimaryAgent(workspaceId)
    const profile = (agent.config as any)?.profile ?? null
    const prompt = compileSystemPrompt({
      agent: { name: agent.name, tone: agent.tone, promptBase: agent.promptBase },
      profile,
      knowledgeChunks: [],
      contact: null,
      deal: null
    })
    res.json({ prompt })
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function listAiChannelsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listChannelsWithAiStatus(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function toggleChannelAiHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { platform } = req.params
    const { enabled } = req.body
    res.json(await bs.toggleChannelAi(req.user!.workspaceId!, platform, enabled))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function applyTemplateHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { template } = req.body
    if (!template) { res.status(400).json({ error: 'template is required' }); return }
    res.json(await bs.applyTemplate(req.user!.workspaceId!, req.params.botId, template))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found')
      ? 404
      : err.message.startsWith('Unknown template') ? 400 : 500
    res.status(status).json({ error: err.message })
  }
}
