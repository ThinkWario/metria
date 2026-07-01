import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express, { type Router } from 'express'
import crypto from 'crypto'

const mockSendPurchaseEvent = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/metaCapi', () => ({ sendPurchaseEvent: mockSendPurchaseEvent }))

vi.mock('../../lib/prisma', () => ({
  prisma: {
    order: { upsert: vi.fn().mockResolvedValue({}) }
  }
}))

vi.mock('../../middleware/cache', () => ({ invalidateWorkspaceCache: vi.fn() }))
vi.mock('../../lib/logger', () => ({ createAuditLog: vi.fn() }))
vi.mock('../../lib/dateUtils', () => ({ getStartOfDay: vi.fn(), getEndOfDay: vi.fn() }))
vi.mock('../../lib/metrics', () => ({ upsertDailyMetric: vi.fn() }))
vi.mock('../../services/alertService', () => ({ AlertService: { checkAlerts: vi.fn() } }))

const WEBHOOK_SECRET = 'test-secret'
process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET

// `shopify.ts` reads SHOPIFY_WEBHOOK_SECRET into a module-level const via
// `import 'dotenv/config'` at import time. A static `import shopifyRouter
// from '../shopify'` here would be hoisted above the `process.env` assignment
// above (ESM import hoisting), so dotenv would load Backend/.env's real
// secret instead of this test's secret, and HMAC verification would fail
// with 401. Load it dynamically after the env var is set to avoid that.
let shopifyRouter: Router

beforeAll(async () => {
  shopifyRouter = (await import('../shopify')).default
})

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.raw({ type: 'application/json' }))
  app.use('/api/shopify', shopifyRouter)
  return app
}

function signPayload(payload: object): { raw: string; signature: string } {
  const raw = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('base64')
  return { raw, signature }
}

describe('POST /webhooks/orders/create — Meta CAPI wiring', () => {
  it('fires a Purchase event with the order total, currency, email, and phone', async () => {
    const orderPayload = {
      id: 12345,
      name: '#1001',
      total_price: '91240.00',
      currency: 'CLP',
      email: 'ana@example.com',
      financial_status: 'paid',
      fulfillment_status: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      line_items: [],
      customer: { first_name: 'Ana', last_name: 'Perez', phone: '+56912345678' }
    }
    const { raw, signature } = signPayload(orderPayload)

    await request(buildApp())
      .post('/api/shopify/webhooks/orders/create?workspaceId=ws1')
      .set('X-Shopify-Hmac-Sha256', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200)

    expect(mockSendPurchaseEvent).toHaveBeenCalledWith('ws1', {
      value: 91240,
      currency: 'CLP',
      email: 'ana@example.com',
      phone: '+56912345678'
    })
  })
})
