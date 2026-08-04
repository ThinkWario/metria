import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authenticateSolarApiKey } from '../solarApiKey'

const originalEnv = process.env.SOLAR_API_KEY

beforeEach(() => { process.env.SOLAR_API_KEY = 'test-key-123' })
afterEach(() => { process.env.SOLAR_API_KEY = originalEnv })

function mockReqRes(headerValue?: string) {
  const req: any = { header: vi.fn(() => headerValue) }
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  const next = vi.fn()
  return { req, res, next }
}

describe('authenticateSolarApiKey', () => {
  it('llama next() cuando el header coincide con SOLAR_API_KEY', () => {
    const { req, res, next } = mockReqRes('test-key-123')
    authenticateSolarApiKey(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('responde 401 cuando el header no coincide', () => {
    const { req, res, next } = mockReqRes('wrong-key')
    authenticateSolarApiKey(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('responde 401 cuando falta el header', () => {
    const { req, res, next } = mockReqRes(undefined)
    authenticateSolarApiKey(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
