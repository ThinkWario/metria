import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    botAgent: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    botFlow: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    followUpRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    channel: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() }
  }
}))

import { listAgents, createAgent, updateAgent, deleteAgent, listFlows, createFlow, updateFlow, deleteFlow, applyTemplate } from '../bot.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listAgents', () => {
  it('returns agents scoped to workspaceId', async () => {
    vi.mocked(prisma.botAgent.findMany).mockResolvedValue([])
    await listAgents(WS)
    expect(prisma.botAgent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
  })
})

describe('createAgent', () => {
  it('creates agent with workspaceId', async () => {
    vi.mocked(prisma.botAgent.create).mockResolvedValue({ id: 'a1', name: 'Bot 1' } as any)
    await createAgent(WS, { name: 'Bot 1' })
    expect(prisma.botAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, name: 'Bot 1' }) })
    )
  })
})

describe('updateAgent', () => {
  it('throws if agent not found', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(updateAgent(WS, 'a1', { name: 'New' })).rejects.toThrow('Agent not found')
  })

  it('updates agent fields', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botAgent.update).mockResolvedValue({ id: 'a1', isActive: false } as any)
    await updateAgent(WS, 'a1', { isActive: false })
    expect(prisma.botAgent.update).toHaveBeenCalledWith({ where: { id: 'a1', workspaceId: WS }, data: { isActive: false } })
  })
})

describe('deleteAgent', () => {
  it('throws if agent not found', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(deleteAgent(WS, 'a1')).rejects.toThrow('Agent not found')
  })

  it('deletes agent', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botAgent.delete).mockResolvedValue({} as any)
    await deleteAgent(WS, 'a1')
    expect(prisma.botAgent.delete).toHaveBeenCalledWith({ where: { id: 'a1', workspaceId: WS } })
  })
})

describe('listFlows', () => {
  it('throws if agent not in workspace', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(listFlows(WS, 'a1')).rejects.toThrow('Agent not found')
  })

  it('returns flows ordered by priority', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([])
    await listFlows(WS, 'a1')
    expect(prisma.botFlow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priority: 'asc' } })
    )
  })
})

describe('createFlow', () => {
  it('creates flow with channel=ALL and priority=100 by default', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botFlow.create).mockResolvedValue({ id: 'f1' } as any)
    await createFlow(WS, 'a1', { name: 'Bienvenida', triggerType: 'FIRST_MESSAGE', actions: [] })
    expect(prisma.botFlow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'ALL', priority: 100 })
      })
    )
  })

  it('throws if agent not in workspace', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(createFlow(WS, 'a1', { name: 'x', triggerType: 'KEYWORD', actions: [] })).rejects.toThrow('Agent not found')
  })
})

describe('updateFlow', () => {
  it('throws if flow not found', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue(null)
    await expect(updateFlow(WS, 'f1', { isActive: false })).rejects.toThrow('Flow not found')
  })

  it('updates flow fields', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue({ id: 'f1' } as any)
    vi.mocked(prisma.botFlow.update).mockResolvedValue({} as any)
    await updateFlow(WS, 'f1', { isActive: false })
    expect(prisma.botFlow.update).toHaveBeenCalledWith({ where: { id: 'f1', workspaceId: WS }, data: { isActive: false } })
  })
})

describe('deleteFlow', () => {
  it('throws if flow not found', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue(null)
    await expect(deleteFlow(WS, 'f1')).rejects.toThrow('Flow not found')
  })
})

describe('applyTemplate', () => {
  it('happy path: updates config.profile with SOLAR_TEMPLATE', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1', config: {} } as any)
    vi.mocked(prisma.botAgent.update).mockResolvedValue({ id: 'a1' } as any)

    const result = await applyTemplate(WS, 'a1', 'solar')

    expect(prisma.botAgent.findFirst).toHaveBeenCalledWith({ where: { id: 'a1', workspaceId: WS } })
    expect(prisma.botAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({
          config: expect.objectContaining({
            profile: expect.objectContaining({
              scheduling: { enabled: true, types: ['SITE_VISIT'] }
            })
          })
        })
      })
    )
    expect(result).toEqual({ id: 'a1' })
  })

  it('throws 400-style error for unknown template', async () => {
    await expect(applyTemplate(WS, 'a1', 'nonexistent')).rejects.toThrow('Unknown template: nonexistent')
  })

  it('throws Agent not found when bot does not belong to workspace', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(applyTemplate(WS, 'a1', 'solar')).rejects.toThrow('Agent not found')
  })
})
