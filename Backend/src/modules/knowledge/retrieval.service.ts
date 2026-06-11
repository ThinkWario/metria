import { prisma } from '../../lib/prisma'
import { getProvider } from '../ai-agent/providers/provider.factory'

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

interface RetrieveOptions {
  topK?: number
  minScore?: number
}

export async function retrieveRelevantChunks(
  workspaceId: string,
  query: string,
  opts: RetrieveOptions = {}
): Promise<{ content: string; score: number }[]> {
  const topK = opts.topK ?? 5
  const minScore = opts.minScore ?? 0.5

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { workspaceId, document: { status: 'READY' } },
    select: { content: true, embedding: true }
  })
  if (chunks.length === 0) return []

  const [queryEmbedding] = await getProvider().embed([query])

  return chunks
    .map(c => ({ content: c.content, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
