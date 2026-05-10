import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    pipeline: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    deal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
}))

import { listPipelines, createPipeline, listDeals, createDeal, moveDeal, closeDeal } from '../pipeline.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listPipelines', () => {
  it('returns pipelines with stages', async () => {
    const mock = [{ id: 'p1', name: 'Ventas', stages: [], _count: { deals: 3 } }]
    vi.mocked(prisma.pipeline.findMany).mockResolvedValue(mock as any)
    const result = await listPipelines(WS)
    expect(prisma.pipeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
    expect(result).toEqual(mock)
  })
})

describe('createPipeline', () => {
  it('creates pipeline with 6 default stages', async () => {
    vi.mocked(prisma.pipeline.findFirst).mockResolvedValue(null) // no existing pipeline → isDefault = true
    vi.mocked(prisma.pipeline.create).mockResolvedValue({ id: 'p1', name: 'Ventas', isDefault: true, stages: [] } as any)
    await createPipeline(WS, 'Ventas')
    expect(prisma.pipeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WS,
          name: 'Ventas',
          isDefault: true,
          stages: { create: expect.arrayContaining([expect.objectContaining({ name: 'Lead', order: 1 })]) }
        })
      })
    )
  })

  it('sets isDefault=false when a pipeline already exists', async () => {
    vi.mocked(prisma.pipeline.findFirst).mockResolvedValue({ id: 'existing' } as any)
    vi.mocked(prisma.pipeline.create).mockResolvedValue({ id: 'p2', isDefault: false, stages: [] } as any)
    await createPipeline(WS, 'Soporte')
    expect(prisma.pipeline.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) })
    )
  })
})

describe('moveDeal', () => {
  it('throws if deal not found', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    await expect(moveDeal(WS, 'deal-1', 'stage-1')).rejects.toThrow('Deal not found')
  })

  it('auto-marks WON when target stage isWon', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1', pipelineId: 'p1' } as any)
    vi.mocked(prisma.pipelineStage.findFirst).mockResolvedValue({ id: 'stage-won', isWon: true, isLost: false } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)

    await moveDeal(WS, 'deal-1', 'stage-won')

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-won', status: 'WON', wonAt: expect.any(Date) })
      })
    )
  })

  it('moves deal without closing when stage is neutral', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1', pipelineId: 'p1' } as any)
    vi.mocked(prisma.pipelineStage.findFirst).mockResolvedValue({ id: 'stage-2', isWon: false, isLost: false } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)

    await moveDeal(WS, 'deal-1', 'stage-2')

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: 'stage-2' }) })
    )
    const callArgs = vi.mocked(prisma.deal.update).mock.calls[0][0]
    expect(callArgs.data).not.toHaveProperty('status')
  })
})

describe('closeDeal', () => {
  it('sets status=WON with wonAt', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)
    await closeDeal(WS, 'deal-1', 'WON')
    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WON', wonAt: expect.any(Date) }) })
    )
  })

  it('sets status=LOST with lostAt and lostReason', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)
    await closeDeal(WS, 'deal-1', 'LOST', 'Budget cut')
    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'LOST', lostAt: expect.any(Date), lostReason: 'Budget cut' })
      })
    )
  })
})
