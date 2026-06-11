import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    knowledgeDocument: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    knowledgeChunk: { createMany: vi.fn() }
  }
}))
const embedMock = vi.fn()
vi.mock('../../ai-agent/providers/provider.factory', () => ({
  getProvider: () => ({ embed: embedMock, chat: vi.fn() })
}))
vi.mock('pdf-parse', () => ({ default: vi.fn(async () => ({ text: 'pdf text content' })) }))

import { ingestDocument, deleteDocument } from '../knowledge.service'
import { prisma } from '../../../lib/prisma'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.knowledgeDocument.create).mockResolvedValue({ id: 'doc-1' } as any)
  embedMock.mockResolvedValue([[0.1, 0.2]])
})

describe('ingestDocument', () => {
  it('creates doc, chunks, embeds and marks READY for TEXT', async () => {
    const doc = await ingestDocument('ws-1', { name: 'faq', sourceType: 'TEXT', content: 'Los paneles duran 25 años.' })
    expect(doc.id).toBe('doc-1')
    expect(prisma.knowledgeChunk.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ workspaceId: 'ws-1', documentId: 'doc-1', embedding: [0.1, 0.2] })
        ])
      })
    )
    expect(prisma.knowledgeDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) })
    )
  })

  it('marks ERROR when embedding fails', async () => {
    embedMock.mockRejectedValue(new Error('quota'))
    await ingestDocument('ws-1', { name: 'x', sourceType: 'TEXT', content: 'abc' })
    expect(prisma.knowledgeDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR', error: 'quota' }) })
    )
  })
})

describe('deleteDocument', () => {
  it('throws if doc not in workspace', async () => {
    vi.mocked(prisma.knowledgeDocument.findFirst).mockResolvedValue(null)
    await expect(deleteDocument('ws-1', 'doc-x')).rejects.toThrow('Document not found')
  })
})
