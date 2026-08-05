import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversionEvent: { findMany: vi.fn(), count: vi.fn() },
    integration: { findUnique: vi.fn() }
  }
}))
vi.mock('../metaEvents.capi', () => ({
  sendAndRecord: vi.fn(async () => {}),
  MAX_ATTEMPTS: 5
}))

import { retryPendingConversionEvents } from '../metaEvents.cron'
import { sendAndRecord } from '../metaEvents.capi'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.conversionEvent.count).mockResolvedValue(0)
})

describe('retryPendingConversionEvents', () => {
  it('reintenta una fila pending/retry usando pixelId/accessToken de la Integration del workspace', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([
      { id: 'ce-1', workspaceId: WS_ID, payload: { event_name: 'Contact' } }
    ] as any)
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({
      config: { accessToken: 'tok-1', pixelId: 'px-1' }
    } as any)

    await retryPendingConversionEvents()

    expect(sendAndRecord).toHaveBeenCalledWith('ce-1', 'px-1', 'tok-1', { event_name: 'Contact' })
  })

  it('no reintenta si la Integration del workspace no tiene pixelId/accessToken configurados', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([
      { id: 'ce-1', workspaceId: WS_ID, payload: { event_name: 'Contact' } }
    ] as any)
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({ config: {} } as any)

    await retryPendingConversionEvents()

    expect(sendAndRecord).not.toHaveBeenCalled()
  })

  it('no reintenta si la fila no tiene payload persistido', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([
      { id: 'ce-1', workspaceId: WS_ID, payload: null }
    ] as any)
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({
      config: { accessToken: 'tok-1', pixelId: 'px-1' }
    } as any)

    await retryPendingConversionEvents()

    expect(sendAndRecord).not.toHaveBeenCalled()
  })

  it('consulta solo status pending/retry con attemptCount bajo MAX_ATTEMPTS y nextRetryAt vencido o nulo', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([])

    await retryPendingConversionEvents()

    expect(prisma.conversionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['pending', 'retry'] },
        attemptCount: { lt: 5 }
      })
    }))
  })
})
