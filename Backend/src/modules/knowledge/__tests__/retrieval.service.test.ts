import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: { knowledgeChunk: { findMany: vi.fn() } }
}))
const embedMock = vi.fn()
vi.mock('../../ai-agent/providers/provider.factory', () => ({
  getProvider: () => ({ embed: embedMock, chat: vi.fn() })
}))

import { cosineSimilarity, retrieveRelevantChunks } from '../retrieval.service'
import { prisma } from '../../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })
  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('returns 0 for zero vector (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
})

describe('retrieveRelevantChunks', () => {
  it('returns top-k chunks above threshold sorted by similarity', async () => {
    embedMock.mockResolvedValue([[1, 0]])
    vi.mocked(prisma.knowledgeChunk.findMany).mockResolvedValue([
      { id: 'a', content: 'relevante', embedding: [0.9, 0.1] },
      { id: 'b', content: 'irrelevante', embedding: [0, 1] },
      { id: 'c', content: 'muy relevante', embedding: [1, 0] }
    ] as any)

    const result = await retrieveRelevantChunks('ws-1', 'paneles', { topK: 2, minScore: 0.5 })
    expect(result.map(r => r.content)).toEqual(['muy relevante', 'relevante'])
    expect(prisma.knowledgeChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) })
    )
  })

  it('returns [] when workspace has no chunks (no embed call)', async () => {
    vi.mocked(prisma.knowledgeChunk.findMany).mockResolvedValue([])
    const result = await retrieveRelevantChunks('ws-1', 'x')
    expect(result).toEqual([])
    expect(embedMock).not.toHaveBeenCalled()
  })
})
