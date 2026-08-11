import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), update: vi.fn() },
    appointment: { findFirst: vi.fn() }
  }
}))
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../visitEmailNotification.service', () => ({
  sendVisitEmailNotification: vi.fn(async () => {})
}))

import schedulingRouter from '../scheduling.routes'
import { prisma } from '../../../lib/prisma'
import { sendVisitEmailNotification } from '../visitEmailNotification.service'

const sendVisitEmailNotificationMock = sendVisitEmailNotification as any

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', schedulingRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/scheduling/booking-config', () => {
  it('includes notifyPhone in the response', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56912345678'
    } as any)

    const res = await request(buildApp()).get('/api/scheduling/booking-config')

    expect(res.status).toBe(200)
    expect(res.body.notifyPhone).toBe('+56912345678')
  })
})

describe('PATCH /api/scheduling/booking-config', () => {
  it('normalizes notifyPhone to digits-only before saving — the Cloud API rejects a leading "+"', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30, notifyPhone: '56912345678'
    } as any)

    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: '  +56 9 1234 5678  ' })

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyPhone: '56912345678' }) })
    )
    expect(res.body.notifyPhone).toBe('56912345678')
  })

  it('rejects a notifyPhone that does not parse as a valid number', async () => {
    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: 'not a phone' })

    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('clears notifyPhone when sent as an empty string', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30, notifyPhone: null
    } as any)

    await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: '' })

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyPhone: null }) })
    )
  })

  it('accepts multiple comma-separated numbers, normalizing each to digits-only', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30, notifyPhone: '56912345678,56987654321'
    } as any)

    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: ' +56 9 1234 5678 , +56 9 8765 4321 ' })

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyPhone: '56912345678,56987654321' }) })
    )
    expect(res.body.notifyPhone).toBe('56912345678,56987654321')
  })

  it('rejects the list when any of the comma-separated numbers is invalid', async () => {
    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: '+56 9 1234 5678, not a phone' })

    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })
})

describe('GET /api/scheduling/booking-config — visitNotifyEmails', () => {
  it('includes visitNotifyEmails in the response', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30,
      notifyPhone: '+56912345678', visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl'
    } as any)

    const res = await request(buildApp()).get('/api/scheduling/booking-config')

    expect(res.status).toBe(200)
    expect(res.body.visitNotifyEmails).toBe('ops@drillchile.cl,ventas@drillchile.cl')
  })
})

describe('PATCH /api/scheduling/booking-config — visitNotifyEmails', () => {
  it('normalizes the list — trims each address and drops empty entries', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30,
      notifyPhone: null, visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl'
    } as any)

    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: '  ops@drillchile.cl , ventas@drillchile.cl ,, ' })

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl' }) })
    )
  })

  it('rejects the list when any address is invalid', async () => {
    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: 'ops@drillchile.cl, not-an-email' })

    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('clears visitNotifyEmails when sent as an empty string', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30,
      notifyPhone: null, visitNotifyEmails: null
    } as any)

    await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: '' })

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitNotifyEmails: null }) })
    )
  })
})

describe('POST /api/appointments/:id/notify-visit-email', () => {
  const APPT = {
    id: 'appt-1', type: 'SITE_VISIT', scheduledAt: new Date('2026-08-10T19:00:00Z'),
    contact: { id: 'c1', name: 'Alexis Carvajal', phone: '56942597739' }
  }

  it('resends the visit email when the appointment exists, is SITE_VISIT, and emails are configured', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(APPT as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: 'ops@drillchile.cl' } as any)

    const res = await request(buildApp()).post('/api/appointments/appt-1/notify-visit-email')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(sendVisitEmailNotificationMock).toHaveBeenCalledWith('ws-1', {
      contact: { id: 'c1', name: 'Alexis Carvajal', phone: '56942597739' },
      appointment: { type: 'SITE_VISIT', scheduledAt: APPT.scheduledAt },
      kind: 'created'
    })
  })

  it('returns 404 when the appointment does not exist', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null as any)

    const res = await request(buildApp()).post('/api/appointments/missing/notify-visit-email')

    expect(res.status).toBe(404)
    expect(sendVisitEmailNotificationMock).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-SITE_VISIT appointment', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ ...APPT, type: 'CALL' } as any)

    const res = await request(buildApp()).post('/api/appointments/appt-1/notify-visit-email')

    expect(res.status).toBe(400)
    expect(sendVisitEmailNotificationMock).not.toHaveBeenCalled()
  })

  it('returns 400 when no visitNotifyEmails are configured', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(APPT as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: null } as any)

    const res = await request(buildApp()).post('/api/appointments/appt-1/notify-visit-email')

    expect(res.status).toBe(400)
    expect(sendVisitEmailNotificationMock).not.toHaveBeenCalled()
  })

  it('surfaces the real error message when the Gmail send fails', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(APPT as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: 'ops@drillchile.cl' } as any)
    sendVisitEmailNotificationMock.mockRejectedValueOnce(new Error('google_calendar_not_connected'))

    const res = await request(buildApp()).post('/api/appointments/appt-1/notify-visit-email')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('google_calendar_not_connected')
  })
})
