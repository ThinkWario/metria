import { prisma } from '../../lib/prisma'
import { emitContactEvent } from '../automation/emit'

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', order: 1, isWon: false, isLost: false },
  { name: 'Calificado', color: '#818cf8', order: 2, isWon: false, isLost: false },
  { name: 'Propuesta', color: '#f59e0b', order: 3, isWon: false, isLost: false },
  { name: 'Negociación', color: '#f97316', order: 4, isWon: false, isLost: false },
  { name: 'Ganado', color: '#22c55e', order: 5, isWon: true, isLost: false },
  { name: 'Perdido', color: '#ef4444', order: 6, isWon: false, isLost: true }
]

export async function listPipelines(workspaceId: string) {
  return prisma.pipeline.findMany({
    where: { workspaceId },
    include: {
      stages: { orderBy: { order: 'asc' } },
      _count: { select: { deals: true } }
    },
    orderBy: { isDefault: 'desc' }
  })
}

export async function createPipeline(workspaceId: string, name: string) {
  const existing = await prisma.pipeline.findFirst({ where: { workspaceId } })
  const isDefault = !existing
  return prisma.pipeline.create({
    data: {
      workspaceId,
      name,
      isDefault,
      stages: { create: DEFAULT_STAGES }
    },
    include: { stages: { orderBy: { order: 'asc' } } }
  })
}

export async function listDeals(workspaceId: string, pipelineId?: string) {
  return prisma.deal.findMany({
    where: {
      workspaceId,
      ...(pipelineId && { pipelineId })
    },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createDeal(
  workspaceId: string,
  data: {
    title: string; contactId: string; pipelineId: string; stageId: string
    value?: number; probability?: number | null; expectedCloseAt?: string | null
  }
) {
  const { value, probability, expectedCloseAt, ...rest } = data
  const deal = await prisma.deal.create({
    data: {
      workspaceId,
      ...rest,
      ...(value !== undefined && { value }),
      ...(probability != null && { probability }),
      ...(expectedCloseAt && { expectedCloseAt: new Date(expectedCloseAt) })
    },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    }
  })

  await emitContactEvent(
    workspaceId, deal.contactId, 'DEAL_CREATED',
    `Deal creado: ${deal.title}`, undefined,
    { dealId: deal.id, stageId: deal.stageId, value: value ?? 0 }
  )

  return deal
}

export async function moveDeal(workspaceId: string, dealId: string, stageId: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId: deal.pipelineId }
  })
  if (!stage) throw new Error('Stage not found')

  const now = new Date()
  const extra: Record<string, unknown> = {}
  if (stage.isWon) { extra.status = 'WON'; extra.wonAt = now }
  else if (stage.isLost) { extra.status = 'LOST'; extra.lostAt = now }

  const updated = await prisma.deal.update({
    where: { id: dealId, workspaceId },
    data: { stageId, ...extra }
  })

  const meta = { dealId, stageId, stageName: stage.name }
  await emitContactEvent(workspaceId, deal.contactId, 'DEAL_STAGE_CHANGED', `Deal movido a ${stage.name}`, undefined, meta)
  if (stage.isWon) await emitContactEvent(workspaceId, deal.contactId, 'DEAL_WON', `Deal ganado: ${deal.title}`, undefined, meta)
  else if (stage.isLost) await emitContactEvent(workspaceId, deal.contactId, 'DEAL_LOST', `Deal perdido: ${deal.title}`, undefined, meta)

  return updated
}

export async function closeDeal(
  workspaceId: string,
  dealId: string,
  outcome: 'WON' | 'LOST',
  lostReason?: string
) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')

  const now = new Date()
  const data =
    outcome === 'WON'
      ? { status: 'WON', wonAt: now }
      : { status: 'LOST', lostAt: now, lostReason: lostReason ?? null }

  const updated = await prisma.deal.update({ where: { id: dealId, workspaceId }, data })

  await emitContactEvent(
    workspaceId, deal.contactId,
    outcome === 'WON' ? 'DEAL_WON' : 'DEAL_LOST',
    `Deal ${outcome === 'WON' ? 'ganado' : 'perdido'}: ${deal.title}`,
    lostReason ?? undefined,
    { dealId }
  )

  return updated
}

export async function getPipelineAnalytics(workspaceId: string, pipelineId: string) {
  const [allDeals, stages, lostReasonsRaw] = await Promise.all([
    prisma.deal.findMany({
      where: { workspaceId, pipelineId },
      select: { value: true, probability: true, status: true }
    }),
    prisma.pipelineStage.findMany({
      where: { pipelineId },
      include: { deals: { where: { workspaceId } } },
      orderBy: { order: 'asc' }
    }),
    prisma.deal.groupBy({
      by: ['lostReason'],
      where: { workspaceId, pipelineId, lostReason: { not: null } },
      _count: true
    })
  ])

  const totalDeals = allDeals.length
  const totalValue = allDeals.reduce((sum, d) => sum + Number(d.value), 0)
  const weightedValue = allDeals.reduce((sum, d) => {
    return sum + Number(d.value) * ((d.probability ?? 0) / 100)
  }, 0)
  const wonValue = allDeals
    .filter(d => d.status === 'WON')
    .reduce((sum, d) => sum + Number(d.value), 0)
  const lostCount = allDeals.filter(d => d.status === 'LOST').length

  const stageMetrics = stages.map(stage => {
    const deals = stage.deals
    const dealCount = deals.length
    const totalStageValue = deals.reduce((sum, d) => sum + Number(d.value), 0)
    const avgDaysInStage =
      dealCount > 0
        ? deals.reduce((sum, d) => {
            return sum + (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          }, 0) / dealCount
        : null
    return {
      stageId: stage.id,
      stageName: stage.name,
      dealCount,
      totalValue: totalStageValue,
      avgDaysInStage
    }
  })

  const lostReasons = lostReasonsRaw.map(r => ({
    reason: r.lostReason as string,
    count: r._count
  }))

  return { totalDeals, totalValue, weightedValue, wonValue, lostCount, stageMetrics, lostReasons }
}

export async function updateDeal(
  workspaceId: string,
  dealId: string,
  data: {
    title?: string
    value?: number
    probability?: number | null
    expectedCloseAt?: string | null
    assignedToUserId?: string | null
  }
) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')

  const updateData: Record<string, unknown> = {}
  if (data.title !== undefined) updateData.title = data.title.trim()
  if (data.value !== undefined) updateData.value = data.value
  if (data.probability !== undefined) updateData.probability = data.probability
  if (data.expectedCloseAt !== undefined) {
    updateData.expectedCloseAt = data.expectedCloseAt ? new Date(data.expectedCloseAt) : null
  }
  if (data.assignedToUserId !== undefined) updateData.assignedToUserId = data.assignedToUserId

  return prisma.deal.update({
    where: { id: dealId },
    data: updateData,
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    }
  })
}

export async function deleteDeal(workspaceId: string, dealId: string): Promise<void> {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')
  await prisma.deal.delete({ where: { id: dealId } })
}

export async function listWorkspaceUsers(workspaceId: string) {
  return prisma.user.findMany({
    where: { workspaceId },
    select: { id: true, name: true, email: true }
  })
}

// ── Stage CRUD ────────────────────────────────────────────────────────────────

export async function createStage(
  workspaceId: string,
  pipelineId: string,
  data: { name: string; color?: string; order?: number }
) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
  if (!pipeline) throw new Error('Pipeline not found')

  let order = data.order
  if (order === undefined) {
    const maxStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { order: 'desc' }
    })
    order = (maxStage?.order ?? 0) + 1
  }

  return prisma.pipelineStage.create({
    data: { pipelineId, name: data.name, color: data.color ?? '#6366f1', order }
  })
}

export async function updateStage(
  workspaceId: string,
  pipelineId: string,
  stageId: string,
  data: { name?: string; color?: string }
) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
  if (!pipeline) throw new Error('Pipeline not found')

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } })
  if (!stage) throw new Error('Stage not found')

  return prisma.pipelineStage.update({
    where: { id: stageId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.color !== undefined && { color: data.color })
    }
  })
}

export async function deleteStage(
  workspaceId: string,
  pipelineId: string,
  stageId: string
) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
  if (!pipeline) throw new Error('Pipeline not found')

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } })
  if (!stage) throw new Error('Stage not found')

  const dealCount = await prisma.deal.count({ where: { stageId, workspaceId } })
  if (dealCount > 0) {
    const err = new Error('Mueve los deals primero') as Error & { code: string }
    err.code = 'STAGE_HAS_DEALS'
    throw err
  }

  await prisma.pipelineStage.delete({ where: { id: stageId } })

  // Renumber remaining stages
  const remaining = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    orderBy: { order: 'asc' }
  })
  if (remaining.length > 0) {
    await prisma.$transaction(
      remaining.map((s, idx) =>
        prisma.pipelineStage.update({ where: { id: s.id }, data: { order: idx + 1 } })
      )
    )
  }
}

export async function reorderStages(
  workspaceId: string,
  pipelineId: string,
  orderedIds: string[]
) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
  if (!pipeline) throw new Error('Pipeline not found')

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.pipelineStage.update({ where: { id }, data: { order: idx + 1 } })
    )
  )
}
