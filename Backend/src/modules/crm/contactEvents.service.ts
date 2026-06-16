import { prisma } from '../../lib/prisma'
import { ContactEventType, Prisma } from '@prisma/client'

export async function listContactEvents(workspaceId: string, contactId: string) {
  return prisma.contactEvent.findMany({
    where: { workspaceId, contactId },
    orderBy: { createdAt: 'desc' },
    take: 100
  })
}

export async function createContactEvent(
  workspaceId: string,
  contactId: string,
  type: ContactEventType,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  return prisma.contactEvent.create({
    data: {
      workspaceId,
      contactId,
      type,
      title,
      description,
      metadata: metadata as Prisma.InputJsonValue | undefined
    }
  })
}
