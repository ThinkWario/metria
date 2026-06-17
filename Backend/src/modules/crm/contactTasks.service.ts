import { prisma } from '../../lib/prisma'
import { emitContactEvent } from '../automation/emit'

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
  const task = await prisma.contactTask.create({
    data: {
      workspaceId,
      contactId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      priority: input.priority ?? 'MEDIUM'
    }
  })
  await emitContactEvent(workspaceId, contactId, 'TASK_CREATED', `Tarea creada: ${task.title}`, undefined, { taskId: task.id })
  return task
}

export async function updateTask(workspaceId: string, taskId: string, input: UpdateTaskInput) {
  // Verify task belongs to workspaceId before updating
  const existing = await prisma.contactTask.findFirst({
    where: { id: taskId, workspaceId }
  })
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { status: 404 })
  }

  const updated = await prisma.contactTask.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
      ...(input.completedAt !== undefined && { completedAt: input.completedAt ? new Date(input.completedAt) : null })
    }
  })

  // Emite TASK_COMPLETED solo en la transición no-completada -> completada
  if (input.completedAt && !existing.completedAt) {
    await emitContactEvent(workspaceId, existing.contactId, 'TASK_COMPLETED', `Tarea completada: ${updated.title}`, undefined, { taskId })
  }

  return updated
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
