import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    contactTag: { deleteMany: vi.fn() },
    deal: { findFirst: vi.fn(), create: vi.fn() },
    channel: { findFirst: vi.fn() }
  }
}))
vi.mock('../solarQualifier', () => ({
  qualifySolarLead: vi.fn(() => ({ qualificationStatus: 'CALIFICA', qualificationSummary: 'ok' })),
  evaluateSolarResV2Criteria: vi.fn(() => ({
    serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
  }))
}))
vi.mock('../whatsappHandoff', () => ({
  prepareWhatsappConversation: vi.fn(async () => {})
}))
vi.mock('../../meta-events/metaEvents.service', () => ({
  emitMetaContactEvent: vi.fn(async () => {}),
  emitMetaLeadEvent: vi.fn(async () => {}),
  emitMetaFinanceApplicationSubmittedEvent: vi.fn(async () => {}),
  emitMetaQualifiedLeadEvent: vi.fn(async () => {})
}))

import { resolveOrCreatePartialContact, finalizeLead, SOLAR_SOURCE } from '../leadIngestion.service'
import { qualifySolarLead, evaluateSolarResV2Criteria } from '../solarQualifier'
import { prepareWhatsappConversation } from '../whatsappHandoff'
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent, emitMetaQualifiedLeadEvent } from '../../meta-events/metaEvents.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

// Vitest 4: vi.clearAllMocks() NO borra ni defaults (mockResolvedValue) ni
// colas sin consumir (mockResolvedValueOnce) — ambos se filtran entre tests.
// Reset explícito de los mocks de prisma para que cada test sea
// autocontenido (el default de qualifySolarLead del factory SÍ se conserva).
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.contact.findUnique).mockReset()
  vi.mocked(prisma.contact.create).mockReset()
  vi.mocked(prisma.contact.update).mockReset()
  vi.mocked(prisma.contactTag.deleteMany).mockReset()
  vi.mocked(prisma.deal.findFirst).mockReset()
  vi.mocked(prisma.deal.create).mockReset()
  vi.mocked(prisma.channel.findFirst).mockReset()
})

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

describe('finalizeLead', () => {
  it('rechaza con 422 si consentAccepted no es true', async () => {
    const result = await finalizeLead(WS_ID, { sessionId: 'sess-1', consentAccepted: false } as any)
    expect(result).toEqual({ ok: false, status: 422, error: expect.any(String) })
    expect(prisma.contact.findUnique).not.toHaveBeenCalled()
  })

  it('rechaza con 409 si el email ya pertenece a otro Contact distinto al de la sesión', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c-session', email: null, phone: null, qualificationData: {} } as any) // by sessionId
      .mockResolvedValueOnce({ id: 'c-other', email: 'roberto@test.cl' } as any) // by email

    const result = await finalizeLead(WS_ID, {
      sessionId: 'sess-1', consentAccepted: true, email: 'roberto@test.cl'
    } as any)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('finaliza un lead nuevo: quita tag Incompleto, califica, crea Deal, dispara CAPI (website) y handoff WhatsApp — sin disparar QualifiedLead automáticamente', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({
        id: 'c1', name: 'Lead Solar (sess-1)', email: null, phone: null,
        qualificationData: { rawFields: { sessionId: 'sess-1', montoBoleta: '45000' } }
      } as any) // by sessionId
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce(null) // by phone
    vi.mocked(prisma.contact.update).mockResolvedValue({
      id: 'c1', name: 'Roberto Pérez', phone: '56912345678', email: null
    } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.deal.create).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null) // sin canal WhatsApp conectado

    const result = await finalizeLead(WS_ID, {
      sessionId: 'sess-1', consentAccepted: true, consentVersion: 'v1',
      nombre: 'Roberto Pérez', telefono: '+56 9 1234 5678', montoBoleta: '45000',
      landingUrl: 'https://solar.drillchile.cl/gracias'
    } as any)

    expect(result.ok).toBe(true)
    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c1', name: 'Incompleto' } })
    expect(qualifySolarLead).toHaveBeenCalled()
    expect(evaluateSolarResV2Criteria).toHaveBeenCalled()
    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({
        leadTemperature: 'HOT',
        qualificationData: expect.objectContaining({
          qualificationStatus: 'CALIFICA',
          qualificationSummary: 'ok',
          solarResV2Criteria: {
            serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
          }
        })
      })
    }))
    expect(prisma.deal.create).toHaveBeenCalled()
    expect(emitMetaContactEvent).toHaveBeenCalledWith(
      WS_ID, expect.objectContaining({ id: 'c1' }), 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/gracias'
    )
    expect(emitMetaLeadEvent).toHaveBeenCalledWith(
      WS_ID, expect.objectContaining({ id: 'c1' }), 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/gracias'
    )
    expect(emitMetaQualifiedLeadEvent).not.toHaveBeenCalled()
    expect(emitMetaFinanceApplicationSubmittedEvent).not.toHaveBeenCalled()
    expect(prepareWhatsappConversation).not.toHaveBeenCalled() // sin canal conectado
  })

  it('dispara FinanceApplicationSubmitted cuando el payload trae datos de financiamiento', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c1', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1', name: 'x', phone: null, email: 'roberto@test.cl' } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, {
      sessionId: 'sess-2', consentAccepted: true, email: 'roberto@test.cl', ingresoMensual: '900000', edad: '35'
    } as any)

    expect(emitMetaFinanceApplicationSubmittedEvent).toHaveBeenCalled()
  })

  it('asigna campos de atribución a las columnas escalares del Contact (paridad con sheets.service.ts) sin pisar first-touch ya existente', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({
        id: 'c1', name: 'x', email: null, phone: null, utmSource: 'google',
        qualificationData: { rawFields: {} }
      } as any) // by sessionId — ya tenía first-touch de un save anterior
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce(null) // by phone
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, {
      sessionId: 'sess-3', consentAccepted: true,
      utmSource: 'meta', utmCampaign: 'campana-1', metaCampaignId: '123', fbclid: 'abc'
    } as any)

    const updateArgs = vi.mocked(prisma.contact.update).mock.calls.at(-1)?.[0] as any
    expect(updateArgs.data.utmCampaign).toBe('campana-1')
    expect(updateArgs.data.metaCampaignId).toBe('123')
    expect(updateArgs.data.fbclid).toBe('abc')
    expect(updateArgs.data.utmSource).toBeUndefined() // ya tenía 'google' — no se pisa
  })

  it('NUNCA dispara QualifiedLead automáticamente desde finalizeLead, sin importar el resultado de calificación', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c2', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c2', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, { sessionId: 'sess-3', consentAccepted: true } as any)

    expect(emitMetaQualifiedLeadEvent).not.toHaveBeenCalled()
  })

  it('NO dispara Contact/Lead/FinanceApplicationSubmitted a Meta si el contacto no tiene email ni phone válidos', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c3', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c3', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, { sessionId: 'sess-4', consentAccepted: true } as any)

    expect(emitMetaContactEvent).not.toHaveBeenCalled()
    expect(emitMetaLeadEvent).not.toHaveBeenCalled()
  })
})
