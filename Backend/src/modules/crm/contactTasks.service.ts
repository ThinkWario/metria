import { prisma } from '../../lib/prisma'

interface CreateTaskInput {
  title: string
  description?: string
  dueAt?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}

interface UpdateTaskInput {
  title?: string
  description?: string
  dueAt?: string | null
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  completedAt?: string | null
}

export async function listTasks(workspaceId: string, contactId: string) {
  return prisma.contactTask.findMany({
    where: { workspaceId, contactId },
    orderBy: [
      { completedAt: 'asc' },
      { dueAt: 'asc' },
      { createdAt: 'desc' }
    ]
  })
}

export async function createTask(workspaceId: string, contactId: string, input: CreateTaskInput) {
  return prisma.contactTask.create({
    data: {
      workspaceId,
      contactId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      priority: input.priority ?? 'MEDIUM'
    }
  })
}

export async function updateTask(workspaceId: string, taskId: string, input: UpdateTaskInput) {
  // Verify task belongs to workspaceId before updating
  const existing = await prisma.contactTask.findFirst({
    where: { id: taskId, workspaceId }
  })
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { status: 404 })
  }

  return prisma.contactTask.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
      ...(input.completedAt !== undefined && { completedAt: input.completedAt ? new Date(input.completedAt) : null })
    }
  })
}

export async function deleteTask(workspaceId: string, taskId: string) {
  // Verify task belongs to workspaceId before deleting
  const existing = await prisma.contactTask.findFirst({
    where: { id: taskId, workspaceId }
  })
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { status: 404 })
  }

  return prisma.contactTask.delete({ where: { id: taskId } })
}

export async function completeTask(workspaceId: string, taskId: string) {
  return updateTask(workspaceId, taskId, { completedAt: new Date().toISOString() })
}
