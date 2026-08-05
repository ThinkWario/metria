import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/rateLimit', () => ({
  simpleRateLimit: () => (_req: any, _res: any, next: any) => next()
}))
vi.mock('../leadIngestion.service', () => ({
  resolveOrCreatePartialContact: vi.fn(async () => ({ id: 'c1' })),
  finalizeLead: vi.fn(async () => ({ ok: true, contact: { id: 'c1' } })),
  SOLAR_SOURCE: 'solar_direct'
}))
vi.mock('../../../lib/prisma', () => ({
  prisma: { contact: { findUnique: vi.fn() } }
}))

import solarLeadRouter from '../solarLead.routes'
import { resolveOrCreatePartialContact, finalizeLead } from '../leadIngestion.service'
import { prisma } from '../../../lib/prisma'

function buildApp() {
  process.env.SOLAR_API_KEY = 'test-key'
  process.env.SOLAR_WORKSPACE_ID = 'ws-1'
  const app = express()
  app.use(express.json())
  app.use('/api/public', solarLeadRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/solar/lead', () => {
  it('responde 401 sin API key', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .send({ action: 'save', sessionId: 'sess-1' })
    expect(res.status).toBe(401)
  })

  it('responde 400 sin sessionId', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'save' })
    expect(res.status).toBe(400)
  })

  it('action=save llama resolveOrCreatePartialContact y responde 200', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'save', sessionId: 'sess-1', comuna: 'Providencia' })

    expect(res.status).toBe(200)
    expect(resolveOrCreatePartialContact).toHaveBeenCalledWith('ws-1', expect.objectContaining({ sessionId: 'sess-1' }))
  })

  it('action=complete llama finalizeLead y responde 200 cuando ok', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: true })

    expect(res.status).toBe(200)
    expect(finalizeLead).toHaveBeenCalled()
  })

  it('action=complete propaga el status de error de finalizeLead (422 sin consentimiento)', async () => {
    vi.mocked(finalizeLead).mockResolvedValueOnce({ ok: false, status: 422, error: 'consentAccepted es requerido' })

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: false })

    expect(res.status).toBe(422)
  })

  it('devuelve 500 con trace_id (no "Error interno" sin correlación) si finalizeLead lanza inesperadamente', async () => {
    vi.mocked(finalizeLead).mockRejectedValueOnce(new Error('DB connection lost'))

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: true })

    expect(res.status).toBe(500)
    expect(res.body.trace_id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('GET /api/public/solar/lead', () => {
  it('responde 404 si no hay Contact para ese sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)

    const res = await request(buildApp())
      .get('/api/public/solar/lead?sessionId=sess-1')
      .set('X-Solar-Api-Key', 'test-key')

    expect(res.status).toBe(404)
  })

  it('responde los rawFields guardados cuando existe', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      qualificationData: { rawFields: { comuna: 'Providencia' } }
    } as any)

    const res = await request(buildApp())
      .get('/api/public/solar/lead?sessionId=sess-1')
      .set('X-Solar-Api-Key', 'test-key')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success', data: { comuna: 'Providencia' }, step: 1 })
  })
})
