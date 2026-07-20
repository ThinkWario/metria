import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: vi.fn(), create: vi.fn() },
    businessHours: { findUnique: vi.fn(async () => null) }
  }
}))
vi.mock('../../../lib/rateLimit', () => ({
  simpleRateLimit: () => (_req: any, _res: any, next: any) => next()
}))
vi.mock('../scheduling.service', () => ({
  scheduleAppointment: vi.fn(async () => ({
    id: 'a1', type: 'SITE_VISIT', scheduledAt: new Date('2026-07-20T14:00:00Z'), durationMin: 30
  }))
}))
vi.mock('../booking.service', () => ({
  PUBLIC_BOOKING_TYPE: 'SITE_VISIT',
  findWorkspaceBySlug: vi.fn(async () => ({
    id: 'ws-1', name: 'DrillChile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30
  })),
  getPublicSlotsForDate: vi.fn(async () => ['14:00']),
  wallClockToInstant: vi.fn(async () => new Date('2026-07-20T14:00:00Z'))
}))
const syncAppointmentToCalendarMock = vi.fn(async () => {})
vi.mock('../google-calendar.service', () => ({ syncAppointmentToCalendar: syncAppointmentToCalendarMock }))
const notifyAppointmentEventMock = vi.fn(async () => {})
vi.mock('../appointment-notifications.service', () => ({ notifyAppointmentEvent: notifyAppointmentEventMock }))
vi.mock('../../../lib/socket', () => ({ getIO: () => ({ to: () => ({ emit: vi.fn() }) }) }))

import publicBookingRouter from '../public-booking.routes'
import { prisma } from '../../../lib/prisma'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/public', publicBookingRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/booking/:slug/book', () => {
  it('notifies the created appointment after a successful public booking', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1' } as any)

    const res = await request(buildApp())
      .post('/api/public/booking/drillchile/book')
      .send({ name: 'Roberto Test', phone: '+56911112222', date: '2026-07-20', time: '14:00' })

    expect(res.status).toBe(201)

    // Wait for background task (post-booking notification) to execute
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(notifyAppointmentEventMock).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      kind: 'created',
      contact: expect.objectContaining({ id: 'c1', name: 'Roberto Test', phone: '+56911112222' })
    }))
  })

  it('still returns 201 when the notification call throws', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c2' } as any)
    notifyAppointmentEventMock.mockRejectedValueOnce(new Error('whatsapp down'))

    const res = await request(buildApp())
      .post('/api/public/booking/drillchile/book')
      .send({ name: 'Otro Lead', phone: '+56922223333', date: '2026-07-20', time: '14:00' })

    expect(res.status).toBe(201)
  })
})
