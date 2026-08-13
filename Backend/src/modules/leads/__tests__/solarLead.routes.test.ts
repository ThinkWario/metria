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
vi.mock('../visitLetter.service', () => ({
  getVisitLetterDataByToken: vi.fn(),
  generateVisitLetterPdf: vi.fn()
}))
vi.mock('../../../lib/prisma', () => ({
  prisma: { contact: { findUnique: vi.fn() } }
}))
// Defaults: no cached cross-instance result, lock always acquired (NX
// succeeds) — i.e. "you're the only instance", so pre-existing tests that
// don't care about the cross-instance path behave exactly as before this
// mock existed.
vi.mock('../../../lib/redis', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1)
  }
}))

import solarLeadRouter, { __resetCompleteCoalescingForTests } from '../solarLead.routes'
import { resolveOrCreatePartialContact, finalizeLead } from '../leadIngestion.service'
import { getVisitLetterDataByToken, generateVisitLetterPdf } from '../visitLetter.service'
import { prisma } from '../../../lib/prisma'
import { redis } from '../../../lib/redis'

function buildApp() {
  process.env.SOLAR_API_KEY = 'test-key'
  process.env.SOLAR_WORKSPACE_ID = 'ws-1'
  const app = express()
  app.use(express.json())
  app.use('/api/public', solarLeadRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sin esto, reusar el mismo sessionId ('sess-1') entre tests quedaría
  // atrapado por el coalescing de action=complete (ventana de 3s) y
  // devolvería el resultado cacheado del test anterior en vez de invocar
  // finalizeLead de nuevo.
  __resetCompleteCoalescingForTests()
})

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

  it('action=complete propaga code:IDENTITY_CONFLICT en un 409', async () => {
    vi.mocked(finalizeLead).mockResolvedValueOnce({
      ok: false, status: 409, code: 'IDENTITY_CONFLICT', error: 'El email/teléfono/RUT de este lead ya pertenece a otro contacto'
    })

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: true, rut: '11.999.999-5' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('IDENTITY_CONFLICT')
  })

  it('coalesce dos POST action=complete casi simultáneos para el mismo sessionId en una sola llamada a finalizeLead', async () => {
    // Con mocks 100% instantáneos, la cadena de awaits del primer request
    // (redis.get → redis.set NX → finalizeLead → redis.set cache) puede
    // drenar por completo antes de que el segundo request llegue al
    // handler — dando un falso negativo de coalescing por timing de test,
    // no por un bug real. Un pequeño delay en finalizeLead deja la primera
    // llamada realmente "en vuelo" cuando llega la segunda, como en
    // producción (donde nada de esto es instantáneo).
    vi.mocked(finalizeLead).mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return { ok: true, contact: { id: 'c1' } } as any
    })

    const app = buildApp()
    const [res1, res2] = await Promise.all([
      request(app).post('/api/public/solar/lead').set('X-Solar-Api-Key', 'test-key')
        .send({ action: 'complete', sessionId: 'sess-coalesce', consentAccepted: true }),
      request(app).post('/api/public/solar/lead').set('X-Solar-Api-Key', 'test-key')
        .send({ action: 'complete', sessionId: 'sess-coalesce', consentAccepted: true })
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(finalizeLead).toHaveBeenCalledTimes(1)
  })

  it('NO coalesce dos POST action=complete para sessionId distintos', async () => {
    const app = buildApp()
    await Promise.all([
      request(app).post('/api/public/solar/lead').set('X-Solar-Api-Key', 'test-key')
        .send({ action: 'complete', sessionId: 'sess-a', consentAccepted: true }),
      request(app).post('/api/public/solar/lead').set('X-Solar-Api-Key', 'test-key')
        .send({ action: 'complete', sessionId: 'sess-b', consentAccepted: true })
    ])

    expect(finalizeLead).toHaveBeenCalledTimes(2)
  })

  it('cachea el resultado exitoso en Redis (para otras instancias) bajo una llave por sessionId con TTL corto', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-cache', consentAccepted: true })

    expect(res.status).toBe(200)
    const resultCacheCall = vi.mocked(redis.set).mock.calls.find(call => call[0] === 'solar:complete:result:sess-cache')
    expect(resultCacheCall).toBeDefined()
    expect(JSON.parse(resultCacheCall![1] as string)).toEqual({ ok: true })
  })

  it('reusa un resultado exitoso ya cacheado en Redis por otra instancia en vez de llamar finalizeLead de nuevo', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify({ ok: true })) // cache-check inicial

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-other-instance', consentAccepted: true })

    expect(res.status).toBe(200)
    expect(finalizeLead).not.toHaveBeenCalled()
  })

  it('si el lock NX lo tiene otra instancia, espera (polling) el resultado en vez de duplicar finalizeLead', async () => {
    vi.mocked(redis.get)
      .mockResolvedValueOnce(null) // cache-check inicial: nada aún
      .mockResolvedValueOnce(JSON.stringify({ ok: true })) // primer poll: la otra instancia ya terminó
    vi.mocked(redis.set).mockResolvedValueOnce(null) // NX falla: otra instancia tiene el lock

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-locked-elsewhere', consentAccepted: true })

    expect(res.status).toBe(200)
    expect(finalizeLead).not.toHaveBeenCalled()
  })

  it('si Redis no responde, degrada con gracia y llama finalizeLead directamente (sin coalescing esta vez)', async () => {
    vi.mocked(redis.get).mockRejectedValueOnce(new Error('ECONNREFUSED'))
    vi.mocked(redis.set)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    vi.mocked(redis.del).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-redis-down', consentAccepted: true })

    expect(res.status).toBe(200)
    expect(finalizeLead).toHaveBeenCalled()
  })

  it('NO cachea en Redis un resultado fallido (409/422) — un reenvío corregido no debe recibir el error viejo', async () => {
    vi.mocked(finalizeLead).mockResolvedValueOnce({ ok: false, status: 409, code: 'IDENTITY_CONFLICT', error: 'conflicto' })

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-failed', consentAccepted: true, rut: '11.999.999-5' })

    expect(res.status).toBe(409)
    const resultCacheCall = vi.mocked(redis.set).mock.calls.find(call => call[0] === 'solar:complete:result:sess-failed')
    expect(resultCacheCall).toBeUndefined()
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

describe('GET /api/public/solar/visit-letter/:sessionId', () => {
  it('streams the PDF for a known sessionId, no API key required', async () => {
    vi.mocked(getVisitLetterDataByToken).mockResolvedValue({ nombre: 'Ana', fechaEmision: '13 de agosto de 2026' } as any)
    vi.mocked(generateVisitLetterPdf).mockResolvedValue(Buffer.from('%PDF-fake'))

    const res = await request(buildApp()).get('/api/public/solar/visit-letter/sess-1')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(getVisitLetterDataByToken).toHaveBeenCalledWith('ws-1', 'sess-1')
  })

  it('responds 404 when the sessionId does not match any contact', async () => {
    vi.mocked(getVisitLetterDataByToken).mockRejectedValue(new Error('Contact not found'))

    const res = await request(buildApp()).get('/api/public/solar/visit-letter/missing-session')

    expect(res.status).toBe(404)
    expect(generateVisitLetterPdf).not.toHaveBeenCalled()
  })
})
