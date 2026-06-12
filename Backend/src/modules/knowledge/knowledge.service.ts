import { prisma } from '../../lib/prisma'
import { chunkText } from './chunker'
import { getProvider } from '../ai-agent/providers/provider.factory'

interface IngestInput {
  name: string
  sourceType: 'PDF' | 'TEXT' | 'FAQ'
  /** Plain text for TEXT/FAQ; base64 for PDF. */
  content: string
  botAgentId?: string
}

export async function ingestDocument(workspaceId: string, input: IngestInput) {
  const doc = await prisma.knowledgeDocument.create({
    data: {
      workspaceId,
      botAgentId: input.botAgentId ?? null,
      name: input.name,
      sourceType: input.sourceType,
      status: 'PROCESSING'
    }
  })

  try {
    let text = input.content
    if (input.sourceType === 'PDF') {
      // pdf-parse v2 exposes a PDFParse class (no default export)
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(Buffer.from(input.content, 'base64')) })
      try {
        const result = await parser.getText()
        text = result.text
      } finally {
        await parser.destroy().catch(() => {})
      }
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error('Document has no extractable text')

    const embeddings = await getProvider().embed(chunks)
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content, i) => ({
        documentId: doc.id,
        workspaceId,
        content,
        embedding: embeddings[i],
        order: i
      }))
    })

    await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { status: 'READY' } })
  } catch (err: any) {
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: 'ERROR', error: err.message }
    })
  }
  return doc
}

export async function listDocuments(workspaceId: string) {
  return prisma.knowledgeDocument.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } }
  })
}

export async function deleteDocument(workspaceId: string, documentId: string) {
  const doc = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, workspaceId } })
  if (!doc) throw new Error('Document not found')
  return prisma.knowledgeDocument.delete({ where: { id: doc.id } }) // chunks cascade
}
