import { prisma } from '../../lib/prisma'

export interface ListContactsOpts {
  search?: string
  status?: string
  leadTemperature?: string
  leadType?: string
  limit?: number
  cursor?: string
}

export async function createContact(workspaceId: string, data: { name: string; email?: string; phone?: string; status?: string }) {
  return prisma.contact.create({
    data: {
      workspaceId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      status: (data.status as any) || 'LEAD',
      source: 'MANUAL'
    },
    include: {
      tags: true,
      _count: { select: { conversations: true, deals: true, tickets: true } }
    }
  })
}

export async function listContacts(workspaceId: string, opts: ListContactsOpts = {}) {
  const { search, status, leadTemperature, leadType, limit = 50, cursor } = opts
  const safeLimit = Math.min(limit, 200)
  return prisma.contact.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(leadTemperature && { leadTemperature }),
      ...(leadType && { leadType }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(cursor && { createdAt: { lt: new Date(cursor) } })
    },
    include: {
      tags: true,
      _count: { select: { conversations: true, deals: true, tickets: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit
  })
}

export async function getContact(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tags: true,
      contactNotes: { orderBy: { createdAt: 'desc' }, take: 20 },
      deals: {
        include: {
          stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
          pipeline: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
      conversations: {
        include: { channel: { select: { platform: true, name: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10
      },
      healthScores: { orderBy: { calculatedAt: 'desc' }, take: 1 }
    }
  })
  if (!contact) throw new Error('Contact not found')
  return contact
}

export async function updateContact(
  workspaceId: string,
  contactId: string,
  data: {
    name?: string
    email?: string | null
    phone?: string | null
    status?: string
    temperature?: string | null
    contactType?: string | null
    ltv?: number
    shopifyCustomerId?: string
  }
) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  const { name, email, phone, status, temperature, contactType, ltv, shopifyCustomerId } = data
  return prisma.contact.update({
    where: { id: contactId, workspaceId },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(status !== undefined && { status }),
      ...(temperature !== undefined && { leadTemperature: temperature }),
      ...(contactType !== undefined && { leadType: contactType }),
      ...(ltv !== undefined && { ltv }),
      ...(shopifyCustomerId !== undefined && { shopifyCustomerId }),
    }
  })
}

export async function addNote(workspaceId: string, contactId: string, userId: string, content: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  return prisma.contactNote.create({ data: { workspaceId, contactId, userId, content } })
}

export async function addTag(workspaceId: string, contactId: string, name: string, color = '#6366f1') {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  return prisma.contactTag.upsert({
    where: { contactId_name: { contactId, name } },
    create: { workspaceId, contactId, name, color },
    update: { color }
  })
}

export async function removeTag(workspaceId: string, contactId: string, tagId: string) {
  const tag = await prisma.contactTag.findFirst({ where: { id: tagId, contactId, workspaceId } })
  if (!tag) throw new Error('Tag not found')
  await prisma.contactTag.delete({ where: { id: tagId } })
}

const TEMPERATURES = ['COLD', 'WARM', 'HOT'] as const
const LEAD_TYPES = ['CURIOUS', 'QUOTING', 'READY_TO_BUY', 'POST_SALE'] as const

export async function updateQualification(
  workspaceId: string,
  contactId: string,
  input: {
    temperature?: typeof TEMPERATURES[number]
    type?: typeof LEAD_TYPES[number]
    score?: number
    data?: Record<string, unknown>
  }
) {
  if (input.temperature && !TEMPERATURES.includes(input.temperature)) throw new Error(`Invalid temperature: ${input.temperature}`)
  if (input.type && !LEAD_TYPES.includes(input.type)) throw new Error(`Invalid lead type: ${input.type}`)
  if (input.score !== undefined && (input.score < 0 || input.score > 100)) throw new Error('Score must be 0-100')

  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const mergedData = input.data
    ? { ...((contact.qualificationData as object) ?? {}), ...input.data }
    : undefined

  return prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...(input.temperature && { leadTemperature: input.temperature }),
      ...(input.type && { leadType: input.type }),
      ...(input.score !== undefined && { leadScore: input.score }),
      ...(mergedData && { qualificationData: mergedData as any })
    }
  })
}

export async function bulkUpdateContacts(
  workspaceId: string,
  ids: string[],
  data: { status?: string; tags?: string[] }
): Promise<number> {
  let count = 0
  if (data.status) {
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids }, workspaceId },
      data: { status: data.status }
    })
    count = result.count
  }
  if (data.tags) {
    for (const id of ids) {
      await prisma.contact.update({
        where: { id, workspaceId },
        data: {
          tags: {
            deleteMany: {},
            createMany: {
              data: data.tags.map(name => ({ workspaceId, name })),
              skipDuplicates: true
            }
          }
        }
      })
    }
    if (!data.status) count = ids.length
  }
  return count
}

export async function bulkDeleteContacts(
  workspaceId: string,
  ids: string[]
): Promise<number> {
  const result = await prisma.contact.deleteMany({
    where: { id: { in: ids }, workspaceId }
  })
  return result.count
}

export async function calculateHealthScore(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tickets: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
      conversations: { select: { lastMessageAt: true }, orderBy: { lastMessageAt: 'desc' }, take: 1 }
    }
  })
  if (!contact) throw new Error('Contact not found')

  const ltvNum = Number(contact.ltv)
  const ltvScore = Math.min(100, (ltvNum / 500) * 100)
  const openTickets = contact.tickets.length
  const noComplaintScore = Math.max(0, 100 - openTickets * 25)
  const lastActive = contact.conversations[0]?.lastMessageAt
  const daysSinceActive = lastActive
    ? (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    : 999
  const activityScore = Math.max(0, 100 - daysSinceActive * 2)

  const score = Math.round(ltvScore * 0.4 + noComplaintScore * 0.3 + activityScore * 0.3)
  const factors = {
    ltvScore: Math.round(ltvScore),
    noComplaintScore,
    activityScore: Math.round(activityScore),
    openTickets
  }

  await prisma.contactHealthScore.create({ data: { contactId, score, factors } })
  await prisma.contact.update({ where: { id: contactId, workspaceId }, data: { healthScore: score } })

  return { score, factors }
}
