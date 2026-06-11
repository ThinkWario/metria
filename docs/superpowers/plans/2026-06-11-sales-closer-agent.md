# Sales Closer Agent (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp AI sales-closing agent: per-business knowledge base (RAG-light), wizard-configured playbook with solar template, automatic lead qualification/tagging (temperature + type + score), internal appointment scheduling, and configurable AI follow-up sequences.

**Architecture:** Extend existing modules in-place. New `providers/` abstraction wraps Gemini (chat + embeddings). New `knowledge/` module ingests docs → chunks → embeddings stored as `Float[]` in Postgres, cosine similarity computed in Node (no pgvector). `promptCompiler` builds the system prompt from BotAgent profile + RAG chunks + lead state. New AI tools mutate qualification, tags, and appointments. Follow-up engine (FollowUpRule/FollowUpJob + 15-min cron) replaces the fixed nurturing cron. All resources scoped to `workspaceId`.

**Tech Stack:** Express 4, Prisma 5 (Postgres 15), `@google/generative-ai` (gemini-1.5-flash + text-embedding-004), `pdf-parse`, node-cron, vitest, Next.js 16 frontend.

**Codebase conventions (follow them):**
- Schema: enums are plain `String` with `@default(...)`, columns use `@map("snake_case")`, tables `@@map("plural")`.
- Services: exported async functions (no classes), first param `workspaceId`.
- Tests: `src/modules/<mod>/__tests__/<file>.test.ts`, `vi.mock('../../../lib/prisma')` pattern.
- Routes: module router file registered in `Backend/src/app.ts` (`app.use('/api', xRoutes)`), gated with `authenticate` + `requirePlan('PRO','SCALE')` like `bot.routes`.
- Existing key files: `Backend/src/modules/ai-agent/ai.service.ts` (current Gemini agent, 5 tools), `Backend/src/modules/messaging/message.service.ts:124-154` (AI invocation + rules fallback), `Backend/src/modules/ai-agent/nurturing.service.ts` + `nurturing.cron.ts` (legacy follow-up, will be replaced), `Backend/src/modules/crm/contact.service.ts` (`updateContact`, `addTag`).

**Run all backend commands from `C:\Proyectos\Metria\Backend`.**

---

### Task 1: Prisma schema — new models + Contact qualification fields

**Files:**
- Modify: `Backend/prisma/schema.prisma`

- [ ] **Step 1: Add fields to `model Contact`** (after `healthScore Int? @map("health_score")`):

```prisma
  leadScore         Int?     @map("lead_score")
  leadTemperature   String?  @map("lead_temperature")   // COLD | WARM | HOT
  leadType          String?  @map("lead_type")          // CURIOUS | QUOTING | READY_TO_BUY | POST_SALE
  qualificationData Json?    @map("qualification_data")
```

Also add relations to Contact: `appointments Appointment[]`.

- [ ] **Step 2: Add new models** (at end of schema; add matching back-relations `knowledgeDocuments KnowledgeDocument[]`, `appointments Appointment[]`, `availabilityRules AvailabilityRule[]`, `followUpRules FollowUpRule[]` to `model Workspace`):

```prisma
model KnowledgeDocument {
  id          String           @id @default(uuid())
  workspaceId String           @map("workspace_id")
  botAgentId  String?          @map("bot_agent_id")
  name        String
  sourceType  String           @map("source_type")      // PDF | TEXT | FAQ
  status      String           @default("PROCESSING")   // PROCESSING | READY | ERROR
  error       String?
  createdAt   DateTime         @default(now()) @map("created_at")
  chunks      KnowledgeChunk[]
  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("knowledge_documents")
}

model KnowledgeChunk {
  id          String            @id @default(uuid())
  documentId  String            @map("document_id")
  workspaceId String            @map("workspace_id")
  content     String
  embedding   Float[]
  order       Int
  document    KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("knowledge_chunks")
}

model AvailabilityRule {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  dayOfWeek   Int       @map("day_of_week")              // 0=Sunday .. 6
  startTime   String    @map("start_time")               // "09:00"
  endTime     String    @map("end_time")                 // "18:00"
  slotMinutes Int       @default(60) @map("slot_minutes")
  apptType    String    @default("SITE_VISIT") @map("appt_type") // SITE_VISIT | CALL
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("availability_rules")
}

model Appointment {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  contactId   String    @map("contact_id")
  dealId      String?   @map("deal_id")
  type        String    @default("SITE_VISIT")           // SITE_VISIT | CALL
  scheduledAt DateTime  @map("scheduled_at")
  durationMin Int       @default(60) @map("duration_min")
  status      String    @default("SCHEDULED")            // SCHEDULED | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  notes       String?
  createdBy   String    @map("created_by")               // 'BOT' | userId
  createdAt   DateTime  @default(now()) @map("created_at")
  contact     Contact   @relation(fields: [contactId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, scheduledAt])
  @@map("appointments")
}

model FollowUpRule {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  botAgentId  String    @map("bot_agent_id")
  delayHours  Int       @map("delay_hours")
  order       Int       @default(0)
  isActive    Boolean   @default(true) @map("is_active")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, isActive])
  @@map("follow_up_rules")
}

model FollowUpJob {
  id             String    @id @default(uuid())
  workspaceId    String    @map("workspace_id")
  conversationId String    @map("conversation_id")
  ruleId         String    @map("rule_id")
  scheduledAt    DateTime  @map("scheduled_at")
  status         String    @default("PENDING")           // PENDING | SENT | CANCELLED
  sentAt         DateTime? @map("sent_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([status, scheduledAt])
  @@index([conversationId, status])
  @@map("follow_up_jobs")
}
```

- [ ] **Step 3: Push schema**

Run: `npm run db:push`
Expected: "Your database is now in sync with your Prisma schema" + client regenerated. (Requires `docker compose up -d` running.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): knowledge base, appointments, follow-up rules, lead qualification fields"
```

---

### Task 2: LLM provider abstraction

**Files:**
- Create: `Backend/src/modules/ai-agent/providers/types.ts`
- Create: `Backend/src/modules/ai-agent/providers/gemini.provider.ts`
- Create: `Backend/src/modules/ai-agent/providers/provider.factory.ts`
- Test: `Backend/src/modules/ai-agent/__tests__/provider.factory.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON-schema-like, provider adapts it
}

export interface ToolCall {
  name: string
  args: Record<string, any>
}

export interface ChatResult {
  text: string | null
  toolCalls: ToolCall[]
  /** Continue the same turn by feeding tool results back. */
  submitToolResults(results: { name: string; response: object }[]): Promise<ChatResult>
}

export interface LLMProvider {
  chat(input: { system: string; messages: ChatMessage[]; tools: ToolDeclaration[] }): Promise<ChatResult>
  embed(texts: string[]): Promise<number[][]>
}
```

- [ ] **Step 2: Write `gemini.provider.ts`** (logic ported from current `ai.service.ts`; tool params already use Gemini `SchemaType` shape, pass through):

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, ChatResult, LLMProvider, ToolDeclaration } from './types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

function wrapResult(chat: any, response: any): ChatResult {
  const calls = response.functionCalls() || []
  return {
    text: calls.length ? null : response.text(),
    toolCalls: calls.map((c: any) => ({ name: c.name, args: c.args })),
    async submitToolResults(results) {
      const parts = results.map(r => ({ functionResponse: { name: r.name, response: r.response } }))
      const next = await chat.sendMessage(parts)
      return wrapResult(chat, next.response)
    }
  }
}

export const geminiProvider: LLMProvider = {
  async chat({ system, messages, tools }) {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools: [{ functionDeclarations: tools }] as any
    })
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))
    const last = messages[messages.length - 1]
    const chat = model.startChat({
      history: history as any,
      systemInstruction: { role: 'system', parts: [{ text: system }] }
    })
    const result = await chat.sendMessage(last?.content ?? '')
    return wrapResult(chat, result.response)
  },

  async embed(texts) {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    const res = await model.batchEmbedContents({
      requests: texts.map(t => ({ content: { role: 'user', parts: [{ text: t }] } }))
    })
    return res.embeddings.map(e => e.values)
  }
}
```

- [ ] **Step 3: Write failing test for factory**

```ts
import { describe, it, expect } from 'vitest'
import { getProvider } from '../providers/provider.factory'
import { geminiProvider } from '../providers/gemini.provider'

describe('provider.factory', () => {
  it('returns gemini provider by name', () => {
    expect(getProvider('gemini')).toBe(geminiProvider)
  })
  it('defaults to gemini for null/undefined', () => {
    expect(getProvider(undefined)).toBe(geminiProvider)
  })
  it('throws on unknown provider', () => {
    expect(() => getProvider('skynet')).toThrow(/Unknown LLM provider/)
  })
})
```

Run: `npx vitest run src/modules/ai-agent/__tests__/provider.factory.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `provider.factory.ts`**

```ts
import type { LLMProvider } from './types'
import { geminiProvider } from './gemini.provider'

const providers: Record<string, LLMProvider> = {
  gemini: geminiProvider
}

export function getProvider(name?: string | null): LLMProvider {
  const key = name || 'gemini'
  const provider = providers[key]
  if (!provider) throw new Error(`Unknown LLM provider: ${key}`)
  return provider
}
```

- [ ] **Step 5: Run test** — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai-agent/providers src/modules/ai-agent/__tests__/provider.factory.test.ts
git commit -m "feat(ai): LLM provider abstraction with Gemini implementation"
```

---

### Task 3: Knowledge module — chunker

**Files:**
- Create: `Backend/src/modules/knowledge/chunker.ts`
- Test: `Backend/src/modules/knowledge/__tests__/chunker.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { chunkText } from '../chunker'

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('hola mundo')).toEqual(['hola mundo'])
  })
  it('splits long text into chunks under maxChars with overlap', () => {
    const text = Array.from({ length: 100 }, (_, i) => `Frase número ${i} sobre paneles solares.`).join(' ')
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500)
    // overlap: start of chunk[1] appears near end of chunk[0]
    expect(chunks[0].slice(-100)).toContain(chunks[1].slice(0, 30))
  })
  it('ignores empty/whitespace input', () => {
    expect(chunkText('   ')).toEqual([])
  })
})
```

Run: `npx vitest run src/modules/knowledge/__tests__/chunker.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `chunker.ts`** (~800 tokens ≈ 3200 chars default; split on sentence boundaries when possible):

```ts
interface ChunkOptions {
  maxChars?: number
  overlapChars?: number
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 3200
  const overlapChars = opts.overlapChars ?? 400
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length)
    if (end < clean.length) {
      const lastPeriod = clean.lastIndexOf('. ', end)
      if (lastPeriod > start + maxChars * 0.5) end = lastPeriod + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(end - overlapChars, start + 1)
  }
  return chunks
}
```

- [ ] **Step 3: Run test** — Expected: PASS.
- [ ] **Step 4: Commit** — `git add src/modules/knowledge && git commit -m "feat(knowledge): text chunker"`

---

### Task 4: Knowledge module — retrieval (cosine similarity)

**Files:**
- Create: `Backend/src/modules/knowledge/retrieval.service.ts`
- Test: `Backend/src/modules/knowledge/__tests__/retrieval.service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

Run: `npx vitest run src/modules/knowledge/__tests__/retrieval.service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `retrieval.service.ts`**

```ts
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
```

- [ ] **Step 3: Run test** — Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(knowledge): cosine retrieval service"`

---

### Task 5: Knowledge module — ingestion service + routes

**Files:**
- Create: `Backend/src/modules/knowledge/knowledge.service.ts`
- Create: `Backend/src/modules/knowledge/knowledge.routes.ts`
- Modify: `Backend/src/app.ts` (import + `app.use('/api', knowledgeRoutes)` next to the other module routers)
- Test: `Backend/src/modules/knowledge/__tests__/knowledge.service.test.ts`

- [ ] **Step 1: Install pdf-parse**

Run: `npm install pdf-parse && npm install -D @types/pdf-parse`

- [ ] **Step 2: Write failing test**

```ts
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
```

Run: `npx vitest run src/modules/knowledge/__tests__/knowledge.service.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `knowledge.service.ts`**

```ts
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
      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(Buffer.from(input.content, 'base64'))
      text = parsed.text
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
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Write `knowledge.routes.ts`** (mirror auth/gating used in `Backend/src/modules/bot/bot.routes.ts` — read that file first and copy its middleware imports exactly):

```ts
import { Router } from 'express'
// Copy the exact authenticate + requirePlan imports used in bot.routes.ts
import { authenticate } from '../../middleware/authenticate'
import { requirePlan } from '../../middleware/planGate'
import { ingestDocument, listDocuments, deleteDocument } from './knowledge.service'

const router = Router()
router.use('/knowledge', authenticate, requirePlan('PRO', 'SCALE'))

router.post('/knowledge', async (req: any, res) => {
  try {
    const { name, sourceType, content, botAgentId } = req.body
    if (!name || !sourceType || !content) return res.status(400).json({ error: 'name, sourceType, content required' })
    const doc = await ingestDocument(req.workspaceId, { name, sourceType, content, botAgentId })
    res.status(201).json(doc)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/knowledge', async (req: any, res) => {
  res.json(await listDocuments(req.workspaceId))
})

router.delete('/knowledge/:id', async (req: any, res) => {
  try {
    await deleteDocument(req.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

export default router
```

**Note:** verify how `bot.routes.ts` reads workspaceId (`req.workspaceId` vs `req.user.workspaceId`) and match it. Also raise JSON body limit for base64 PDFs: in `app.ts`, if `express.json()` has no limit, change to `express.json({ limit: '15mb' })`.

- [ ] **Step 6: Register in `app.ts`** — add `import knowledgeRoutes from './modules/knowledge/knowledge.routes'` and `app.use('/api', knowledgeRoutes)` after `analyticsRoutes`.

- [ ] **Step 7: Smoke test with curl** (backend running via `npm run dev`):

```bash
curl -X POST http://localhost:4000/api/knowledge -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"FAQ Solar","sourceType":"TEXT","content":"Los paneles solares duran 25 años y tienen garantía de 10."}'
```
Expected: 201 with document JSON; follow-up GET shows status READY.

- [ ] **Step 8: Commit** — `git add -A src/modules/knowledge src/app.ts package.json && git commit -m "feat(knowledge): document ingestion, retrieval API"`

---

### Task 6: Prompt compiler

**Files:**
- Create: `Backend/src/modules/ai-agent/promptCompiler.ts`
- Test: `Backend/src/modules/ai-agent/__tests__/promptCompiler.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { compileSystemPrompt, type AgentProfile } from '../promptCompiler'

const baseProfile: AgentProfile = {
  business: { description: 'Vendemos paneles solares residenciales', coverage: 'RM, Chile' },
  offer: [{ name: 'Kit Solar 3kW', price: 'desde $2.500.000 CLP' }],
  qualificationQuestions: [
    { key: 'monthly_kwh', question: '¿Cuánto pagas de luz al mes?' },
    { key: 'is_owner', question: '¿Eres propietario de la vivienda?' }
  ],
  objections: [{ objection: 'Es muy caro', response: 'Se paga solo en 5 años con el ahorro.' }],
  scheduling: { enabled: true, types: ['SITE_VISIT'] }
}

const agent = { name: 'Sol', tone: 'casual', promptBase: 'Sé amable.' }

describe('compileSystemPrompt', () => {
  it('includes identity, business, offer and objections', () => {
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: null, deal: null })
    expect(prompt).toContain('Sol')
    expect(prompt).toContain('casual')
    expect(prompt).toContain('paneles solares residenciales')
    expect(prompt).toContain('Kit Solar 3kW')
    expect(prompt).toContain('Es muy caro')
  })

  it('lists pending qualification questions only', () => {
    const contact = { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: { monthly_kwh: '50000' } }
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: contact as any, deal: null })
    expect(prompt).toContain('¿Eres propietario de la vivienda?')
    expect(prompt).not.toContain('¿Cuánto pagas de luz al mes?')
  })

  it('injects knowledge chunks section when present', () => {
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: ['Garantía de 10 años.'], contact: null, deal: null })
    expect(prompt).toContain('CONOCIMIENTO DEL NEGOCIO')
    expect(prompt).toContain('Garantía de 10 años.')
  })

  it('includes deal stage when deal exists', () => {
    const deal = { title: 'Kit Ana', status: 'OPEN', stage: { name: 'Cotización' } }
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: null, deal: deal as any })
    expect(prompt).toContain('Cotización')
  })

  it('works with empty profile (no wizard yet)', () => {
    const prompt = compileSystemPrompt({ agent, profile: null, knowledgeChunks: [], contact: null, deal: null })
    expect(prompt).toContain('Sol')
    expect(prompt).toContain('cerrar una venta')
  })
})
```

Run: `npx vitest run src/modules/ai-agent/__tests__/promptCompiler.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `promptCompiler.ts`**

```ts
export interface AgentProfile {
  business?: { description?: string; coverage?: string }
  offer?: { name: string; price?: string }[]
  qualificationQuestions?: { key: string; question: string }[]
  objections?: { objection: string; response: string }[]
  scheduling?: { enabled: boolean; types: string[] }
}

interface CompileInput {
  agent: { name: string; tone: string; promptBase?: string | null }
  profile: AgentProfile | null
  knowledgeChunks: string[]
  contact: {
    id: string; name: string; status: string;
    leadTemperature: string | null; leadType: string | null; leadScore: number | null;
    qualificationData: any
  } | null
  deal: { title: string; status: string; stage?: { name: string } | null } | null
}

export function compileSystemPrompt({ agent, profile, knowledgeChunks, contact, deal }: CompileInput): string {
  const sections: string[] = []

  sections.push(`Eres ${agent.name}, agente de ventas experto. Tono: ${agent.tone}.`)
  if (agent.promptBase) sections.push(`Instrucciones base: ${agent.promptBase}`)

  if (profile?.business?.description) {
    sections.push(`NEGOCIO:\n${profile.business.description}${profile.business.coverage ? `\nCobertura: ${profile.business.coverage}` : ''}`)
  }

  if (profile?.offer?.length) {
    sections.push(`OFERTA (no inventes precios fuera de esta lista):\n${profile.offer.map(o => `- ${o.name}${o.price ? `: ${o.price}` : ''}`).join('\n')}`)
  }

  if (knowledgeChunks.length) {
    sections.push(`CONOCIMIENTO DEL NEGOCIO (usa esto para responder; si no está aquí ni en la oferta, no lo afirmes):\n${knowledgeChunks.map(c => `- ${c}`).join('\n')}`)
  }

  if (contact) {
    const qualified = (contact.qualificationData ?? {}) as Record<string, unknown>
    const pending = (profile?.qualificationQuestions ?? []).filter(q => qualified[q.key] === undefined)
    sections.push(`LEAD ACTUAL:\nNombre: ${contact.name}\nStatus: ${contact.status}\nTemperatura: ${contact.leadTemperature ?? 'sin calificar'} | Tipo: ${contact.leadType ?? 'sin calificar'} | Score: ${contact.leadScore ?? '-'}`)
    if (pending.length) {
      sections.push(`PREGUNTAS DE CALIFICACIÓN PENDIENTES (obtén estas respuestas de forma natural, máximo una por mensaje, nunca como interrogatorio):\n${pending.map(q => `- [${q.key}] ${q.question}`).join('\n')}`)
    }
  }

  if (deal) {
    sections.push(`DEAL ACTIVO: "${deal.title}" en etapa "${deal.stage?.name ?? 'inicial'}". Tu trabajo es empujarlo a la siguiente etapa.`)
  }

  if (profile?.objections?.length) {
    sections.push(`MANEJO DE OBJECIONES:\n${profile.objections.map(o => `- Si dice "${o.objection}" → responde en línea con: ${o.response}`).join('\n')}`)
  }

  sections.push(`PLAYBOOK DE CIERRE (sigue las etapas en orden):
1. Saludo breve y cálido.
2. Descubrimiento: obtén las respuestas de calificación pendientes.
3. Presenta la solución adecuada de la OFERTA según sus respuestas.
4. Maneja objeciones con los argumentos dados.
5. Cierre: ${profile?.scheduling?.enabled ? 'agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots)' : 'crea o avanza el deal'} y confirma el siguiente paso.

REGLAS DURAS:
- Cada vez que obtengas una respuesta de calificación o detectes cambio de intención, llama update_qualification y tag_contact.
- No inventes precios, plazos ni garantías que no estén en OFERTA o CONOCIMIENTO.
- Si el cliente se molesta o pide un humano, usa handover_to_human.
- Sé conciso: mensajes cortos estilo WhatsApp.${!profile ? '\n- Ayuda al cliente y trata de cerrar una venta.' : ''}`)

  return sections.join('\n\n')
}
```

- [ ] **Step 3: Run test** — Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(ai): playbook system prompt compiler"`

---

### Task 7: Qualification — service function + new AI tools (handlers only)

**Files:**
- Modify: `Backend/src/modules/crm/contact.service.ts` (add `updateQualification`)
- Test: extend `Backend/src/modules/crm/__tests__/contact.service.test.ts`

- [ ] **Step 1: Write failing test** (append to existing contact.service.test.ts; add `contact: { ...existing mocks, updateMany: vi.fn() }` if needed — check the mock object at top and extend it):

```ts
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
```

Add `updateQualification` to the import list at the top of the test file.
Run: `npx vitest run src/modules/crm/__tests__/contact.service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement in `contact.service.ts`**

```ts
const TEMPERATURES = ['COLD', 'WARM', 'HOT'] as const
const LEAD_TYPES = ['CURIOUS', 'QUOTING', 'READY_TO_BUY', 'POST_SALE'] as const

export async function updateQualification(
  workspaceId: string,
  contactId: string,
  input: {
    temperature?: typeof TEMPERATURES[number]
    type?: typeof LEAD_TYPES[number]
    score?: number
    data?: Record<string, unknown>
  }
) {
  if (input.temperature && !TEMPERATURES.includes(input.temperature)) throw new Error(`Invalid temperature: ${input.temperature}`)
  if (input.type && !LEAD_TYPES.includes(input.type)) throw new Error(`Invalid lead type: ${input.type}`)
  if (input.score !== undefined && (input.score < 0 || input.score > 100)) throw new Error('Score must be 0-100')

  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const mergedData = input.data
    ? { ...((contact.qualificationData as object) ?? {}), ...input.data }
    : undefined

  return prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...(input.temperature && { leadTemperature: input.temperature }),
      ...(input.type && { leadType: input.type }),
      ...(input.score !== undefined && { leadScore: input.score }),
      ...(mergedData && { qualificationData: mergedData as any })
    }
  })
}
```

- [ ] **Step 3: Run test** — Expected: PASS (all existing contact tests too).
- [ ] **Step 4: Commit** — `git commit -am "feat(crm): lead qualification update with taxonomy validation"`

---

### Task 8: Scheduling service + routes

**Files:**
- Create: `Backend/src/modules/scheduling/scheduling.service.ts`
- Create: `Backend/src/modules/scheduling/scheduling.routes.ts`
- Modify: `Backend/src/app.ts` (register router)
- Test: `Backend/src/modules/scheduling/__tests__/scheduling.service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    availabilityRule: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() }
  }
}))

import { getAvailableSlots, scheduleAppointment } from '../scheduling.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
beforeEach(() => vi.clearAllMocks())

// Monday 2026-06-15
const MONDAY = new Date('2026-06-15T00:00:00')

describe('getAvailableSlots', () => {
  it('generates slots from rules minus existing appointments', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '11:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T09:00:00'), durationMin: 60 }
    ] as any)

    const slots = await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)
    const monday = slots.filter(s => s.getDay() === 1 && s.getDate() === 15)
    expect(monday.map(s => s.getHours())).toEqual([10]) // 09 taken, 10 free
  })

  it('returns [] with no rules', async () => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    expect(await getAvailableSlots(WS, 'SITE_VISIT', MONDAY, 7)).toEqual([])
  })
})

describe('scheduleAppointment', () => {
  beforeEach(() => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1', workspaceId: WS } as any)
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
  })

  it('creates appointment on free valid slot', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.create).mockResolvedValue({ id: 'a1' } as any)

    const appt = await scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })
    expect(appt.id).toBe('a1')
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, createdBy: 'BOT' }) })
    )
  })

  it('rejects slot outside availability', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    await expect(scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T22:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('outside availability')
  })

  it('rejects colliding slot', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T10:00:00'), durationMin: 60 }
    ] as any)
    await expect(scheduleAppointment(WS, {
      contactId: 'c1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('already taken')
  })

  it('rejects contact from another workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(scheduleAppointment(WS, {
      contactId: 'evil', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-15T10:00:00'), createdBy: 'BOT'
    })).rejects.toThrow('Contact not found')
  })
})
```

Run: `npx vitest run src/modules/scheduling/__tests__/scheduling.service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `scheduling.service.ts`**

```ts
import { prisma } from '../../lib/prisma'

function slotKey(d: Date) { return d.getTime() }

export async function getAvailableSlots(
  workspaceId: string,
  type: string,
  fromDate: Date,
  daysAhead = 7
): Promise<Date[]> {
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } })
  if (rules.length === 0) return []

  const until = new Date(fromDate)
  until.setDate(until.getDate() + daysAhead)

  const existing = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: { gte: fromDate, lt: until }
    },
    select: { scheduledAt: true, durationMin: true }
  })
  const taken = new Set(existing.map(a => slotKey(a.scheduledAt)))

  const slots: Date[] = []
  const now = new Date()
  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(fromDate)
    day.setDate(day.getDate() + d)
    for (const rule of rules.filter(r => r.dayOfWeek === day.getDay())) {
      const [sh, sm] = rule.startTime.split(':').map(Number)
      const [eh, em] = rule.endTime.split(':').map(Number)
      const cursor = new Date(day)
      cursor.setHours(sh, sm, 0, 0)
      const end = new Date(day)
      end.setHours(eh, em, 0, 0)
      while (cursor.getTime() + rule.slotMinutes * 60_000 <= end.getTime()) {
        if (cursor > now && !taken.has(slotKey(cursor))) slots.push(new Date(cursor))
        cursor.setMinutes(cursor.getMinutes() + rule.slotMinutes)
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime())
}

export async function scheduleAppointment(
  workspaceId: string,
  input: { contactId: string; type: string; scheduledAt: Date; dealId?: string; createdBy: string; notes?: string }
) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: input.type } })
  const day = input.scheduledAt.getDay()
  const minutes = input.scheduledAt.getHours() * 60 + input.scheduledAt.getMinutes()
  const inWindow = rules.some(r => {
    if (r.dayOfWeek !== day) return false
    const [sh, sm] = r.startTime.split(':').map(Number)
    const [eh, em] = r.endTime.split(':').map(Number)
    return minutes >= sh * 60 + sm && minutes + r.slotMinutes <= eh * 60 + em
  })
  if (!inWindow) throw new Error('Requested time is outside availability')

  const dayStart = new Date(input.scheduledAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  const sameDay = await prisma.appointment.findMany({
    where: { workspaceId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, scheduledAt: { gte: dayStart, lt: dayEnd } },
    select: { scheduledAt: true, durationMin: true }
  })
  const requested = input.scheduledAt.getTime()
  const duration = (rules.find(r => r.dayOfWeek === day)?.slotMinutes ?? 60) * 60_000
  const collision = sameDay.some(a => {
    const start = a.scheduledAt.getTime()
    return requested < start + a.durationMin * 60_000 && start < requested + duration
  })
  if (collision) throw new Error('Slot already taken')

  return prisma.appointment.create({
    data: {
      workspaceId,
      contactId: contact.id,
      dealId: input.dealId ?? null,
      type: input.type,
      scheduledAt: input.scheduledAt,
      durationMin: duration / 60_000,
      createdBy: input.createdBy,
      notes: input.notes ?? null
    }
  })
}

export async function listAppointments(workspaceId: string, from?: Date, to?: Date) {
  return prisma.appointment.findMany({
    where: { workspaceId, ...(from || to ? { scheduledAt: { ...(from && { gte: from }), ...(to && { lt: to }) } } : {}) },
    include: { contact: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: 'asc' }
  })
}

export async function updateAppointmentStatus(workspaceId: string, id: string, status: string) {
  const valid = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
  if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`)
  const appt = await prisma.appointment.findFirst({ where: { id, workspaceId } })
  if (!appt) throw new Error('Appointment not found')
  return prisma.appointment.update({ where: { id: appt.id }, data: { status } })
}
```

- [ ] **Step 3: Run test** — Expected: PASS.

- [ ] **Step 4: Write `scheduling.routes.ts`** (same auth pattern as Task 5):

```ts
import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import { getAvailableSlots, listAppointments, scheduleAppointment, updateAppointmentStatus } from './scheduling.service'

const router = Router()
router.use('/appointments', authenticate)
router.use('/availability', authenticate)

router.get('/appointments', async (req: any, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined
  const to = req.query.to ? new Date(String(req.query.to)) : undefined
  res.json(await listAppointments(req.workspaceId, from, to))
})

router.post('/appointments', async (req: any, res) => {
  try {
    const { contactId, type, scheduledAt, dealId, notes } = req.body
    const appt = await scheduleAppointment(req.workspaceId, {
      contactId, type, scheduledAt: new Date(scheduledAt), dealId, notes, createdBy: req.userId ?? 'USER'
    })
    res.status(201).json(appt)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/appointments/:id/status', async (req: any, res) => {
  try {
    res.json(await updateAppointmentStatus(req.workspaceId, req.params.id, req.body.status))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/availability/slots', async (req: any, res) => {
  const type = String(req.query.type || 'SITE_VISIT')
  const slots = await getAvailableSlots(req.workspaceId, type, new Date(), 14)
  res.json(slots)
})

// CRUD for availability rules
router.get('/availability/rules', async (req: any, res) => {
  const { prisma } = await import('../../lib/prisma')
  res.json(await prisma.availabilityRule.findMany({ where: { workspaceId: req.workspaceId } }))
})
router.post('/availability/rules', async (req: any, res) => {
  const { prisma } = await import('../../lib/prisma')
  const { dayOfWeek, startTime, endTime, slotMinutes, apptType } = req.body
  res.status(201).json(await prisma.availabilityRule.create({
    data: { workspaceId: req.workspaceId, dayOfWeek, startTime, endTime, slotMinutes: slotMinutes ?? 60, apptType: apptType ?? 'SITE_VISIT' }
  }))
})
router.delete('/availability/rules/:id', async (req: any, res) => {
  const { prisma } = await import('../../lib/prisma')
  await prisma.availabilityRule.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } })
  res.json({ ok: true })
})

export default router
```

- [ ] **Step 5: Register in `app.ts`** — `import schedulingRoutes from './modules/scheduling/scheduling.routes'` + `app.use('/api', schedulingRoutes)`.

- [ ] **Step 6: Commit** — `git add -A src/modules/scheduling src/app.ts && git commit -m "feat(scheduling): internal availability rules and appointments"`

---

### Task 9: Follow-up engine (replaces nurturing)

**Files:**
- Create: `Backend/src/modules/ai-agent/followup.service.ts`
- Create: `Backend/src/modules/ai-agent/followup.cron.ts`
- Modify: `Backend/src/modules/messaging/message.service.ts` (cancel jobs on inbound; schedule after bot outbound)
- Modify: wherever `startNurturingCron()` is called (grep `startNurturingCron` — likely `Backend/src/index.ts`): replace with `startFollowUpCron()`.
- Test: `Backend/src/modules/ai-agent/__tests__/followup.service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    followUpRule: { findMany: vi.fn() },
    followUpJob: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    botAgent: { findFirst: vi.fn() }
  }
}))
vi.mock('../ai.service', () => ({ processAiResponse: vi.fn() }))
vi.mock('../../bot/businessHours.service', () => ({ isOutsideBusinessHours: vi.fn(() => false), getBusinessHours: vi.fn(async () => null) }))
vi.mock('../../messaging/message.service', () => ({ sendOutboundPlatformMessage: vi.fn() }))

import { scheduleNextFollowUp, cancelPendingFollowUps, processDueFollowUps } from '../followup.service'
import { prisma } from '../../../lib/prisma'
import { processAiResponse } from '../ai.service'

const WS = 'ws-1'
const CONV = 'conv-1'
beforeEach(() => vi.clearAllMocks())

describe('scheduleNextFollowUp', () => {
  it('creates job for first active rule when none sent yet', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([
      { id: 'r1', delayHours: 4, order: 0, isActive: true },
      { id: 'r2', delayHours: 24, order: 1, isActive: true }
    ] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(0) // 0 SENT so far

    await scheduleNextFollowUp(WS, CONV, 'bot-1')

    expect(prisma.followUpJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r1', workspaceId: WS, conversationId: CONV }) })
    )
  })

  it('schedules second rule after one follow-up already sent', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([
      { id: 'r1', delayHours: 4, order: 0, isActive: true },
      { id: 'r2', delayHours: 24, order: 1, isActive: true }
    ] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(1)

    await scheduleNextFollowUp(WS, CONV, 'bot-1')
    expect(prisma.followUpJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r2' }) })
    )
  })

  it('does nothing when sequence exhausted', async () => {
    vi.mocked(prisma.followUpRule.findMany).mockResolvedValue([{ id: 'r1', delayHours: 4, order: 0, isActive: true }] as any)
    vi.mocked(prisma.followUpJob.count).mockResolvedValue(1)
    await scheduleNextFollowUp(WS, CONV, 'bot-1')
    expect(prisma.followUpJob.create).not.toHaveBeenCalled()
  })
})

describe('cancelPendingFollowUps', () => {
  it('cancels all PENDING jobs for the conversation', async () => {
    await cancelPendingFollowUps(CONV)
    expect(prisma.followUpJob.updateMany).toHaveBeenCalledWith({
      where: { conversationId: CONV, status: 'PENDING' },
      data: { status: 'CANCELLED' }
    })
  })
})

describe('processDueFollowUps', () => {
  it('claims job (PENDING→SENT conditional) before dispatching', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([
      { id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }
    ] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: CONV, workspaceId: WS, isHandledByBot: true, status: 'OPEN',
      channel: { platform: 'WHATSAPP', config: {} }, externalId: '569...', assignedToBotId: 'bot-1'
    } as any)
    vi.mocked(processAiResponse).mockResolvedValue('¡Hola! ¿Seguimos con tu cotización solar?')

    await processDueFollowUps()

    expect(prisma.followUpJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'j1', status: 'PENDING' }) })
    )
    expect(processAiResponse).toHaveBeenCalled()
  })

  it('skips job claimed by another worker (count 0)', async () => {
    vi.mocked(prisma.followUpJob.findMany).mockResolvedValue([{ id: 'j1', workspaceId: WS, conversationId: CONV, ruleId: 'r1' }] as any)
    vi.mocked(prisma.followUpJob.updateMany).mockResolvedValue({ count: 0 } as any)
    await processDueFollowUps()
    expect(processAiResponse).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/modules/ai-agent/__tests__/followup.service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Refactor — export a reusable outbound sender from `message.service.ts`.** The internal `sendPlatformMessage(platform, config, to, text)` already exists at `message.service.ts:20`. Export a wrapper that also persists + broadcasts:

```ts
export async function sendOutboundPlatformMessage(
  workspaceId: string,
  conversationId: string,
  text: string,
  senderType: 'BOT' | 'AGENT' = 'BOT'
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: { channel: true }
  })
  if (!conv) throw new Error('Conversation not found')

  await sendPlatformMessage(conv.channel.platform, conv.channel.config, conv.externalId, text)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType, content: text, status: 'SENT' }
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    conversationId, direction: 'OUTBOUND', senderType, content: text, sentAt: message.sentAt
  })
  return message
}
```

- [ ] **Step 3: Implement `followup.service.ts`**

```ts
import { prisma } from '../../lib/prisma'
import { processAiResponse } from './ai.service'
import { sendOutboundPlatformMessage } from '../messaging/message.service'

/** Called after the bot sends an outbound message. Schedules the next follow-up in the sequence. */
export async function scheduleNextFollowUp(workspaceId: string, conversationId: string, botAgentId: string) {
  const rules = await prisma.followUpRule.findMany({
    where: { workspaceId, botAgentId, isActive: true },
    orderBy: { order: 'asc' }
  })
  if (rules.length === 0) return

  const sentCount = await prisma.followUpJob.count({
    where: { conversationId, status: 'SENT' }
  })
  const nextRule = rules[sentCount]
  if (!nextRule) return // sequence exhausted

  // avoid duplicate pending job
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED' }
  })

  const scheduledAt = new Date(Date.now() + nextRule.delayHours * 3600_000)
  await prisma.followUpJob.create({
    data: { workspaceId, conversationId, ruleId: nextRule.id, scheduledAt }
  })
}

/** Called on every inbound message: the contact replied, stop the sequence. */
export async function cancelPendingFollowUps(conversationId: string) {
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED' }
  })
}

/** Cron worker: send due follow-ups. */
export async function processDueFollowUps() {
  const due = await prisma.followUpJob.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
    take: 50
  })

  for (const job of due) {
    // claim: conditional update guards against double-send on overlapping cron runs
    const claimed = await prisma.followUpJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() }
    })
    if (claimed.count === 0) continue

    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: job.conversationId },
        include: { channel: true }
      })
      if (!conv || conv.status !== 'OPEN' || !conv.isHandledByBot) continue

      const followUpInstruction =
        'SISTEMA: El cliente no ha respondido. Escribe UN mensaje breve y natural de seguimiento para retomar la conversación según el contexto e intentar avanzar al cierre. No repitas saludos completos ni seas invasivo.'

      const text = await processAiResponse(job.workspaceId, job.conversationId, followUpInstruction)
      if (!text) continue

      await sendOutboundPlatformMessage(job.workspaceId, job.conversationId, text, 'BOT')

      if (conv.assignedToBotId) {
        await scheduleNextFollowUp(job.workspaceId, job.conversationId, conv.assignedToBotId)
      }
    } catch (err) {
      console.error(`[FollowUp] Failed job ${job.id}:`, err)
    }
  }
}
```

**Note on business hours:** `processDueFollowUps` must skip sending outside business hours — after claiming, check with the existing `businessHours.service` helpers (read `Backend/src/modules/bot/businessHours.service.ts` for the exact signature of `isOutsideBusinessHours` and how flows fetch the workspace's business hours config; if outside hours, re-schedule the job: set status back to PENDING with `scheduledAt` +2h instead of sending).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Write `followup.cron.ts`**

```ts
import cron from 'node-cron'
import { processDueFollowUps } from './followup.service'

export function startFollowUpCron(): void {
  cron.schedule('*/15 * * * *', () => {
    processDueFollowUps().catch(err => console.error('[Cron: FollowUp] Unhandled error:', err))
  })
  console.log('[FollowUpCron] Scheduled every 15 minutes')
}
```

- [ ] **Step 6: Wire into message flow.** In `message.service.ts` `processInboundMessage`:
  - Right after persisting the inbound message (before AI handling): `await cancelPendingFollowUps(conversation.id)` (import from `../ai-agent/followup.service` — beware circular import: followup.service imports message.service; use a dynamic `await import()` in one direction if tsup complains, prefer dynamic import inside `processDueFollowUps`).
  - After a successful AI response send (inside the `if (aiResponse)` block at `message.service.ts:128-143`): look up active bot (`conversation.assignedToBotId` or the same `findFirst` ai.service uses) and `await scheduleNextFollowUp(workspaceId, conversation.id, botId)`.

- [ ] **Step 7: Replace nurturing cron.** Grep `startNurturingCron` (likely in `Backend/src/index.ts`), replace the import + call with `startFollowUpCron` from `./modules/ai-agent/followup.cron`. Delete `nurturing.cron.ts` and `nurturing.service.ts`.

- [ ] **Step 8: Run full backend tests** — `npm test` — Expected: all green.

- [ ] **Step 9: Add FollowUpRule CRUD routes.** In `Backend/src/modules/bot/bot.routes.ts` (same gating), add:

```ts
// GET /api/bots/:botId/followup-rules
// POST /api/bots/:botId/followup-rules  { delayHours, order }
// DELETE /api/bots/:botId/followup-rules/:ruleId
```

Implementation: direct prisma calls scoped to `workspaceId` + verify the bot belongs to the workspace first (`prisma.botAgent.findFirst({ where: { id: botId, workspaceId } })`, 404 if null).

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(ai): configurable AI follow-up sequences replacing nurturing cron"`

---

### Task 10: Rewire ai.service — provider + compiler + RAG + new tools

**Files:**
- Modify: `Backend/src/modules/ai-agent/ai.service.ts` (full rewrite of `processAiResponse` + tools list + `handleToolCall`)
- Test: `Backend/src/modules/ai-agent/__tests__/ai.service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    botAgent: { findFirst: vi.fn() },
    product: { findMany: vi.fn(async () => []) },
    deal: { findFirst: vi.fn(async () => null), update: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    pipelineStage: { findMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() }
  }
}))
const chatMock = vi.fn()
vi.mock('../providers/provider.factory', () => ({
  getProvider: vi.fn(() => ({ chat: chatMock, embed: vi.fn(async () => [[0.1]]) }))
}))
vi.mock('../../knowledge/retrieval.service', () => ({
  retrieveRelevantChunks: vi.fn(async () => [{ content: 'Garantía 10 años', score: 0.9 }])
}))
vi.mock('../../crm/contact.service', () => ({
  updateContact: vi.fn(),
  updateQualification: vi.fn(),
  addTag: vi.fn()
}))
vi.mock('../../scheduling/scheduling.service', () => ({
  getAvailableSlots: vi.fn(async () => [new Date('2026-06-15T10:00:00')]),
  scheduleAppointment: vi.fn(async () => ({ id: 'a1', scheduledAt: new Date('2026-06-15T10:00:00') }))
}))
vi.mock('../../crm/pipeline.service', () => ({ createDeal: vi.fn() }))

import { processAiResponse } from '../ai.service'
import { prisma } from '../../../lib/prisma'
import { updateQualification, addTag } from '../../crm/contact.service'
import { scheduleAppointment } from '../../scheduling/scheduling.service'

const WS = 'ws-1'
const CONV = 'conv-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
    id: CONV, workspaceId: WS, isHandledByBot: true,
    contact: { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: null },
    messages: [{ senderType: 'CONTACT', content: 'Hola' }],
    channel: { platform: 'WHATSAPP' }
  } as any)
  vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({
    id: 'bot-1', name: 'Sol', tone: 'casual', promptBase: null, provider: 'gemini', config: { profile: null }
  } as any)
})

describe('processAiResponse (rewired)', () => {
  it('returns plain text response and includes RAG chunks in system prompt', async () => {
    chatMock.mockResolvedValue({ text: '¡Hola Ana!', toolCalls: [], submitToolResults: vi.fn() })
    const result = await processAiResponse(WS, CONV, 'Hola')
    expect(result).toBe('¡Hola Ana!')
    const system = chatMock.mock.calls[0][0].system
    expect(system).toContain('Garantía 10 años')
  })

  it('executes update_qualification tool call and returns final text', async () => {
    const submit = vi.fn(async () => ({ text: 'Listo, te tengo calificada.', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'update_qualification', args: { contactId: 'c1', temperature: 'HOT', type: 'READY_TO_BUY', score: 85 } }],
      submitToolResults: submit
    })
    const result = await processAiResponse(WS, CONV, 'Quiero comprar ya')
    expect(updateQualification).toHaveBeenCalledWith(WS, 'c1', expect.objectContaining({ temperature: 'HOT' }))
    expect(result).toBe('Listo, te tengo calificada.')
  })

  it('executes tag_contact tool', async () => {
    const submit = vi.fn(async () => ({ text: 'ok', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'tag_contact', args: { contactId: 'c1', name: 'lead-caliente' } }],
      submitToolResults: submit
    })
    await processAiResponse(WS, CONV, 'x')
    expect(addTag).toHaveBeenCalledWith(WS, 'c1', 'lead-caliente', expect.anything())
  })

  it('executes schedule_appointment tool', async () => {
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    const result = await processAiResponse(WS, CONV, 'el lunes a las 10')
    expect(scheduleAppointment).toHaveBeenCalled()
    expect(result).toBe('Agendado')
  })

  it('returns null when conversation not handled by bot', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: CONV, isHandledByBot: false } as any)
    expect(await processAiResponse(WS, CONV, 'x')).toBeNull()
  })
})
```

Run: `npx vitest run src/modules/ai-agent/__tests__/ai.service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Rewrite `ai.service.ts`.** Keep the 5 existing tools and their handler cases (`qualify_lead`, `create_deal`, `move_deal`, `handover_to_human`, `search_catalog`) and `logAiAction` exactly as they are today (`ai.service.ts:163-251`). Changes:

1. **Imports:** drop direct `GoogleGenerativeAI` usage; add:
```ts
import { getProvider } from './providers/provider.factory'
import { compileSystemPrompt, type AgentProfile } from './promptCompiler'
import { retrieveRelevantChunks } from '../knowledge/retrieval.service'
import { updateQualification, addTag, updateContact } from '../crm/contact.service'
import { getAvailableSlots, scheduleAppointment } from '../scheduling/scheduling.service'
```

2. **Tools list:** keep the 5 declarations (same `SchemaType` shapes, import `SchemaType` from `@google/generative-ai` still fine) and append 4 new declarations:

```ts
{
  name: 'update_qualification',
  description: 'Records lead qualification: temperature (COLD/WARM/HOT), type (CURIOUS/QUOTING/READY_TO_BUY/POST_SALE), score 0-100, and answers to qualification questions as data {key: answer}. Call whenever you learn a qualification answer or intent changes.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      contactId: { type: SchemaType.STRING },
      temperature: { type: SchemaType.STRING, description: 'COLD | WARM | HOT' },
      type: { type: SchemaType.STRING, description: 'CURIOUS | QUOTING | READY_TO_BUY | POST_SALE' },
      score: { type: SchemaType.NUMBER, description: '0-100' },
      data: { type: SchemaType.OBJECT, description: 'Answers keyed by qualification question key' }
    },
    required: ['contactId']
  }
},
{
  name: 'tag_contact',
  description: 'Adds a tag to the contact for CRM segmentation (e.g. "lead-caliente", "financiamiento", "postventa").',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      contactId: { type: SchemaType.STRING },
      name: { type: SchemaType.STRING },
      color: { type: SchemaType.STRING, description: 'Optional hex color' }
    },
    required: ['contactId', 'name']
  }
},
{
  name: 'get_available_slots',
  description: 'Returns the next available appointment slots. Use BEFORE offering times to the customer.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: { type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' } },
    required: ['type']
  }
},
{
  name: 'schedule_appointment',
  description: 'Books an appointment at a confirmed time. Only use times returned by get_available_slots.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      contactId: { type: SchemaType.STRING },
      isoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime' },
      type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' }
    },
    required: ['contactId', 'isoDateTime', 'type']
  }
}
```

3. **`processAiResponse` body:**

```ts
export async function processAiResponse(
  workspaceId: string,
  conversationId: string,
  userContent: string
): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      messages: { orderBy: { sentAt: 'asc' }, take: 10 },
      channel: { select: { platform: true } }
    }
  })
  if (!conversation || !conversation.isHandledByBot) return null

  const agent = await prisma.botAgent.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' }
  })
  if (!agent) return null

  const profile = ((agent as any).config?.profile ?? null) as AgentProfile | null
  const knowledge = await retrieveRelevantChunks(workspaceId, userContent).catch(() => [])

  const deal = conversation.contact
    ? await prisma.deal.findFirst({
        where: { contactId: conversation.contact.id, workspaceId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        include: { stage: true } as any
      })
    : null

  const system = compileSystemPrompt({
    agent: { name: agent.name, tone: agent.tone, promptBase: agent.promptBase },
    profile,
    knowledgeChunks: knowledge.map(k => k.content),
    contact: conversation.contact as any,
    deal: deal as any
  })

  const history = conversation.messages
    .filter(m => !m.isInternal)
    .map(m => ({ role: m.senderType === 'CONTACT' ? 'user' as const : 'assistant' as const, content: m.content }))

  const provider = getProvider(agent.provider)
  let result = await provider.chat({
    system,
    messages: [...history, { role: 'user', content: userContent }],
    tools: toolDeclarations
  })

  // tool loop (max 5 rounds to avoid infinite loops)
  let rounds = 0
  while (result.toolCalls.length > 0 && rounds < 5) {
    const responses = []
    for (const call of result.toolCalls) {
      const toolResult = await handleToolCall(workspaceId, conversationId, call)
      responses.push({ name: call.name, response: toolResult })
    }
    result = await result.submitToolResults(responses)
    rounds++
  }
  return result.text
}
```

(`toolDeclarations` = the flat array of all 9 function declarations; the Gemini provider wraps it in `[{ functionDeclarations }]`.)

4. **`handleToolCall` new cases** (insert before `default`):

```ts
case 'update_qualification':
  await updateQualification(workspaceId, args.contactId, {
    temperature: args.temperature, type: args.type, score: args.score, data: args.data
  })
  await logAiAction(workspaceId, conversationId, `Calificó al lead: ${args.temperature ?? ''} ${args.type ?? ''} score=${args.score ?? '-'}`)
  return { success: true }

case 'tag_contact':
  await addTag(workspaceId, args.contactId, args.name, args.color ?? '#f59e0b')
  await logAiAction(workspaceId, conversationId, `Etiquetó al contacto: ${args.name}`)
  return { success: true }

case 'get_available_slots': {
  const slots = await getAvailableSlots(workspaceId, args.type ?? 'SITE_VISIT', new Date(), 14)
  return { slots: slots.slice(0, 6).map(s => s.toISOString()) }
}

case 'schedule_appointment': {
  const appt = await scheduleAppointment(workspaceId, {
    contactId: args.contactId,
    type: args.type ?? 'SITE_VISIT',
    scheduledAt: new Date(args.isoDateTime),
    createdBy: 'BOT'
  })
  await logAiAction(workspaceId, conversationId, `Agendó cita ${args.type} para ${args.isoDateTime}`)
  return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt }
}
```

**Check `addTag` signature in `contact.service.ts` first** (test mock shows `contactTag.upsert`) and call it with its real parameter order.

- [ ] **Step 3: Run test** — `npx vitest run src/modules/ai-agent/__tests__/ai.service.test.ts` — Expected: PASS.
- [ ] **Step 4: Run full suite** — `npm test` — Expected: all green (fix any breakage in message.service tests from the new export).
- [ ] **Step 5: Commit** — `git commit -am "feat(ai): rewire agent through provider + playbook compiler + RAG + qualification/scheduling tools"`

---

### Task 11: Solar template + apply endpoint

**Files:**
- Create: `Backend/src/modules/bot/templates/solar.template.ts`
- Modify: `Backend/src/modules/bot/bot.routes.ts` (POST `/bots/:botId/apply-template`)
- Test: extend `Backend/src/modules/bot/__tests__/bot.service.test.ts` or new route test

- [ ] **Step 1: Write `solar.template.ts`**

```ts
import type { AgentProfile } from '../../ai-agent/promptCompiler'

export const SOLAR_TEMPLATE: AgentProfile = {
  business: {
    description: 'Empresa de instalación de paneles solares residenciales y comerciales. Reducimos la cuenta de luz hasta un 90% con energía limpia.',
    coverage: ''
  },
  offer: [
    { name: 'Kit Solar Residencial 3kW (casa pequeña, cuenta < $80.000)', price: '' },
    { name: 'Kit Solar Residencial 5kW (casa mediana, cuenta $80.000-$150.000)', price: '' },
    { name: 'Kit Solar 10kW+ (casa grande o comercio)', price: 'cotización personalizada' }
  ],
  qualificationQuestions: [
    { key: 'monthly_bill', question: '¿Cuánto pagas aproximadamente de luz al mes?' },
    { key: 'property_type', question: '¿Es casa o departamento? ¿Cómo es el techo (losa, teja, zinc)?' },
    { key: 'is_owner', question: '¿Eres propietario/a de la vivienda?' },
    { key: 'location', question: '¿En qué comuna o ciudad está la propiedad?' },
    { key: 'financing', question: '¿Te interesa pagar al contado o con financiamiento?' }
  ],
  objections: [
    { objection: 'Es muy caro', response: 'La inversión se recupera en 4-6 años con el ahorro en la cuenta de luz, y los paneles duran más de 25 años. Además hay opciones de financiamiento desde cuotas mensuales similares a lo que hoy pagas de luz.' },
    { objection: 'No sé si mi techo sirve', response: 'Por eso la visita técnica es gratis y sin compromiso: un experto evalúa orientación, sombras y estructura, y te entrega una propuesta exacta.' },
    { objection: 'Lo voy a pensar', response: 'Perfecto. Mientras lo piensas, ¿te parece que agendemos la evaluación gratuita? No te compromete a nada y tendrás números reales para decidir.' },
    { objection: '¿Qué pasa si se echan a perder?', response: 'Los paneles tienen garantía de fabricante de 10-12 años y garantía de generación de 25 años. La instalación también queda garantizada.' }
  ],
  scheduling: { enabled: true, types: ['SITE_VISIT'] }
}
```

- [ ] **Step 2: Add route** in `bot.routes.ts`:

```ts
router.post('/bots/:botId/apply-template', async (req: any, res) => {
  const { template } = req.body // 'solar'
  const bot = await prisma.botAgent.findFirst({ where: { id: req.params.botId, workspaceId: req.workspaceId } })
  if (!bot) return res.status(404).json({ error: 'Bot not found' })
  if (template !== 'solar') return res.status(400).json({ error: 'Unknown template' })

  const { SOLAR_TEMPLATE } = await import('./templates/solar.template')
  const config = { ...((bot as any).config ?? {}), profile: SOLAR_TEMPLATE }
  const updated = await prisma.botAgent.update({ where: { id: bot.id }, data: { config } as any })
  res.json(updated)
})
```

**Schema check:** `BotAgent` has NO `config` column in current schema (memory said it does; schema shows only promptBase/provider/tone). If missing, add to Task 1: `config Json @default("{}")` on `model BotAgent`. Verify before db:push.

- [ ] **Step 3: curl smoke test** — apply template, then send WhatsApp message to a test conversation, verify agent asks solar qualification questions.
- [ ] **Step 4: Commit** — `git commit -am "feat(bot): solar panel vertical template"`

---

### Task 12: Frontend — wizard "Programa tu agente"

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/setup/page.tsx`
- Create: `metria-metrics/Frontend/src/components/bots/AgentSetupWizard.tsx`

**Pre-step:** Read `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/page.tsx` and its `BotDetailClient` component to copy: fetchAPI usage, Metadata export pattern, shadcn imports, Mounted pattern. The wizard must visually match.

- [ ] **Step 1: `page.tsx`** (server component, follows project Metadata rule):

```tsx
import type { Metadata } from 'next'
import { AgentSetupWizard } from '@/components/bots/AgentSetupWizard'

export const metadata: Metadata = {
  title: 'Programa tu Agente | Metria',
  description: 'Configura tu agente de cierre de ventas con IA'
}

export default async function AgentSetupPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params
  return <AgentSetupWizard botId={botId} />
}
```

- [ ] **Step 2: `AgentSetupWizard.tsx`** — client component, 7 steps in state machine (`useState<number>` step index). Steps: Negocio → Oferta → Calificación → Objeciones → Agendamiento → Persona → Documentos. Each step edits a slice of a local `profile` object matching `AgentProfile`. Buttons: "Usar plantilla Paneles Solares" (calls `POST /bots/{botId}/apply-template`, then loads returned profile into state), Atrás/Siguiente, and final "Guardar y activar" → `PUT /bots/{botId}` with `{ config: { profile } }` (verify the existing bot update endpoint accepts `config`; if not, add it in `bot.routes.ts`/`bot.service.ts`). Documents step: textarea for plain text + file input for PDF → base64 → `POST /knowledge` with `botAgentId`; list existing docs (`GET /knowledge`) with status badges and delete. Availability step: weekly grid (day, start, end) → `POST /availability/rules`. Use shadcn `Card`, `Button`, `Input`, `Textarea`, `Badge`; Mounted pattern; loading/empty/error/success(toast) states per audit.md.

- [ ] **Step 3: Manual verification** — `pnpm dev`, complete wizard with solar template, confirm: profile persisted (GET bot), doc READY, rules created.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(frontend): agent setup wizard with solar template"`

---

### Task 13: Frontend — qualification badges + filters

**Files:**
- Create: `metria-metrics/Frontend/src/components/crm/LeadQualificationBadge.tsx`
- Modify: inbox `ConversationList` / `ContactPanel` components and CRM contact list (read them first; locate where `contact.status` renders and add badges beside it)

- [ ] **Step 1: `LeadQualificationBadge.tsx`**

```tsx
import { Badge } from '@/components/ui/badge'

const TEMP_STYLES: Record<string, string> = {
  HOT: 'bg-red-500/15 text-red-500 border-red-500/30',
  WARM: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  COLD: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
}
const TEMP_LABELS: Record<string, string> = { HOT: '🔥 Caliente', WARM: 'Tibio', COLD: 'Frío' }
const TYPE_LABELS: Record<string, string> = {
  CURIOUS: 'Curioso', QUOTING: 'Cotizando', READY_TO_BUY: 'Listo para comprar', POST_SALE: 'Postventa'
}

export function LeadQualificationBadge({
  temperature, type, score
}: { temperature?: string | null; type?: string | null; score?: number | null }) {
  if (!temperature && !type && score == null) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {temperature && <Badge variant="outline" className={TEMP_STYLES[temperature] ?? ''}>{TEMP_LABELS[temperature] ?? temperature}</Badge>}
      {type && <Badge variant="outline">{TYPE_LABELS[type] ?? type}</Badge>}
      {score != null && <Badge variant="secondary">{score}/100</Badge>}
    </div>
  )
}
```

- [ ] **Step 2: Integrate** into ContactPanel (inbox) + contact profile page + CRM contacts table. Backend: confirm contact list/get endpoints return the new fields (Prisma returns them automatically unless `select` is used — check `listContacts` in `contact.service.ts` and add fields to `select` if present).
- [ ] **Step 3: Filters** — add temperature/type filter dropdowns to CRM contact list; backend `listContacts` gains optional `leadTemperature`/`leadType` filter params (one small backend edit + test).
- [ ] **Step 4: Commit** — `git commit -am "feat(frontend): lead qualification badges and CRM filters"`

---

### Task 14: Frontend — appointments view + follow-up rules settings

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/appointments/page.tsx` (+ `AppointmentsClient.tsx` component)
- Modify: bot detail page — add "Follow-ups" section

- [ ] **Step 1: Appointments page** — Metadata export + client component: fetch `GET /appointments?from=&to=`, group by date, card list with contact name/phone, type, time; status dropdown calling `PATCH /appointments/:id/status`. Loading skeleton + empty state ("Sin citas agendadas") + error state + toast on update.
- [ ] **Step 2: Follow-up rules UI** — in bot detail: list `GET /bots/:botId/followup-rules`, add rule (delayHours number input + add button), delete rule. Show sequence order.
- [ ] **Step 3: Sidebar** — add "Citas" link to dashboard sidebar where CRM links live (read sidebar component to find the nav array).
- [ ] **Step 4: Manual E2E** — full flow: wizard → WhatsApp inbound (or simulated via existing test route) → agent qualifies + tags → offers slots → books appointment → appointment visible → no reply → follow-up job created.
- [ ] **Step 5: Run frontend lint/tests** — `pnpm lint && pnpm test` — Expected: green.
- [ ] **Step 6: Commit** — `git commit -am "feat(frontend): appointments view and follow-up sequence settings"`

---

## Verification checklist (success criteria from spec)

1. Wizard + solar template → agent answers with business knowledge over WhatsApp. ✅ Task 12/11
2. Auto temperature/type/score visible in inbox + CRM. ✅ Task 7/10/13
3. Agent books valid appointment against configured availability. ✅ Task 8/10/14
4. Idle lead receives contextual follow-up within cadence, business hours respected. ✅ Task 9
5. `npm test` green (89 legacy + new). ✅ every task

## Known risks

- `BotAgent.config` column may not exist in schema (verify in Task 1; add if missing).
- `channel.isAiEnabled` referenced in message.service but not visible in Channel model — confirm where it comes from before relying on it.
- Circular import message.service ↔ followup.service: break with dynamic import.
- Gemini embedding quota: ingest batches sequentially; on 429, mark doc ERROR (already handled).
