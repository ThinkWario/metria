import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    contactNote: { create: vi.fn(), updateMany: vi.fn() },
    contactTag: { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    contactHealthScore: { create: vi.fn(), updateMany: vi.fn() },
    conversation: { updateMany: vi.fn() },
    deal: { updateMany: vi.fn() },
    ticket: { updateMany: vi.fn() },
    invoice: { updateMany: vi.fn() },
    contactEvent: { updateMany: vi.fn() },
    contactTask: { updateMany: vi.fn() },
    campaignRecipient: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn()
  }
}))

vi.mock('../../meta-events/metaEvents.service', () => ({
  emitMetaQualifiedLeadEvent: vi.fn(async () => {})
}))

import { listContacts, getContact, updateContact, addNote, addTag, removeTag, calculateHealthScore, updateQualification, findPossibleDuplicates, mergeContacts, confirmQualifiedLead } from '../contact.service'
import { prisma } from '../../../lib/prisma'
import { emitMetaQualifiedLeadEvent } from '../../meta-events/metaEvents.service'

const WS = 'ws-1'
const CONTACT_ID = 'ct-1'

beforeEach(() => vi.clearAllMocks())

describe('listContacts', () => {
  it('returns contacts scoped to workspaceId', async () => {
    const mockContacts = [{ id: CONTACT_ID, name: 'Ana', status: 'LEAD', ltv: '0', tags: [], _count: { conversations: 2, deals: 1, tickets: 0 } }]
    vi.mocked(prisma.contact.findMany).mockResolvedValue(mockContacts as any)

    const result = await listContacts(WS, {})

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    )
    expect(result).toEqual(mockContacts)
  })

  it('passes leadTemperature and leadType filters into the where clause', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([])
    await listContacts(WS, { leadTemperature: 'HOT', leadType: 'READY_TO_BUY' })
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS, leadTemperature: 'HOT', leadType: 'READY_TO_BUY' })
      })
    )
  })

  it('omits qualification filters from where clause when not provided', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([])
    await listContacts(WS, {})
    const arg = vi.mocked(prisma.contact.findMany).mock.calls[0][0] as any
    expect(arg.where).not.toHaveProperty('leadTemperature')
    expect(arg.where).not.toHaveProperty('leadType')
  })

  it('passes search filter as OR clause', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([])
    await listContacts(WS, { search: 'ana' })
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({ name: expect.any(Object) })]) })
      })
    )
  })
})

describe('getContact', () => {
  it('throws if contact not found', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(getContact(WS, CONTACT_ID)).rejects.toThrow('Contact not found')
  })

  it('returns contact with relations', async () => {
    const mock = { id: CONTACT_ID, workspaceId: WS, name: 'Ana', tags: [], contactNotes: [], deals: [], tickets: [], conversations: [], healthScores: [] }
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(mock as any)
    const result = await getContact(WS, CONTACT_ID)
    expect(result).toEqual(mock)
  })
})

describe('updateContact', () => {
  it('throws if contact not found', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(updateContact(WS, CONTACT_ID, { status: 'CUSTOMER' })).rejects.toThrow('Contact not found')
  })

  it('updates contact fields', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: CONTACT_ID } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID, status: 'CUSTOMER' } as any)
    await updateContact(WS, CONTACT_ID, { status: 'CUSTOMER' })
    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: CONTACT_ID, workspaceId: WS }, data: { status: 'CUSTOMER' } })
  })
})

describe('addNote', () => {
  it('creates a note linked to the contact', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: CONTACT_ID } as any)
    vi.mocked(prisma.contactNote.create).mockResolvedValue({ id: 'note-1', content: 'Hello' } as any)
    await addNote(WS, CONTACT_ID, 'user-1', 'Hello')
    expect(prisma.contactNote.create).toHaveBeenCalledWith({
      data: { workspaceId: WS, contactId: CONTACT_ID, userId: 'user-1', content: 'Hello' }
    })
  })
})

describe('addTag', () => {
  it('upserts tag on contact', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: CONTACT_ID } as any)
    vi.mocked(prisma.contactTag.upsert).mockResolvedValue({ id: 'tag-1', name: 'VIP', color: '#f59e0b' } as any)
    await addTag(WS, CONTACT_ID, 'VIP', '#f59e0b')
    expect(prisma.contactTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contactId_name: { contactId: CONTACT_ID, name: 'VIP' } } })
    )
  })
})

describe('removeTag', () => {
  it('throws if tag not found', async () => {
    vi.mocked(prisma.contactTag.findFirst).mockResolvedValue(null)
    await expect(removeTag(WS, CONTACT_ID, 'tag-1')).rejects.toThrow('Tag not found')
  })

  it('deletes tag when found', async () => {
    vi.mocked(prisma.contactTag.findFirst).mockResolvedValue({ id: 'tag-1', contactId: CONTACT_ID } as any)
    vi.mocked(prisma.contactTag.delete).mockResolvedValue({} as any)
    await removeTag(WS, CONTACT_ID, 'tag-1')
    expect(prisma.contactTag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } })
  })
})

describe('calculateHealthScore', () => {
  it('computes and persists health score', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, ltv: '200', tickets: [], conversations: []
    } as any)
    vi.mocked(prisma.contactHealthScore.create).mockResolvedValue({} as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any)

    const result = await calculateHealthScore(WS, CONTACT_ID)

    expect(prisma.contactHealthScore.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactId: CONTACT_ID, score: expect.any(Number) }) })
    )
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ healthScore: result.score }) })
    )
  })
})

describe('updateQualification', () => {
  it('updates qualification fields scoped to workspace and merges qualificationData', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: CONTACT_ID, qualificationData: { is_owner: true } } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID } as any)

    await updateQualification(WS, CONTACT_ID, {
      temperature: 'HOT', type: 'READY_TO_BUY', score: 90, data: { monthly_kwh: '80000' }
    })

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({ where: { id: CONTACT_ID, workspaceId: WS } })
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadTemperature: 'HOT',
          leadType: 'READY_TO_BUY',
          leadScore: 90,
          qualificationData: { is_owner: true, monthly_kwh: '80000' }
        })
      })
    )
  })

  it('throws when contact not found in workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(updateQualification(WS, CONTACT_ID, { temperature: 'COLD' })).rejects.toThrow('Contact not found')
  })

  it('rejects invalid temperature value', async () => {
    await expect(updateQualification(WS, CONTACT_ID, { temperature: 'LAVA' as any })).rejects.toThrow('Invalid temperature')
  })
})

describe('findPossibleDuplicates', () => {
  it('finds other contacts in the same workspace with a matching name', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: CONTACT_ID, name: 'Juan Perez' } as any)
    const dupes = [{ id: 'ct-2', name: 'Juan Perez', phone: 'ig_98765' }]
    vi.mocked(prisma.contact.findMany).mockResolvedValue(dupes as any)

    const result = await findPossibleDuplicates(WS, CONTACT_ID)

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          id: { not: CONTACT_ID },
          name: { equals: 'Juan Perez', mode: 'insensitive' }
        })
      })
    )
    expect(result).toEqual(dupes)
  })

  it('returns an empty array when the source contact is not found', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)

    const result = await findPossibleDuplicates(WS, CONTACT_ID)

    expect(result).toEqual([])
    expect(prisma.contact.findMany).not.toHaveBeenCalled()
  })
})

describe('mergeContacts', () => {
  const SURVIVOR = 'ct-survivor'
  const DUPLICATE = 'ct-duplicate'

  it('reassigns every related record onto the survivor and deletes the duplicate', async () => {
    vi.mocked(prisma.contact.findFirst)
      .mockResolvedValueOnce({ id: SURVIVOR, workspaceId: WS } as any)
      .mockResolvedValueOnce({ id: DUPLICATE, workspaceId: WS } as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
    vi.mocked(prisma.contactTag.findMany).mockResolvedValue([])
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: SURVIVOR, name: 'Juan Perez' } as any)

    const result = await mergeContacts(WS, SURVIVOR, DUPLICATE)

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE }, data: { contactId: SURVIVOR } })
    expect(prisma.deal.updateMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE }, data: { contactId: SURVIVOR } })
    expect(prisma.contactNote.updateMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE }, data: { contactId: SURVIVOR } })
    expect(prisma.contactTag.updateMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE }, data: { contactId: SURVIVOR } })
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: DUPLICATE } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, event: 'contact.merge' }) })
    )
    expect(result).toEqual({ id: SURVIVOR, name: 'Juan Perez' })
  })

  it('deletes duplicate-owned tags that already exist on the survivor before reassigning the rest', async () => {
    vi.mocked(prisma.contact.findFirst)
      .mockResolvedValueOnce({ id: SURVIVOR, workspaceId: WS } as any)
      .mockResolvedValueOnce({ id: DUPLICATE, workspaceId: WS } as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
    vi.mocked(prisma.contactTag.findMany).mockResolvedValue([{ name: 'VIP' }] as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: SURVIVOR } as any)

    await mergeContacts(WS, SURVIVOR, DUPLICATE)

    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE, name: { in: ['VIP'] } } })
    expect(prisma.contactTag.updateMany).toHaveBeenCalledWith({ where: { contactId: DUPLICATE }, data: { contactId: SURVIVOR } })
  })

  it('throws when survivorId equals duplicateId', async () => {
    await expect(mergeContacts(WS, SURVIVOR, SURVIVOR)).rejects.toThrow('Cannot merge a contact into itself')
  })

  it('throws when either contact is not in the workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValueOnce(null)

    await expect(mergeContacts(WS, SURVIVOR, DUPLICATE)).rejects.toThrow('Contact not found')
  })
})

describe('confirmQualifiedLead', () => {
  const ALL_MET = { serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true }

  it('rechaza si el contacto no existe', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('not found')
  })

  it('rechaza si el contacto no es source solar_direct', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'sheet_import', qualificationData: { solarResV2Criteria: ALL_MET }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('solar_direct')
  })

  it('rechaza si no hay solarResV2Criteria calculado todavía', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl', qualificationData: {}
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('No solar_res_v2 criteria')
  })

  it('rechaza sin override si no todos los criterios están cumplidos', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('not fully met')
  })

  it('rechaza override sin overrideReason', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1', { override: true })).rejects.toThrow('overrideReason is required')
  })

  it('rechaza si el contacto no tiene email ni phone válidos, sin disparar el evento a Meta', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: null, phone: null,
      qualificationData: { solarResV2Criteria: ALL_MET }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('no valid email or phone')
    expect(emitMetaQualifiedLeadEvent).not.toHaveBeenCalled()
  })

  it('rechaza si ya fue confirmado antes', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct',
      qualificationData: { solarResV2Criteria: ALL_MET, qualifiedLeadConfirmedAt: '2026-08-01T00:00:00.000Z' }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('already confirmed')
  })

  it('confirma, persiste qualificationVersion/nextStepConfirmed/confirmedBy y dispara QualifiedLead a Meta cuando todos los criterios están cumplidos', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { rawFields: {}, solarResV2Criteria: ALL_MET }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID, email: 'a@b.cl' } as any)

    const result = await confirmQualifiedLead(WS, CONTACT_ID, 'user-1')

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CONTACT_ID, workspaceId: WS },
      data: expect.objectContaining({
        qualificationData: expect.objectContaining({
          qualificationVersion: 'solar_res_v2',
          nextStepConfirmed: true,
          qualifiedLeadConfirmedBy: 'user-1'
        })
      })
    }))
    expect(emitMetaQualifiedLeadEvent).toHaveBeenCalledWith(
      WS, expect.objectContaining({ id: CONTACT_ID }), 'system_generated',
      { qualificationVersion: 'solar_res_v2', serviceAreaMatch: true }
    )
    expect(result.capiDelivered).toBe(true)
  })

  it('permite override con overrideReason y lo persiste, aunque falten criterios', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { rawFields: {}, solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID } as any)

    await confirmQualifiedLead(WS, CONTACT_ID, 'user-1', { override: true, overrideReason: 'Cliente confirmó boleta real por teléfono, sistema no la capturó' })

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        qualificationData: expect.objectContaining({
          qualifiedLeadOverrideReason: 'Cliente confirmó boleta real por teléfono, sistema no la capturó'
        })
      })
    }))
    expect(emitMetaQualifiedLeadEvent).toHaveBeenCalled()
  })

  it('acota overrideReason a 500 caracteres antes de persistirlo', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { rawFields: {}, solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID } as any)
    const longReason = 'x'.repeat(600)

    await confirmQualifiedLead(WS, CONTACT_ID, 'user-1', { override: true, overrideReason: longReason })

    const updateArgs = vi.mocked(prisma.contact.update).mock.calls.at(-1)?.[0] as any
    expect(updateArgs.data.qualificationData.qualifiedLeadOverrideReason).toHaveLength(500)
  })

  it('persiste la confirmación y devuelve capiDelivered:false sin lanzar cuando el envío a Meta falla', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { rawFields: {}, solarResV2Criteria: ALL_MET }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID, email: 'a@b.cl' } as any)
    vi.mocked(emitMetaQualifiedLeadEvent).mockRejectedValueOnce(new Error('Meta API down'))

    const result = await confirmQualifiedLead(WS, CONTACT_ID, 'user-1')

    expect(prisma.contact.update).toHaveBeenCalled()
    expect(result.capiDelivered).toBe(false)
  })
})
