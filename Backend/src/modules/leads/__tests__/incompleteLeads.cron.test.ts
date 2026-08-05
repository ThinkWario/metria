import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findMany: vi.fn(), delete: vi.fn() },
    contactTag: { deleteMany: vi.fn() }
  }
}))

import { cleanupStaleIncompleteLeads } from '../incompleteLeads.cron'
import { prisma } from '../../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('cleanupStaleIncompleteLeads', () => {
  it('busca contactos solar_direct tagueados Incompleto más viejos que la ventana de gracia', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([])

    await cleanupStaleIncompleteLeads()

    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        source: 'solar_direct',
        tags: { some: { name: 'Incompleto' } }
      })
    }))
  })

  it('borra los tags y el contact de cada borrador vencido, devolviendo el conteo', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as any)

    const deleted = await cleanupStaleIncompleteLeads()

    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c1' } })
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c2' } })
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c2' } })
    expect(deleted).toBe(2)
  })

  it('sigue con el resto si un contact no se puede borrar (p. ej. quedó con relaciones)', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as any)
    vi.mocked(prisma.contact.delete).mockRejectedValueOnce(new Error('FK constraint')).mockResolvedValueOnce({} as any)

    const deleted = await cleanupStaleIncompleteLeads()

    expect(prisma.contact.delete).toHaveBeenCalledTimes(2)
    expect(deleted).toBe(1)
  })
})
