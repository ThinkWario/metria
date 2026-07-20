import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    availabilityRule: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() },
    businessHours: { findUnique: vi.fn() },
    workspace: { findUnique: vi.fn() }
  }
}))

// scheduling.service.ts imports google-calendar.service statically, so this mock's
// factory runs at hoist-time, before any non-hoisted const would be initialized —
// vi.hoisted() is required here (unlike a plain `const x = vi.fn()` above vi.mock,
// which only works when the mocked module is imported dynamically elsewhere).
const { getFreeBusyMock } = vi.hoisted(() => ({ getFreeBusyMock: vi.fn() }))
vi.mock('../google-calendar.service', () => ({
  getFreeBusy: getFreeBusyMock
}))

import { afterEach } from 'vitest'
import { getAvailableSlots, scheduleAppointment, filterSlotsByCalendarBusy, rescheduleAppointment } from '../scheduling.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
beforeEach(() => {
  vi.clearAllMocks()
  // Freeze "now" before the fixtures' Monday so getAvailableSlots (which skips
  // past slots) is deterministic regardless of the real date the suite runs on.
  // Only Date is faked, leaving timers/promises real.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-14T00:00:00Z'))
  // no timezone configured by default → server-local math (legacy behavior)
  vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(null)
})
afterEach(() => {
  vi.useRealTimers()
})

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

  it('blocks every slot overlapped by a longer or off-grid appointment', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    // off-grid appointment 09:30-11:00 overlaps the 09:00, 10:00 slots but not 11:00
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T09:30:00'), durationMin: 90 }
    ] as any)

    const slots = await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)
    const monday = slots.filter(s => s.getDay() === 1 && s.getDate() === 15)
    expect(monday.map(s => s.getHours())).toEqual([11])
  })

  it('returns [] with no rules', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    expect(await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)).toEqual([])
  })

  it('computes day-of-week and hours in the business timezone when configured', async () => {
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'Asia/Tokyo' } as any)
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '11:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])

    // 2026-06-15T00:00:00Z == Monday 09:00 in Tokyo (UTC+9)
    const from = new Date('2026-06-15T00:00:00Z')
    const slots = await getAvailableSlots(WS, 'SITE_VISIT', from, 7)

    // Monday 09:00 and 10:00 Tokyo == 00:00Z and 01:00Z — regardless of server timezone
    expect(slots.map(s => s.toISOString())).toEqual([
      '2026-06-15T00:00:00.000Z',
      '2026-06-15T01:00:00.000Z'
    ])
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

  it('uses the duration of the window that contains the requested time (multiple rules per day)', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 30, apptType: 'SITE_VISIT' },
      { dayOfWeek: 1, startTime: '14:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.create).mockResolvedValue({ id: 'a2' } as any)

    await scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T15:00:00'), createdBy: 'BOT'
    })
    // afternoon window → 60 min, not the morning window's 30 min
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ durationMin: 60 }) })
    )
  })

  it('validates the requested time against the business timezone wall clock', async () => {
    // 2026-06-15T01:00:00Z == Monday 10:00 in Tokyo → inside the 09:00-18:00 Monday window
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'Asia/Tokyo' } as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.create).mockResolvedValue({ id: 'a3' } as any)

    const appt = await scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T01:00:00Z'), createdBy: 'BOT'
    })
    expect(appt.id).toBe('a3')

    // Same instant is Sunday 17:00 in Anchorage (UTC-8) → outside Monday availability
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'America/Anchorage' } as any)
    await expect(scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T01:00:00Z'), createdBy: 'BOT'
    })).rejects.toThrow('outside availability')
  })

  it('rejects contact from another workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(scheduleAppointment(WS, {
      contactId: 'evil', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('Contact not found')
  })
})

describe('filterSlotsByCalendarBusy', () => {
  const slots = [new Date('2026-06-15T10:00:00Z'), new Date('2026-06-15T11:00:00Z')]

  it('returns slots unchanged when no Calendar is connected', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalRefreshToken: null } as any)
    const result = await filterSlotsByCalendarBusy(WS, 'SITE_VISIT', slots)
    expect(result).toEqual(slots)
    expect(getFreeBusyMock).not.toHaveBeenCalled()
  })

  it('drops a slot that overlaps a busy interval from the connected Calendar', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalRefreshToken: 'tok' } as any)
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    getFreeBusyMock.mockResolvedValue([{ start: '2026-06-15T10:15:00Z', end: '2026-06-15T10:45:00Z' }])

    const result = await filterSlotsByCalendarBusy(WS, 'SITE_VISIT', slots)
    expect(result).toEqual([slots[1]])
  })

  it('never throws and falls back to the unfiltered slots when the Calendar lookup fails', async () => {
    vi.mocked(prisma.workspace.findUnique).mockRejectedValue(new Error('db down'))
    const result = await filterSlotsByCalendarBusy(WS, 'SITE_VISIT', slots)
    expect(result).toEqual(slots)
  })
})

describe('rescheduleAppointment', () => {
  beforeEach(() => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
  })

  it('updates scheduledAt/durationMin and returns the old time', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      id: 'a1', scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60
    } as any)

    const result = await rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00'))

    expect(result.oldScheduledAt).toEqual(new Date('2026-06-15T10:00:00'))
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60 }
    })
  })

  it('rejects rescheduling a CANCELLED appointment', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'CANCELLED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('Cannot reschedule appointment with status CANCELLED')
  })

  it('rejects a new time outside availability', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T22:00:00')))
      .rejects.toThrow('outside availability')
  })

  it('rejects a new time colliding with another appointment, ignoring the appointment being moved', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60 }
    ] as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('already taken')
  })

  it('throws when the appointment does not exist in this workspace', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)

    await expect(rescheduleAppointment(WS, 'ghost', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('Appointment not found')
  })
})
