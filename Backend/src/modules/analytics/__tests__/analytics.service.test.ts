import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../lib/prisma'
import {
  aggregateChannelSnapshot,
  getSnapshots,
  getFunnelSummary
} from '../analytics.service'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    message: { count: vi.fn() },
    contact: { count: vi.fn() },
    conversation: { count: vi.fn() },
    deal: { count: vi.fn(), aggregate: vi.fn() },
    channelAnalyticSnapshot: { upsert: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn()
  }
}))

const mockPrisma = prisma as any

const WS = 'ws-1'
const CH = 'ch-1'
const DATE = '2026-05-09'

describe('aggregateChannelSnapshot', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('counts messages and upserts snapshot', async () => {
    mockPrisma.message.count.mockResolvedValue(5)
    mockPrisma.contact.count.mockResolvedValue(2)
    mockPrisma.conversation.count.mockResolvedValue(3)
    mockPrisma.deal.count.mockResolvedValue(1)
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 100 } })
    mockPrisma.$queryRaw.mockResolvedValue([{ avg_seconds: 120 }])
    const snapRow = { id: 's1', workspaceId: WS, channelId: CH }
    mockPrisma.channelAnalyticSnapshot.upsert.mockResolvedValue(snapRow)

    const result = await aggregateChannelSnapshot(WS, CH, DATE)
    expect(result).toEqual(snapRow)
    expect(mockPrisma.channelAnalyticSnapshot.upsert).toHaveBeenCalledOnce()
    const call = mockPrisma.channelAnalyticSnapshot.upsert.mock.calls[0][0]
    expect(call.create.totalInbound).toBe(5)
    expect(call.create.totalOutbound).toBe(5)
    expect(call.create.avgFirstResponseSeconds).toBe(120)
    expect(call.create.dealsWonValue).toBe(100)
  })

  it('uses 0 for avgFirstResponseSeconds when $queryRaw returns empty', async () => {
    mockPrisma.message.count.mockResolvedValue(0)
    mockPrisma.contact.count.mockResolvedValue(0)
    mockPrisma.conversation.count.mockResolvedValue(0)
    mockPrisma.deal.count.mockResolvedValue(0)
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: null } })
    mockPrisma.$queryRaw.mockResolvedValue([])
    mockPrisma.channelAnalyticSnapshot.upsert.mockResolvedValue({ id: 's2' })

    await aggregateChannelSnapshot(WS, CH, DATE)
    const call = mockPrisma.channelAnalyticSnapshot.upsert.mock.calls[0][0]
    expect(call.create.avgFirstResponseSeconds).toBe(0)
    expect(call.create.dealsWonValue).toBe(0)
  })
})

describe('getSnapshots', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns snapshots with default 90 days', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }]
    mockPrisma.channelAnalyticSnapshot.findMany.mockResolvedValue(rows)

    const result = await getSnapshots(WS)
    expect(result).toEqual(rows)
    const call = mockPrisma.channelAnalyticSnapshot.findMany.mock.calls[0][0]
    expect(call.where.workspaceId).toBe(WS)
    expect(call.orderBy).toEqual({ date: 'desc' })
  })

  it('filters by channelId when provided', async () => {
    mockPrisma.channelAnalyticSnapshot.findMany.mockResolvedValue([])
    await getSnapshots(WS, 30, CH)
    const call = mockPrisma.channelAnalyticSnapshot.findMany.mock.calls[0][0]
    expect(call.where.channelId).toBe(CH)
  })
})

describe('getFunnelSummary', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('aggregates totals across all channels', async () => {
    mockPrisma.channelAnalyticSnapshot.aggregate.mockResolvedValue({
      _sum: {
        totalInbound: 100, totalOutbound: 80, newContacts: 20,
        conversationsOpened: 50, conversationsResolved: 30,
        dealsCreated: 10, dealsWon: 5, dealsWonValue: 5000,
        avgFirstResponseSeconds: 360
      }
    })

    const result = await getFunnelSummary(WS, 30)
    expect(result.totalInbound).toBe(100)
    expect(result.dealsWon).toBe(5)
    expect(result.dealsWonValue).toBe(5000)
    expect(result.avgResolutionRate).toBe(60) // 30/50 * 100
  })
})
