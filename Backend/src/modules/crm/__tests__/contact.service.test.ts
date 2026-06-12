import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contactNote: { create: vi.fn() },
    contactTag: { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    contactHealthScore: { create: vi.fn() }
  }
}))

import { listContacts, getContact, updateContact, addNote, addTag, removeTag, calculateHealthScore, updateQualification } from '../contact.service'
import { prisma } from '../../../lib/prisma'

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
