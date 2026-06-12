import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    followUpRule: { findMany: vi.fn() },
    followUpJob: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    botAgent: { findFirst: vi.fn() }
  }
}))
vi.mock('../ai.service', () => ({ processAiResponse: vi.fn() }))
vi.mock('../../bot/businessHours.service', () => ({ isOutsideBusinessHours: vi.fn(() => false), getBusinessHours: vi.fn(async () => null) }))
vi.mock('../../messaging/message.service', () => ({ sendOutboundPlatformMessage: vi.fn() }))

import { scheduleNextFollowUp, cancelPendingFollowUps, processDueFollowUps } from '../followup.service'
import { prisma } from '../../../lib/prisma'
import { processAiResponse } from '../ai.service'
import { getBusinessHours } from '../../bot/businessHours.service'

const WS = 'ws-1'
const CONV = 'conv-1'
beforeEach(() => vi.clearAllMocks())

describe('scheduleNextFollowUp', () => {
  it('creates job for first active rule when none sent yet', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([
      { id: 'r1', delayHours: 4, order: 0, isActive: true },
      { id: 'r2', delayHours: 24, order: 1, isActive: true }
    ] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(0) // 0 SENT so far

    await scheduleNextFollowUp(WS, CONV, 'bot-1')

    expect(prisma.followUpJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r1', workspaceId: WS, conversationId: CONV }) })
    )
  })

  it('schedules second rule after one follow-up already sent', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([
      { id: 'r1', delayHours: 4, order: 0, isActive: true },
      { id: 'r2', delayHours: 24, order: 1, isActive: true }
    ] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(1)

    await scheduleNextFollowUp(WS, CONV, 'bot-1')
    expect(prisma.followUpJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r2' }) })
    )
  })

  it('does nothing when sequence exhausted', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([{ id: 'r1', delayHours: 4, order: 0, isActive: true }] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(1)
    await scheduleNextFollowUp(WS, CONV, 'bot-1')
    expect(prisma.followUpJob.create).not.toHaveBeenCalled()
  })
})

describe('cancelPendingFollowUps', () => {
  it('cancels all PENDING jobs for the conversation', async () => {
    await cancelPendingFollowUps(CONV)
    expect(prisma.followUpJob.updateMany).toHaveBeenCalledWith({
      where: { conversationId: CONV, status: 'PENDING' },
      data: { status: 'CANCELLED' }
    })
  })
})

describe('processDueFollowUps', () => {
  it('claims job (PENDING→SENT conditional) before dispatching', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([
      { id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }
    ] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: CONV, workspaceId: WS, isHandledByBot: true, status: 'OPEN',
      channel: { platform: 'WHATSAPP', config: {} }, externalId: '569...', assignedToBotId: 'bot-1'
    } as any)
    vi.mocked(processAiResponse).mockResolvedValue('¡Hola! ¿Seguimos con tu cotización solar?')

    await processDueFollowUps()

    expect(prisma.followUpJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'j1', status: 'PENDING' }) })
    )
    expect(processAiResponse).toHaveBeenCalled()
  })

  it('skips job claimed by another worker (count 0)', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([{ id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 0 } as any)
    await processDueFollowUps()
    expect(processAiResponse).not.toHaveBeenCalled()
  })

  it('falls back to the workspace active bot when conversation has no assignedToBotId', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([
      { id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }
    ] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(1)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: CONV, workspaceId: WS, isHandledByBot: true, status: 'OPEN',
      channel: { platform: 'WHATSAPP', config: {} }, externalId: '569...', assignedToBotId: null
    } as any)
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'bot-fallback' } as any)
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([
      { id: 'r1', delayHours: 4, order: 0, isActive: true },
      { id: 'r2', delayHours: 24, order: 1, isActive: true }
    ] as any)
    vi.mocked(processAiResponse).mockResolvedValue('seguimos?')

    await processDueFollowUps()

    // chain continues: next follow-up looked up with the fallback bot id
    expect(prisma.botAgent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS, isActive: true } })
    )
    expect(prisma.followUpRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ botAgentId: 'bot-fallback' }) })
    )
    expect(prisma.followUpJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r2' }) })
    )
  })

  it('requeues +30min when the business-hours check throws (job not stuck in SENT)', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([
      { id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }
    ] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(getBusinessHours).mockRejectedValueOnce(new Error('db down'))

    await processDueFollowUps()

    expect(processAiResponse).not.toHaveBeenCalled()
    expect(prisma.followUpJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'j1' },
        data: expect.objectContaining({ status: 'PENDING', sentAt: null, scheduledAt: expect.any(Date) })
      })
    )
  })
})
