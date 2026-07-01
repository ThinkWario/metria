import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    integration: { findUnique: vi.fn() }
  }
}))

import { sendPurchaseEvent } from '../metaCapi'
import { prisma } from '../prisma'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('sendPurchaseEvent', () => {
  it('does nothing when the workspace has no meta integration configured', async () => {
    vi.mocked(prisma.integration.findUnique).mockResolvedValue(null)

    await sendPurchaseEvent('ws1', { value: 100, currency: 'CLP' })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does nothing when pixelId or accessToken is missing from config', async () => {
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({
      config: { accessToken: 'tok' } // no pixelId
    } as any)

    await sendPurchaseEvent('ws1', { value: 100, currency: 'CLP' })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts a hashed Purchase event to the Meta CAPI endpoint when configured', async () => {
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({
      config: { accessToken: 'tok123', pixelId: 'pixel456' }
    } as any)
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any)

    await sendPurchaseEvent('ws1', { value: 91240, currency: 'CLP', email: 'Ana@Example.com ', phone: ' +56912345678 ' })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(global.fetch).mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v19.0/pixel456/events')

    const body = JSON.parse((options as any).body)
    expect(body.access_token).toBe('tok123')
    expect(body.data[0].event_name).toBe('Purchase')
    expect(body.data[0].action_source).toBe('website')
    expect(body.data[0].custom_data).toEqual({ value: 91240, currency: 'CLP' })

    const expectedEmailHash = crypto.createHash('sha256').update('ana@example.com').digest('hex')
    const expectedPhoneHash = crypto.createHash('sha256').update('+56912345678').digest('hex')
    expect(body.data[0].user_data.em).toEqual([expectedEmailHash])
    expect(body.data[0].user_data.ph).toEqual([expectedPhoneHash])
  })

  it('swallows a failed CAPI request instead of throwing', async () => {
    vi.mocked(prisma.integration.findUnique).mockResolvedValue({
      config: { accessToken: 'tok123', pixelId: 'pixel456' }
    } as any)
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad request' }) } as any)

    await expect(sendPurchaseEvent('ws1', { value: 100, currency: 'CLP' })).resolves.toBeUndefined()
  })
})
