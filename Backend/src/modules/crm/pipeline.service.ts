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

export async function updateDeal(
  workspaceId: string,
  dealId: string,
  data: {
    title?: string
    value?: number
    probability?: number | null
    expectedCloseAt?: string | null
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

  return prisma.deal.update({
    where: { id: dealId, workspaceId },
    data: updateData,
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    }
  })
}
