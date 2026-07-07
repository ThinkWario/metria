import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    sheetIntegration: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    channel: { findFirst: vi.fn() },
    contact: { findUnique: vi.fn(async () => null), create: vi.fn(), update: vi.fn(async () => ({})) },
    contactTag: { upsert: vi.fn(), deleteMany: vi.fn() },
    deal: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    conversation: { findUnique: vi.fn(async () => null), create: vi.fn() },
    message: { create: vi.fn(async () => ({ id: 'note-1', content: '', sentAt: new Date() })) }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

vi.mock('../sheets.agent', () => ({
  suggestFieldMappings: vi.fn(),
  qualifyLead: vi.fn()
}))

import { syncSheet } from '../sheets.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'
const INTEGRATION_ID = 'integ-1'

function baseIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WS_ID,
    sheetId: 'sheet-1',
    sheetName: 'Leads Solar',
    campaignLabel: 'campana-1',
    isActive: true,
    fieldMappings: { name: 'Nombre', phone: 'Telefono' },
    qualificationFields: null,
    qualificationRules: null,
    importFilter: 'ALL',
    importedSessionIds: [],
    targetPipelineId: 'pipe-1',
    targetStageId: 'stage-1',
    linkToWhatsapp: false,
    whatsappOpeningMessage: null,
    ...overrides
  }
}

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

function mockSheetRows(rows: string[][]) {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ values: [['Nombre', 'Telefono'], ...rows] })
  } as any)
}

describe('syncSheet WhatsApp-linking', () => {
  it('does nothing WhatsApp-related when linkToWhatsapp is off (unchanged default behavior)', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(baseIntegration({ linkToWhatsapp: false }) as any)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    expect(prisma.channel.findFirst).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
  })

  it('creates a Conversation + internal suggested-opener note when on, phone is valid, and WhatsApp is connected', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({ linkToWhatsapp: true, whatsappOpeningMessage: 'Hola {nombre}, gracias por tu interés!' }) as any
    )
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-whatsapp' } as any)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    vi.mocked(prisma.conversation.create).mockResolvedValue({ id: 'conv-1', status: 'PENDING', createdAt: new Date() } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WS_ID,
          channelId: 'ch-whatsapp',
          contactId: 'c1',
          externalId: '56912345678@c.us',
          status: 'PENDING',
          isHandledByBot: false
        })
      })
    )
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          senderType: 'SYSTEM',
          isInternal: true,
          content: expect.stringContaining('Hola Ana, gracias por tu interés!')
        })
      })
    )
  })

  it('skips WhatsApp-linking (but still imports the contact) when the phone does not validate', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(baseIntegration({ linkToWhatsapp: true }) as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-whatsapp' } as any)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: null } as any)
    mockSheetRows([['Ana', 'no-es-un-telefono']])

    const result = await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(result.errors).toBe(0)
  })

  it('skips WhatsApp-linking gracefully (no crash) when no WhatsApp channel is connected', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(baseIntegration({ linkToWhatsapp: true }) as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    const result = await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(result.errors).toBe(0)
  })
})

describe('syncSheet dedup safeguards', () => {
  it('ignores a concurrent sync of the same integration instead of double-importing', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(baseIntegration() as any)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    const [r1, r2] = await Promise.all([syncSheet(INTEGRATION_ID), syncSheet(INTEGRATION_ID)])

    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
    expect([r1, r2]).toContainEqual({ imported: 0, skipped: 0, errors: 0 })
  })

  it('falls back to row position for dedup when no sessionId column is mapped, so re-syncing does not reimport', async () => {
    let integration = baseIntegration()
    vi.mocked(prisma.sheetIntegration.findUnique).mockImplementation(async () => integration as any)
    vi.mocked(prisma.sheetIntegration.update).mockImplementation(async ({ data }: any) => {
      integration = { ...integration, importedSessionIds: [...integration.importedSessionIds, ...data.importedSessionIds.push] }
      return integration as any
    })
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)
    await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
  })

  it('dedupes deals by contact + pipeline, not by a fragile title substring match', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(baseIntegration() as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: 'c1', name: 'Zzz-Totally-Different-Name', phone: '56912345678' } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    expect(prisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contactId: 'c1', pipelineId: 'pipe-1' } })
    )
    expect(prisma.deal.create).not.toHaveBeenCalled()
  })
})

describe('syncSheet column exclusion + custom field mapping', () => {
  it('omits excluded columns from qualificationData.rawFields', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({ fieldMappings: { name: 'Nombre', phone: 'Telefono' }, excludedColumns: ['Telefono'] }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    const createArg = vi.mocked(prisma.contact.create).mock.calls[0][0] as any
    expect(createArg.data.qualificationData.rawFields).not.toHaveProperty('Telefono')
    expect(createArg.data.qualificationData.rawFields).toHaveProperty('Nombre', 'Ana')
  })

  it('writes customFieldMappings values onto contact.customFields for a newly-created contact', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({
        fieldMappings: { name: 'Nombre', phone: 'Telefono' },
        customFieldMappings: { Nombre: 'display_name' }
      }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678', customFields: null } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { customFields: { display_name: 'Ana' } }
    })
  })

  it('merges customFieldMappings values into an already-existing contact\'s customFields', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({
        fieldMappings: { name: 'Nombre', phone: 'Telefono' },
        customFieldMappings: { Nombre: 'display_name' }
      }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678', customFields: { rut: '11.111.111-1' } } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    mockSheetRows([['Ana', '9 1234 5678']])

    await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { customFields: { rut: '11.111.111-1', display_name: 'Ana' } }
    })
  })
})

describe('syncSheet incomplete-lead capture', () => {
  it('still creates the contact and deal when the row fails the eventFilter, tagged Incompleto', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({
        fieldMappings: { name: 'Nombre', phone: 'Telefono', eventColumn: 'Evento', eventFilter: 'completo' }
      }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678', customFields: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['Nombre', 'Telefono', 'Evento'], ['Ana', '9 1234 5678', 'iniciado']] })
    } as any)

    const result = await syncSheet(INTEGRATION_ID)

    expect(prisma.contact.create).toHaveBeenCalledTimes(1)
    expect(prisma.contactTag.upsert).toHaveBeenCalledWith({
      where: { contactId_name: { contactId: 'c1', name: 'Incompleto' } },
      create: { workspaceId: WS_ID, contactId: 'c1', name: 'Incompleto', color: '#f97316' },
      update: {}
    })
    expect(result.imported).toBe(1)
  })

  it('removes the Incompleto tag when a later sync sees the same lead now matching the eventFilter', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({
        fieldMappings: { name: 'Nombre', phone: 'Telefono', eventColumn: 'Evento', eventFilter: 'completo' }
      }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678', customFields: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['Nombre', 'Telefono', 'Evento'], ['Ana', '9 1234 5678', 'completo']] })
    } as any)

    await syncSheet(INTEGRATION_ID)

    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c1', name: 'Incompleto' } })
    expect(prisma.contactTag.upsert).not.toHaveBeenCalled()
  })

  it('does not add an incomplete row\'s sessionId to importedSessionIds, so it is re-evaluated next sync', async () => {
    vi.mocked(prisma.sheetIntegration.findUnique).mockResolvedValue(
      baseIntegration({
        fieldMappings: { name: 'Nombre', phone: 'Telefono', sessionId: 'SID', eventColumn: 'Evento', eventFilter: 'completo' }
      }) as any
    )
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', name: 'Ana', phone: '56912345678', customFields: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['Nombre', 'Telefono', 'SID', 'Evento'], ['Ana', '9 1234 5678', 'sess-1', 'iniciado']] })
    } as any)

    await syncSheet(INTEGRATION_ID)

    expect(prisma.sheetIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ importedSessionIds: { push: [] } }) })
    )
  })
})
