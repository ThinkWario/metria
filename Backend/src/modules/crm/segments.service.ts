import { prisma } from '../../lib/prisma'

export type FilterField = 'leadScore' | 'temperature' | 'contactType' | 'channel' | 'tags' | 'hasDeals' | 'isActive'
export type FilterOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains' | 'is_true' | 'is_false'

export interface SegmentFilter {
  field: FilterField
  operator: FilterOperator
  value: string | number | string[]
}

export interface SegmentFilters {
  logic: 'AND' | 'OR'
  filters: SegmentFilter[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildSingleFilterClause(filter: SegmentFilter): Record<string, any> | null {
  const { field, operator, value } = filter

  switch (field) {
    case 'leadScore': {
      const num = Number(value)
      if (isNaN(num)) return null
      const opMap: Record<string, string> = { eq: 'equals', gt: 'gt', lt: 'lt', gte: 'gte', lte: 'lte' }
      const prismaOp = opMap[operator]
      if (!prismaOp) return null
      return { leadScore: { [prismaOp]: num } }
    }

    case 'temperature': {
      if (operator === 'eq') return { leadTemperature: String(value) }
      if (operator === 'in' && Array.isArray(value)) return { leadTemperature: { in: value } }
      if (operator === 'contains') return { leadTemperature: { contains: String(value), mode: 'insensitive' } }
      return null
    }

    case 'contactType': {
      if (operator === 'eq') return { leadType: String(value) }
      if (operator === 'in' && Array.isArray(value)) return { leadType: { in: value } }
      if (operator === 'contains') return { leadType: { contains: String(value), mode: 'insensitive' } }
      return null
    }

    case 'channel': {
      if (operator === 'eq') return { source: String(value) }
      if (operator === 'in' && Array.isArray(value)) return { source: { in: value } }
      if (operator === 'contains') return { source: { contains: String(value), mode: 'insensitive' } }
      return null
    }

    case 'tags': {
      if (operator === 'contains') {
        return { tags: { some: { name: { contains: String(value), mode: 'insensitive' } } } }
      }
      if (operator === 'in' && Array.isArray(value)) {
        return { tags: { some: { name: { in: value } } } }
      }
      if (operator === 'eq') {
        return { tags: { some: { name: String(value) } } }
      }
      return null
    }

    case 'hasDeals': {
      if (operator === 'is_true') return { deals: { some: {} } }
      if (operator === 'is_false') return { deals: { none: {} } }
      return null
    }

    case 'isActive': {
      if (operator === 'is_true') return { status: { not: 'CHURNED' } }
      if (operator === 'is_false') return { status: 'CHURNED' }
      return null
    }

    default:
      return null
  }
}

function buildWhereFromFilters(workspaceId: string, filters: SegmentFilters): Record<string, any> {
  const clauses = filters.filters
    .map(buildSingleFilterClause)
    .filter((c): c is Record<string, any> => c !== null)

  if (clauses.length === 0) {
    return { workspaceId }
  }

  if (filters.logic === 'OR') {
    return { workspaceId, OR: clauses }
  }

  // AND (default)
  return { workspaceId, AND: clauses }
}

async function recalculateCount(workspaceId: string, segmentId: string, filters: SegmentFilters) {
  const where = buildWhereFromFilters(workspaceId, filters)
  const count = await prisma.contact.count({ where })
  await prisma.segment.update({
    where: { id: segmentId },
    data: { contactCount: count, lastCalculatedAt: new Date() }
  })
  return count
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function listSegments(workspaceId: string) {
  return prisma.segment.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' }
  })
}

export async function getSegment(workspaceId: string, segmentId: string) {
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, workspaceId }
  })
  if (!segment) throw new Error('Segment not found')
  return segment
}

export async function createSegment(
  workspaceId: string,
  data: { name: string; description?: string; filters: SegmentFilters }
) {
  const segment = await prisma.segment.create({
    data: {
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      filters: data.filters as any,
      contactCount: 0
    }
  })
  await recalculateCount(workspaceId, segment.id, data.filters)
  return prisma.segment.findFirst({ where: { id: segment.id } })
}

export async function updateSegment(
  workspaceId: string,
  segmentId: string,
  data: { name?: string; description?: string; filters?: SegmentFilters }
) {
  const existing = await getSegment(workspaceId, segmentId)

  const updated = await prisma.segment.update({
    where: { id: segmentId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.filters !== undefined && { filters: data.filters as any })
    }
  })

  const activeFilters = data.filters ?? (existing.filters as unknown as SegmentFilters)
  if (activeFilters) {
    await recalculateCount(workspaceId, segmentId, activeFilters)
  }

  return prisma.segment.findFirst({ where: { id: segmentId } })
}

export async function deleteSegment(workspaceId: string, segmentId: string) {
  await getSegment(workspaceId, segmentId) // throws if not found
  return prisma.segment.delete({ where: { id: segmentId } })
}

export async function getSegmentContacts(
  workspaceId: string,
  segmentId: string,
  page = 1,
  pageSize = 25
) {
  const segment = await getSegment(workspaceId, segmentId)
  const filters = segment.filters as unknown as SegmentFilters

  const where = buildWhereFromFilters(workspaceId, filters)
  const skip = (page - 1) * pageSize

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        tags: true,
        _count: { select: { deals: true, conversations: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.contact.count({ where })
  ])

  return {
    contacts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
}

export async function previewSegmentCount(workspaceId: string, filters: SegmentFilters) {
  const where = buildWhereFromFilters(workspaceId, filters)
  return prisma.contact.count({ where })
}
