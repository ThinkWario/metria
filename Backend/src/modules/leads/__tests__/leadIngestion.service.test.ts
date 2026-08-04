import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

import { resolveOrCreatePartialContact, SOLAR_SOURCE } from '../leadIngestion.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('resolveOrCreatePartialContact', () => {
  it('crea un Contact nuevo con tag Incompleto cuando el sessionId no existe', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', sessionId: 'sess-1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', comuna: 'Providencia' })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: WS_ID,
        source: SOLAR_SOURCE,
        sessionId: 'sess-1',
        status: 'LEAD',
        qualificationData: { rawFields: { sessionId: 'sess-1', comuna: 'Providencia' } },
        tags: { create: { workspaceId: WS_ID, name: 'Incompleto', color: '#f97316' } }
      })
    }))
  })

  it('usa un nombre por defecto legible cuando no llega name', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'abcdef1234567890' })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Lead Solar (abcdef12)' })
    }))
  })

  it('mergea rawFields sobre un Contact existente sin pisar campos ya guardados con valores vacíos', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Lead Solar (sess-1)',
      email: null,
      phone: null,
      qualificationData: { rawFields: { sessionId: 'sess-1', comuna: 'Providencia' } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', direccion: 'Av. Siempre Viva 123', comuna: '' })

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        qualificationData: {
          rawFields: { sessionId: 'sess-1', comuna: 'Providencia', direccion: 'Av. Siempre Viva 123' }
        }
      })
    })
  })

  it('actualiza name/email/phone en el Contact existente cuando llegan por primera vez (payload usa nombre/telefono, igual que StepData de solar)', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1', name: 'Lead Solar (sess-1)', email: null, phone: null,
      qualificationData: { rawFields: { sessionId: 'sess-1' } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', nombre: 'Roberto Pérez', telefono: '+56 9 1234 5678' })

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ name: 'Roberto Pérez', phone: '56912345678' })
    })
  })

  it('setea first-touch attribution al crear el Contact y la pisa solo si el existente no la tenía', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, {
      sessionId: 'sess-4', utmSource: 'meta', utmCampaign: 'campana-1', fbclid: 'abc123'
    })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ utmSource: 'meta', utmCampaign: 'campana-1', fbclid: 'abc123' })
    }))

    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      id: 'c1', name: 'x', email: null, phone: null, utmSource: 'google',
      qualificationData: { rawFields: {} }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', utmSource: 'meta', utmCampaign: 'campana-2' })

    const updateArgs = vi.mocked(prisma.contact.update).mock.calls.at(-1)?.[0] as any
    expect(updateArgs.data.utmCampaign).toBe('campana-2') // no tenía first-touch — se llena
    expect(updateArgs.data.utmSource).toBeUndefined() // ya tenía 'google' — no se pisa
  })
})
