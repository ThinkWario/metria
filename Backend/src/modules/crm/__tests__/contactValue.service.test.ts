import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: vi.fn() },
    deal: { groupBy: vi.fn() },
    order: { aggregate: vi.fn() },
    dailyMetric: { aggregate: vi.fn() }
  }
}))

import { getRevenueSummary } from '../contactValue.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
const CONTACT_ID = 'ct-1'

beforeEach(() => vi.clearAllMocks())

describe('getRevenueSummary — contactAttribution', () => {
  it('rechaza si el contacto no existe', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(getRevenueSummary(WS, CONTACT_ID)).rejects.toThrow('Contact not found')
  })

  it('siempre incluye contactAttribution, incluso sin órdenes ni datos de ads', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ email: null, source: 'solar_direct', utmSource: null } as any)
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: {}, _count: { _all: 0 }, _max: {} } as any)
    vi.mocked(prisma.dailyMetric.aggregate).mockResolvedValue({ _sum: {} } as any)

    const result = await getRevenueSummary(WS, CONTACT_ID)

    expect(result.contactAttribution).toBeDefined()
    expect(result.contactAttribution.source).toBe('solar_direct')
    expect(result.contactAttribution.estimatedAdCost).toBeNull()
    expect(typeof result.contactAttribution.note).toBe('string')
  })

  it('prioriza utmSource sobre source cuando ambos existen', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ email: null, source: 'solar_direct', utmSource: 'meta' } as any)
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: {}, _count: { _all: 0 }, _max: {} } as any)
    vi.mocked(prisma.dailyMetric.aggregate).mockResolvedValue({ _sum: {} } as any)

    const result = await getRevenueSummary(WS, CONTACT_ID)

    expect(result.contactAttribution.source).toBe('meta')
  })

  it('devuelve contactAttribution.source null y nota explícita cuando no hay source ni utmSource', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ email: null, source: '', utmSource: null } as any)
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: {}, _count: { _all: 0 }, _max: {} } as any)
    vi.mocked(prisma.dailyMetric.aggregate).mockResolvedValue({ _sum: {} } as any)

    const result = await getRevenueSummary(WS, CONTACT_ID)

    expect(result.contactAttribution.source).toBeNull()
    expect(result.contactAttribution.note).toMatch(/sin datos/i)
  })
})
