import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    businessHours: { findUnique: vi.fn(), upsert: vi.fn() }
  }
}))

import { getBusinessHours, upsertBusinessHours, isOutsideBusinessHours } from '../businessHours.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

const DEFAULT_BH = {
  workspaceId: WS,
  timezone: 'America/Santiago',
  monday: { open: '09:00', close: '18:00', enabled: true },
  tuesday: { open: '09:00', close: '18:00', enabled: true },
  wednesday: { open: '09:00', close: '18:00', enabled: true },
  thursday: { open: '09:00', close: '18:00', enabled: true },
  friday: { open: '09:00', close: '18:00', enabled: true },
  saturday: { open: '09:00', close: '14:00', enabled: false },
  sunday: { open: '09:00', close: '14:00', enabled: false },
  outsideMessage: null
}

beforeEach(() => vi.clearAllMocks())

describe('getBusinessHours', () => {
  it('fetches by workspaceId unique key', async () => {
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(DEFAULT_BH as any)
    const result = await getBusinessHours(WS)
    expect(prisma.businessHours.findUnique).toHaveBeenCalledWith({ where: { workspaceId: WS } })
    expect(result).toEqual(DEFAULT_BH)
  })

  it('returns null when not configured', async () => {
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(null)
    expect(await getBusinessHours(WS)).toBeNull()
  })
})

describe('upsertBusinessHours', () => {
  it('upserts with workspaceId as unique key', async () => {
    vi.mocked(prisma.businessHours.upsert).mockResolvedValue(DEFAULT_BH as any)
    await upsertBusinessHours(WS, { timezone: 'America/Bogota' })
    expect(prisma.businessHours.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
  })
})

describe('isOutsideBusinessHours', () => {
  it('returns true when day is disabled (saturday)', () => {
    const bh = { ...DEFAULT_BH, saturday: { open: '09:00', close: '14:00', enabled: false } }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-11T13:00:00Z')) // Saturday 10:00 AM Santiago (-3)
    expect(isOutsideBusinessHours(bh)).toBe(true)
    vi.useRealTimers()
  })

  it('returns false during business hours on a weekday', () => {
    // Monday 2025-01-06, 14:00 UTC = 11:00 AM Santiago (UTC-3, inside 09:00-18:00)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T14:00:00Z'))
    const bh = { ...DEFAULT_BH }
    expect(isOutsideBusinessHours(bh)).toBe(false)
    vi.useRealTimers()
  })

  it('returns true before open hour', () => {
    // Monday 2025-01-06, 11:00 UTC = 08:00 AM Santiago (before 09:00 open)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T11:00:00Z'))
    expect(isOutsideBusinessHours(DEFAULT_BH)).toBe(true)
    vi.useRealTimers()
  })

  it('returns true after close hour', () => {
    // Monday 2025-01-06, 22:00 UTC = 19:00 Santiago (after 18:00 close)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T22:00:00Z'))
    expect(isOutsideBusinessHours(DEFAULT_BH)).toBe(true)
    vi.useRealTimers()
  })
})
