import { prisma } from '../../lib/prisma'

export interface QuickReplyInput {
  title: string
  content: string
  shortcut?: string | null
}

export async function listQuickReplies(workspaceId: string) {
  return prisma.quickReply.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createQuickReply(workspaceId: string, input: QuickReplyInput) {
  return prisma.quickReply.create({
    data: {
      workspaceId,
      title: input.title,
      content: input.content,
      shortcut: input.shortcut?.trim() || null
    }
  })
}

export async function updateQuickReply(workspaceId: string, id: string, input: Partial<QuickReplyInput>) {
  const existing = await prisma.quickReply.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Quick reply not found')
  return prisma.quickReply.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.shortcut !== undefined && { shortcut: input.shortcut?.trim() || null })
    }
  })
}

export async function deleteQuickReply(workspaceId: string, id: string) {
  const existing = await prisma.quickReply.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Quick reply not found')
  await prisma.quickReply.delete({ where: { id } })
}
