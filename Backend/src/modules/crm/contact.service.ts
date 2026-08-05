import { prisma } from '../../lib/prisma'
import { SOLAR_SOURCE, INCOMPLETE_LEAD_TAG } from '../leads/leadIngestion.service'
import { emitMetaQualifiedLeadEvent } from '../meta-events/metaEvents.service'
import type { SolarResV2Criteria } from '../leads/solarQualifier'

export interface ListContactsOpts {
  search?: string
  status?: string
  leadTemperature?: string
  leadType?: string
  limit?: number
  cursor?: string
  // Wizard drafts (resolveOrCreatePartialContact) create a real Contact
  // tagged Incompleto on every `save` step, most of which never finish —
  // excluded by default so they don't inflate Total Contactos/Leads Activos
  // on the CRM dashboard (QA_E2E_POST_FIXES_05AGO2026.md §10.4). Pass true
  // to audit them (e.g. the cleanup cron, or a future "ver borradores" filter).
  includeIncomplete?: boolean
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
  const { search, status, leadTemperature, leadType, limit = 50, cursor, includeIncomplete } = opts
  const safeLimit = Math.min(limit, 200)
  return prisma.contact.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(leadTemperature && { leadTemperature }),
      ...(leadType && { leadType }),
      ...(!includeIncomplete && { tags: { none: { name: INCOMPLETE_LEAD_TAG } } }),
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

export async function findPossibleDuplicates(workspaceId: string, contactId: string) {
  const source = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { name: true } })
  if (!source?.name?.trim()) return []

  return prisma.contact.findMany({
    where: {
      workspaceId,
      id: { not: contactId },
      name: { equals: source.name.trim(), mode: 'insensitive' }
    },
    select: { id: true, name: true, phone: true, email: true, source: true, createdAt: true, status: true },
    orderBy: { createdAt: 'asc' }
  })
}

export async function mergeContacts(workspaceId: string, survivorId: string, duplicateId: string) {
  if (survivorId === duplicateId) throw new Error('Cannot merge a contact into itself')

  const [survivor, duplicate] = await Promise.all([
    prisma.contact.findFirst({ where: { id: survivorId, workspaceId } }),
    prisma.contact.findFirst({ where: { id: duplicateId, workspaceId } })
  ])
  if (!survivor || !duplicate) throw new Error('Contact not found')

  return prisma.$transaction(async (tx) => {
    await tx.conversation.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.deal.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.ticket.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.invoice.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.contactNote.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.contactEvent.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.contactTask.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.contactHealthScore.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })
    await tx.campaignRecipient.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })

    const survivorTagNames = (await tx.contactTag.findMany({ where: { contactId: survivorId }, select: { name: true } })).map((t: { name: string }) => t.name)
    if (survivorTagNames.length > 0) {
      await tx.contactTag.deleteMany({ where: { contactId: duplicateId, name: { in: survivorTagNames } } })
    }
    await tx.contactTag.updateMany({ where: { contactId: duplicateId }, data: { contactId: survivorId } })

    await tx.contact.delete({ where: { id: duplicateId } })
    await tx.auditLog.create({
      data: {
        workspaceId,
        source: 'CRM',
        event: 'contact.merge',
        status: 'SUCCESS',
        message: `Merged contact ${duplicateId} into ${survivorId}`,
        payload: { survivorId, duplicateId }
      }
    })

    return tx.contact.update({ where: { id: survivorId }, data: {} })
  })
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

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...(input.temperature && { leadTemperature: input.temperature }),
      ...(input.type && { leadType: input.type }),
      ...(input.score !== undefined && { leadScore: input.score }),
      ...(mergedData && { qualificationData: mergedData as any })
    }
  })

  // QualifiedLead a Meta CAPI deshabilitado (doc de aprobación §3):
  // temperature==='HOT' del calificador IA por sí solo no es la "regla
  // versionada completa" que exige la spec. Reactivar junto con esa regla.

  return updated
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

/**
 * "Validación humana autorizada" — la alternativa explícita que
 * INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9 ofrece
 * a la regla automática solar_res_v2 completa ("regla solar_res_v2 o
 * validación humana autorizada"). Requerir esta confirmación explícita —
 * en vez de disparar QualifiedLead solo porque los 4 criterios automáticos
 * dieron true — es además la forma más defendible de cubrir
 * next_step_confirmed sin inventar una heurística no especificada en los
 * documentos de negocio: quien confirma está, por definición, confirmando
 * que corresponde el siguiente paso.
 */
export async function confirmQualifiedLead(
  workspaceId: string,
  contactId: string,
  actorUserId: string,
  options: { override?: boolean; overrideReason?: string } = {}
) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  if (contact.source !== SOLAR_SOURCE) {
    throw new Error('Only solar_direct contacts support solar_res_v2 QualifiedLead confirmation')
  }

  const qualificationData = (contact.qualificationData as Record<string, any>) ?? {}
  if (qualificationData.qualifiedLeadConfirmedAt) {
    throw new Error('QualifiedLead already confirmed for this contact')
  }

  if (!contact.email && !contact.phone) {
    throw new Error('Contact has no valid email or phone — cannot confirm QualifiedLead without identity')
  }

  const criteria = qualificationData.solarResV2Criteria as SolarResV2Criteria | undefined
  if (!criteria) throw new Error('No solar_res_v2 criteria computed yet for this contact')

  const allCriteriaMet = criteria.serviceAreaMatch && criteria.ownerOrDecisionMaker
    && criteria.technicalFitPreliminary && criteria.billBandEligible

  if (!allCriteriaMet && !options.override) {
    throw new Error('solar_res_v2 criteria not fully met — pass override:true with overrideReason to confirm manually')
  }
  if (options.override && !options.overrideReason?.trim()) {
    throw new Error('overrideReason is required when overriding solar_res_v2 criteria')
  }

  const updatedQualificationData = {
    ...qualificationData,
    qualificationVersion: 'solar_res_v2',
    nextStepConfirmed: true,
    qualifiedLeadConfirmedBy: actorUserId,
    qualifiedLeadConfirmedAt: new Date().toISOString(),
    ...(options.override && { qualifiedLeadOverrideReason: options.overrideReason!.trim().slice(0, 500) })
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id, workspaceId },
    data: { qualificationData: updatedQualificationData as any }
  })

  let capiDelivered = true
  try {
    await emitMetaQualifiedLeadEvent(workspaceId, updated, 'system_generated', {
      qualificationVersion: 'solar_res_v2',
      serviceAreaMatch: criteria.serviceAreaMatch
    })
  } catch (err) {
    console.error('[ContactService] QualifiedLead event failed:', err)
    capiDelivered = false
  }

  return { ...updated, capiDelivered }
}
