import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contactCustomFieldDefinition: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn()
    }
  }
}))

import { listDefinitions, createDefinition, deleteDefinition } from '../customField.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listDefinitions', () => {
  it('lists definitions scoped to the workspace, ordered', async () => {
    vi.mocked(prisma.contactCustomFieldDefinition.findMany).mockResolvedValue([] as any)
    await listDefinitions(WS)
    expect(prisma.contactCustomFieldDefinition.findMany).toHaveBeenCalledWith({
      where: { workspaceId: WS },
      orderBy: { order: 'asc' }
    })
  })
})

describe('createDefinition', () => {
  it('slugifies the label into a key', async () => {
    vi.mocked(prisma.contactCustomFieldDefinition.findMany).mockResolvedValue([])
    vi.mocked(prisma.contactCustomFieldDefinition.create).mockResolvedValue({ id: 'cf-1', key: 'monto_boleta', label: 'Monto Boleta' } as any)

    await createDefinition(WS, 'Monto Boleta')

    expect(prisma.contactCustomFieldDefinition.create).toHaveBeenCalledWith({
      data: { workspaceId: WS, key: 'monto_boleta', label: 'Monto Boleta', order: 0 }
    })
  })

  it('dedupes the key by appending a suffix when it already exists', async () => {
    vi.mocked(prisma.contactCustomFieldDefinition.findMany).mockResolvedValue([
      { key: 'rut' }, { key: 'rut_2' }
    ] as any)
    vi.mocked(prisma.contactCustomFieldDefinition.create).mockResolvedValue({ id: 'cf-2', key: 'rut_3', label: 'RUT' } as any)

    await createDefinition(WS, 'RUT')

    expect(prisma.contactCustomFieldDefinition.create).toHaveBeenCalledWith({
      data: { workspaceId: WS, key: 'rut_3', label: 'RUT', order: 2 }
    })
  })
})

describe('deleteDefinition', () => {
  it('deletes a definition that belongs to the workspace', async () => {
    vi.mocked(prisma.contactCustomFieldDefinition.findFirst).mockResolvedValue({ id: 'cf-1' } as any)
    await deleteDefinition(WS, 'cf-1')
    expect(prisma.contactCustomFieldDefinition.delete).toHaveBeenCalledWith({ where: { id: 'cf-1' } })
  })

  it('throws when the definition does not belong to the workspace', async () => {
    vi.mocked(prisma.contactCustomFieldDefinition.findFirst).mockResolvedValue(null)
    await expect(deleteDefinition(WS, 'cf-1')).rejects.toThrow('Custom field not found')
  })
})
