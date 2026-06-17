import { prisma } from '../../lib/prisma'
import type { ContactEventType } from '@prisma/client'

export interface WorkflowInput {
  name: string
  description?: string
  triggerType: ContactEventType
  triggerConfig?: Record<string, any> | null
  nodes?: any[]
  isActive?: boolean
}

export async function listWorkflows(workspaceId: string) {
  return prisma.workflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getWorkflow(workspaceId: string, id: string) {
  const wf = await prisma.workflow.findFirst({
    where: { id, workspaceId },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 20 } }
  })
  if (!wf) throw new Error('Workflow not found')
  return wf
}

export async function createWorkflow(workspaceId: string, data: WorkflowInput) {
  return prisma.workflow.create({
    data: {
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      triggerType: data.triggerType,
      triggerConfig: (data.triggerConfig ?? undefined) as any,
      nodes: (data.nodes ?? []) as any,
      isActive: data.isActive ?? true
    }
  })
}

export async function updateWorkflow(workspaceId: string, id: string, data: Partial<WorkflowInput>) {
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Workflow not found')

  return prisma.workflow.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
      ...(data.triggerConfig !== undefined && { triggerConfig: (data.triggerConfig ?? undefined) as any }),
      ...(data.nodes !== undefined && { nodes: data.nodes as any }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    }
  })
}

export async function deleteWorkflow(workspaceId: string, id: string) {
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Workflow not found')
  await prisma.workflow.delete({ where: { id } })
}

export async function listRuns(workspaceId: string, workflowId: string) {
  return prisma.workflowRun.findMany({
    where: { workspaceId, workflowId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
}
