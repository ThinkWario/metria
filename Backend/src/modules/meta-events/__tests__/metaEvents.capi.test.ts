import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findUnique: vi.fn() },
    integration: { findUnique: vi.fn() },
    conversionEvent: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() }
  }
}))

import { emitConversionEvent, sendAndRecord, MAX_ATTEMPTS } from '../metaEvents.capi'
import { prisma } from '../../../lib/prisma'

const originalFetch = global.fetch

function mockHappyPath() {
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({
    consentStatus: 'granted', consentVersion: 'v1', consentAt: new Date()
  } as any)
  vi.mocked(prisma.integration.findUnique).mockResolvedValue({
    config: { pixelId: 'pix-1', accessToken: 'tok-1' }
  } as any)
  vi.mocked(prisma.conversionEvent.create).mockResolvedValue({ id: 'ce-1' } as any)
  vi.mocked(prisma.conversionEvent.update).mockResolvedValue({} as any)
  vi.mocked(prisma.conversionEvent.findUnique).mockResolvedValue({ attemptCount: 0 } as any)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ fbtrace_id: 'fb-1', events_received: 1 })
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHappyPath()
})
afterEach(() => { global.fetch = originalFetch })

describe('emitConversionEvent — event_source_url', () => {
  it('incluye event_source_url en el payload enviado a Meta cuando se provee', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' },
      eventSourceUrl: 'https://solar.drillchile.cl/paso-3'
    })

    const call = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.data[0].event_source_url).toBe('https://solar.drillchile.cl/paso-3')
  })

  it('omite event_source_url cuando no se provee', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    const call = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.data[0].event_source_url).toBeUndefined()
  })
})

describe('emitConversionEvent — gate de consentimiento completo', () => {
  it('NO envía a Meta si consentVersion falta aunque consentStatus esté granted', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      consentStatus: 'granted', consentVersion: null, consentAt: new Date()
    } as any)

    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(prisma.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('NO envía a Meta si consentStatus es un string truthy distinto de "granted" (ej. "revoked")', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      consentStatus: 'revoked', consentVersion: 'v1', consentAt: new Date()
    } as any)

    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(prisma.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('NO envía a Meta si consentAt falta aunque consentStatus y consentVersion estén presentes', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      consentStatus: 'granted', consentVersion: 'v1', consentAt: null
    } as any)

    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('envía a Meta cuando consentStatus, consentVersion y consentAt están todos presentes', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).toHaveBeenCalled()
  })
})

describe('sendAndRecord — estado pending/sent/failed/dead_letter (QA_E2E_POST_FIXES_05AGO2026.md §7 P1)', () => {
  it('marca "retry" con nextRetryAt cuando quedan intentos disponibles', async () => {
    vi.mocked(prisma.conversionEvent.findUnique).mockResolvedValue({ attemptCount: 0 } as any)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any

    await sendAndRecord('ce-1', 'pix-1', 'tok-1', { data: [] })

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'retry', nextRetryAt: expect.any(Date) })
    }))
  })

  it('marca "dead_letter" con nextRetryAt null cuando este intento agota MAX_ATTEMPTS', async () => {
    vi.mocked(prisma.conversionEvent.findUnique).mockResolvedValue({ attemptCount: MAX_ATTEMPTS - 1 } as any)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any

    await sendAndRecord('ce-1', 'pix-1', 'tok-1', { data: [] })

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'dead_letter', nextRetryAt: null })
    }))
  })

  it('marca "dead_letter" (no "retry") cuando un error de red agota MAX_ATTEMPTS', async () => {
    vi.mocked(prisma.conversionEvent.findUnique).mockResolvedValue({ attemptCount: MAX_ATTEMPTS - 1 } as any)
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any

    await sendAndRecord('ce-1', 'pix-1', 'tok-1', { data: [] })

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'dead_letter', nextRetryAt: null })
    }))
  })
})

describe('emitConversionEvent — token transport', () => {
  it('envía el token en el header Authorization: Bearer, no en el body', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    const call = vi.mocked(global.fetch).mock.calls[0]
    const headers = call[1]!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok-1')

    const body = JSON.parse(call[1]!.body as string)
    expect(body.access_token).toBeUndefined()
  })
})
