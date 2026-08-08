import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), update: vi.fn() }
  }
}))
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))

import schedulingRouter from '../scheduling.routes'
import { prisma } from '../../../lib/prisma'

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
})
