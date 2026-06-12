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
// pdf-parse v2 exports a PDFParse class (no default export)
const getTextMock = vi.fn(async () => ({ text: 'pdf text content' }))
const destroyMock = vi.fn(async () => undefined)
const pdfParseCtor = vi.fn(function (this: any) {
  this.getText = getTextMock
  this.destroy = destroyMock
})
vi.mock('pdf-parse', () => ({ PDFParse: pdfParseCtor }))

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

  it('extracts text from PDFs via the pdf-parse v2 PDFParse class', async () => {
    const base64 = Buffer.from('%PDF-1.4 fake').toString('base64')
    await ingestDocument('ws-1', { name: 'doc.pdf', sourceType: 'PDF', content: base64 })

    expect(pdfParseCtor).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) })
    )
    expect(getTextMock).toHaveBeenCalled()
    expect(destroyMock).toHaveBeenCalled()
    expect(prisma.knowledgeChunk.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining('pdf text content') })
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
