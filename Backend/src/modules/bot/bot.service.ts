import { prisma } from '../../lib/prisma'

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
  data: { name?: string; isActive?: boolean; description?: string }
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
      actions: data.actions,
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
  return prisma.botFlow.update({ where: { id: flowId, workspaceId }, data })
}

export async function deleteFlow(workspaceId: string, flowId: string) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } })
  if (!flow) throw new Error('Flow not found')
  await prisma.botFlow.delete({ where: { id: flowId, workspaceId } })
}
