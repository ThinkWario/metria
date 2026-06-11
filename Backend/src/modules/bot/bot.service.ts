import { prisma } from '../../lib/prisma'
import { SOLAR_TEMPLATE } from './templates/solar.template'

export async function listAgents(workspaceId: string) {
  return prisma.botAgent.findMany({
    where: { workspaceId },
    include: { _count: { select: { flows: true } } },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createAgent(
  workspaceId: string,
  data: { name: string; description?: string; avatarUrl?: string }
) {
  return prisma.botAgent.create({ data: { workspaceId, ...data } })
}

export async function updateAgent(
  workspaceId: string,
  agentId: string,
  data: { name?: string; isActive?: boolean; description?: string; config?: Record<string, any> }
) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botAgent.update({ where: { id: agentId, workspaceId }, data })
}

export async function deleteAgent(workspaceId: string, agentId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  await prisma.botAgent.delete({ where: { id: agentId, workspaceId } })
}

export async function listFlows(workspaceId: string, botAgentId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botFlow.findMany({
    where: { botAgentId, workspaceId },
    orderBy: { priority: 'asc' }
  })
}

export interface CreateFlowData {
  name: string
  triggerType: string
  triggerValue?: string
  channel?: string
  actions: unknown[]
  priority?: number
}

export async function createFlow(
  workspaceId: string,
  botAgentId: string,
  data: CreateFlowData
) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botFlow.create({
    data: {
      workspaceId,
      botAgentId,
      name: data.name,
      triggerType: data.triggerType,
      triggerValue: data.triggerValue,
      channel: data.channel ?? 'ALL',
      actions: data.actions as any,
      priority: data.priority ?? 100
    }
  })
}

export async function updateFlow(
  workspaceId: string,
  flowId: string,
  data: Partial<CreateFlowData> & { isActive?: boolean }
) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } })
  if (!flow) throw new Error('Flow not found')
  return prisma.botFlow.update({ where: { id: flowId, workspaceId }, data: data as any })
}

export async function deleteFlow(workspaceId: string, flowId: string) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } })
  if (!flow) throw new Error('Flow not found')
  await prisma.botFlow.delete({ where: { id: flowId, workspaceId } })
}

export async function listFollowUpRules(workspaceId: string, botAgentId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.followUpRule.findMany({
    where: { workspaceId, botAgentId },
    orderBy: { order: 'asc' }
  })
}

export async function createFollowUpRule(
  workspaceId: string,
  botAgentId: string,
  data: { delayHours: number; order?: number; isActive?: boolean }
) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.followUpRule.create({
    data: {
      workspaceId,
      botAgentId,
      delayHours: data.delayHours,
      order: data.order ?? 0,
      isActive: data.isActive ?? true
    }
  })
}

export async function deleteFollowUpRule(workspaceId: string, botAgentId: string, ruleId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  const rule = await prisma.followUpRule.findFirst({ where: { id: ruleId, workspaceId, botAgentId } })
  if (!rule) throw new Error('Rule not found')
  await prisma.followUpRule.delete({ where: { id: ruleId } })
}

export async function getPrimaryAgent(workspaceId: string) {
  let agent = await prisma.botAgent.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
  if (!agent) {
    agent = await prisma.botAgent.create({
      data: { workspaceId, name: 'Asistente Metria', tone: 'neutral' }
    })
  }
  return agent
}

export async function toggleChannelAi(workspaceId: string, platform: string, isAiEnabled: boolean) {
  const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: platform.toUpperCase() } })
  if (!channel) throw new Error('Channel not found')
  return prisma.channel.update({
    where: { id: channel.id },
    data: { isAiEnabled }
  })
}

export async function listChannelsWithAiStatus(workspaceId: string) {
  return prisma.channel.findMany({
    where: { workspaceId },
    select: { platform: true, name: true, status: true, isAiEnabled: true }
  })
}

const TEMPLATES: Record<string, unknown> = {
  solar: SOLAR_TEMPLATE
}

export async function applyTemplate(workspaceId: string, botId: string, template: string) {
  if (!TEMPLATES[template]) throw new Error(`Unknown template: ${template}`)
  const agent = await prisma.botAgent.findFirst({ where: { id: botId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  const existing = (agent.config as Record<string, unknown>) ?? {}
  const newConfig = { ...existing, profile: TEMPLATES[template] }
  return prisma.botAgent.update({ where: { id: botId }, data: { config: newConfig as any } })
}
