import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    availabilityRule: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() }
  }
}))

import { getAvailableSlots, scheduleAppointment } from '../scheduling.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
beforeEach(() => vi.clearAllMocks())

// Monday 2026-06-15
const MONDAY = new Date('2026-06-15T00:00:00')

describe('getAvailableSlots', () => {
  it('generates slots from rules minus existing appointments', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '11:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T09:00:00'), durationMin: 60 }
    ] as any)

    const slots = await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)
    const monday = slots.filter(s => s.getDay() === 1 && s.getDate() === 15)
    expect(monday.map(s => s.getHours())).toEqual([10]) // 09 taken, 10 free
  })

  it('returns [] with no rules', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    expect(await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)).toEqual([])
  })
})

describe('scheduleAppointment', () => {
  beforeEach(() => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1', workspaceId: WS } as any)
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
  })

  it('creates appointment on free valid slot', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.create).mockResolvedValue({ id: 'a1' } as any)

    const appt = await scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })
    expect(appt.id).toBe('a1')
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, createdBy: 'BOT' }) })
    )
  })

  it('rejects slot outside availability', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    await expect(scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T22:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('outside availability')
  })

  it('rejects colliding slot', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T10:00:00'), durationMin: 60 }
    ] as any)
    await expect(scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('already taken')
  })

  it('rejects contact from another workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(scheduleAppointment(WS, {
      contactId: 'evil', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('Contact not found')
  })
})
