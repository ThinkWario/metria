# Messaging + CRM — Phase 3: CRM Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CRM backend (contacts, pipelines/deals, tickets) and four frontend pages (contacts list, contact 360° profile, pipeline Kanban, tickets list).

**Architecture:** A new `Backend/src/modules/crm/` module with three focused services — `contact.service.ts`, `pipeline.service.ts`, `ticket.service.ts` — wired through a single controller and router, mounted at `/api/crm/*`. All endpoints are behind `authenticate + requirePlan('PRO', 'SCALE')`. All Prisma models already exist in `schema.prisma` from Phase 1. The frontend is four new pages under `app/dashboard/crm/`.

**Tech Stack:** Express 4, Prisma 5 (PostgreSQL), Vitest, Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn/ui tokens

**Spec reference:** `docs/superpowers/specs/2026-05-09-messaging-crm-design.md` (sections 4, 9, 11)

**Prerequisite:** Phase 1 + Phase 2 complete — all Prisma models migrated, `planGate.ts` middleware exists, `authenticate` middleware sets `req.user` and `req.workspace`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `Backend/src/modules/crm/contact.service.ts` | Contact CRUD + tags + notes + health score |
| Create | `Backend/src/modules/crm/__tests__/contact.service.test.ts` | Tests |
| Create | `Backend/src/modules/crm/pipeline.service.ts` | Pipeline + stage + deal CRUD |
| Create | `Backend/src/modules/crm/__tests__/pipeline.service.test.ts` | Tests |
| Create | `Backend/src/modules/crm/ticket.service.ts` | Ticket CRUD + SLA deadline |
| Create | `Backend/src/modules/crm/__tests__/ticket.service.test.ts` | Tests |
| Create | `Backend/src/modules/crm/crm.controller.ts` | Express handlers for all CRM routes |
| Create | `Backend/src/modules/crm/crm.routes.ts` | Route registration |
| Modify | `Backend/src/app.ts` | Mount CRM routes at `/api` |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/page.tsx` | Server Component shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/CrmContactsClient.tsx` | Contacts list with search/filter |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/page.tsx` | Server Component shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx` | 360° profile (5 tabs) |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/page.tsx` | Server Component shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/PipelinesClient.tsx` | Kanban board |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/tickets/page.tsx` | Server Component shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/crm/tickets/TicketsClient.tsx` | Tickets table |

---

## Task 1: contact.service.ts

**Files:**
- Create: `Backend/src/modules/crm/contact.service.ts`
- Create: `Backend/src/modules/crm/__tests__/contact.service.test.ts`

### Context

`contact.service.ts` owns all contact-related business logic: listing with search/filter, full 360° fetch, status updates, notes, tags, and health score calculation. All functions take `workspaceId` as first argument for multi-tenancy.

Prisma types to know:
- `Contact.ltv` is `Prisma.Decimal` — convert with `Number()` for arithmetic.
- `ContactTag` has `@@unique([contactId, name])` → upsert key is `contactId_name: { contactId, name }`.
- `ContactNote` relation name on Contact is `contactNotes` (not `notes`).
- `ContactHealthScore` relation name on Contact is `healthScores`.

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/crm/__tests__/contact.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contactNote: { create: vi.fn() },
    contactTag: { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    contactHealthScore: { create: vi.fn() }
  }
}))

import { listContacts, getContact, updateContact, addNote, addTag, removeTag, calculateHealthScore } from '../contact.service'
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
    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: CONTACT_ID }, data: { status: 'CUSTOMER' } })
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/crm/__tests__/contact.service.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../contact.service'`

- [ ] **Step 3: Create contact.service.ts**

Create `Backend/src/modules/crm/contact.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'

export interface ListContactsOpts {
  search?: string
  status?: string
  limit?: number
  cursor?: string
}

export async function listContacts(workspaceId: string, opts: ListContactsOpts = {}) {
  const { search, status, limit = 50, cursor } = opts
  return prisma.contact.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(cursor && { id: { lt: cursor } })
    },
    include: {
      tags: true,
      _count: { select: { conversations: true, deals: true, tickets: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
}

export async function getContact(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tags: true,
      contactNotes: { orderBy: { createdAt: 'desc' }, take: 20 },
      deals: {
        include: {
          stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
          pipeline: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
      conversations: {
        include: { channel: { select: { platform: true, name: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10
      },
      healthScores: { orderBy: { calculatedAt: 'desc' }, take: 1 }
    }
  })
  if (!contact) throw new Error('Contact not found')
  return contact
}

export async function updateContact(
  workspaceId: string,
  contactId: string,
  data: { status?: string; ltv?: number; shopifyCustomerId?: string }
) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  return prisma.contact.update({ where: { id: contactId }, data })
}

export async function addNote(workspaceId: string, contactId: string, userId: string, content: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  return prisma.contactNote.create({ data: { workspaceId, contactId, userId, content } })
}

export async function addTag(workspaceId: string, contactId: string, name: string, color = '#6366f1') {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  return prisma.contactTag.upsert({
    where: { contactId_name: { contactId, name } },
    create: { workspaceId, contactId, name, color },
    update: { color }
  })
}

export async function removeTag(workspaceId: string, contactId: string, tagId: string) {
  const tag = await prisma.contactTag.findFirst({ where: { id: tagId, contactId, workspaceId } })
  if (!tag) throw new Error('Tag not found')
  await prisma.contactTag.delete({ where: { id: tagId } })
}

export async function calculateHealthScore(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tickets: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
      conversations: { select: { lastMessageAt: true }, orderBy: { lastMessageAt: 'desc' }, take: 1 }
    }
  })
  if (!contact) throw new Error('Contact not found')

  const ltvNum = Number(contact.ltv)
  const ltvScore = Math.min(100, (ltvNum / 500) * 100)
  const openTickets = contact.tickets.length
  const noComplaintScore = Math.max(0, 100 - openTickets * 25)
  const lastActive = contact.conversations[0]?.lastMessageAt
  const daysSinceActive = lastActive
    ? (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    : 999
  const activityScore = Math.max(0, 100 - daysSinceActive * 2)

  const score = Math.round(ltvScore * 0.4 + noComplaintScore * 0.3 + activityScore * 0.3)
  const factors = {
    ltvScore: Math.round(ltvScore),
    noComplaintScore,
    activityScore: Math.round(activityScore),
    openTickets
  }

  await prisma.contactHealthScore.create({ data: { contactId, score, factors } })
  await prisma.contact.update({ where: { id: contactId }, data: { healthScore: score } })

  return { score, factors }
}
```

- [ ] **Step 4: Run tests**

```bash
cd Backend && npx vitest run src/modules/crm/__tests__/contact.service.test.ts 2>&1 | tail -10
```
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/crm/contact.service.ts \
        "Backend/src/modules/crm/__tests__/contact.service.test.ts"
git commit -m "feat: contact.service — CRUD, tags, notes, health score"
```

---

## Task 2: pipeline.service.ts

**Files:**
- Create: `Backend/src/modules/crm/pipeline.service.ts`
- Create: `Backend/src/modules/crm/__tests__/pipeline.service.test.ts`

### Context

Owns pipeline + deal lifecycle. `createPipeline` seeds six default stages (Lead → Calificado → Propuesta → Negociación → Ganado → Perdido). `moveDeal` auto-marks WON/LOST when the target stage has `isWon`/`isLost = true`. `Deal.value` is `Prisma.Decimal`.

`PipelineStage` has `@@unique([pipelineId, name])` and `@@unique([pipelineId, order])`.

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/crm/__tests__/pipeline.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    pipeline: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    deal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
}))

import { listPipelines, createPipeline, listDeals, createDeal, moveDeal, closeDeal } from '../pipeline.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listPipelines', () => {
  it('returns pipelines with stages', async () => {
    const mock = [{ id: 'p1', name: 'Ventas', stages: [], _count: { deals: 3 } }]
    vi.mocked(prisma.pipeline.findMany).mockResolvedValue(mock as any)
    const result = await listPipelines(WS)
    expect(prisma.pipeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
    expect(result).toEqual(mock)
  })
})

describe('createPipeline', () => {
  it('creates pipeline with 6 default stages', async () => {
    vi.mocked(prisma.pipeline.findFirst).mockResolvedValue(null) // no existing pipeline → isDefault = true
    vi.mocked(prisma.pipeline.create).mockResolvedValue({ id: 'p1', name: 'Ventas', isDefault: true, stages: [] } as any)
    await createPipeline(WS, 'Ventas')
    expect(prisma.pipeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WS,
          name: 'Ventas',
          isDefault: true,
          stages: { create: expect.arrayContaining([expect.objectContaining({ name: 'Lead', order: 1 })]) }
        })
      })
    )
  })

  it('sets isDefault=false when a pipeline already exists', async () => {
    vi.mocked(prisma.pipeline.findFirst).mockResolvedValue({ id: 'existing' } as any)
    vi.mocked(prisma.pipeline.create).mockResolvedValue({ id: 'p2', isDefault: false, stages: [] } as any)
    await createPipeline(WS, 'Soporte')
    expect(prisma.pipeline.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) })
    )
  })
})

describe('moveDeal', () => {
  it('throws if deal not found', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    await expect(moveDeal(WS, 'deal-1', 'stage-1')).rejects.toThrow('Deal not found')
  })

  it('auto-marks WON when target stage isWon', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1', pipelineId: 'p1' } as any)
    vi.mocked(prisma.pipelineStage.findFirst).mockResolvedValue({ id: 'stage-won', isWon: true, isLost: false } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)

    await moveDeal(WS, 'deal-1', 'stage-won')

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-won', status: 'WON', wonAt: expect.any(Date) })
      })
    )
  })

  it('moves deal without closing when stage is neutral', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1', pipelineId: 'p1' } as any)
    vi.mocked(prisma.pipelineStage.findFirst).mockResolvedValue({ id: 'stage-2', isWon: false, isLost: false } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)

    await moveDeal(WS, 'deal-1', 'stage-2')

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: 'stage-2' }) })
    )
    const callArgs = vi.mocked(prisma.deal.update).mock.calls[0][0]
    expect(callArgs.data).not.toHaveProperty('status')
  })
})

describe('closeDeal', () => {
  it('sets status=WON with wonAt', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)
    await closeDeal(WS, 'deal-1', 'WON')
    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WON', wonAt: expect.any(Date) }) })
    )
  })

  it('sets status=LOST with lostAt and lostReason', async () => {
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'deal-1' } as any)
    vi.mocked(prisma.deal.update).mockResolvedValue({} as any)
    await closeDeal(WS, 'deal-1', 'LOST', 'Budget cut')
    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'LOST', lostAt: expect.any(Date), lostReason: 'Budget cut' })
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/crm/__tests__/pipeline.service.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../pipeline.service'`

- [ ] **Step 3: Create pipeline.service.ts**

Create `Backend/src/modules/crm/pipeline.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', order: 1, isWon: false, isLost: false },
  { name: 'Calificado', color: '#818cf8', order: 2, isWon: false, isLost: false },
  { name: 'Propuesta', color: '#f59e0b', order: 3, isWon: false, isLost: false },
  { name: 'Negociación', color: '#f97316', order: 4, isWon: false, isLost: false },
  { name: 'Ganado', color: '#22c55e', order: 5, isWon: true, isLost: false },
  { name: 'Perdido', color: '#ef4444', order: 6, isWon: false, isLost: true }
]

export async function listPipelines(workspaceId: string) {
  return prisma.pipeline.findMany({
    where: { workspaceId },
    include: {
      stages: { orderBy: { order: 'asc' } },
      _count: { select: { deals: true } }
    },
    orderBy: { isDefault: 'desc' }
  })
}

export async function createPipeline(workspaceId: string, name: string) {
  const existing = await prisma.pipeline.findFirst({ where: { workspaceId } })
  return prisma.pipeline.create({
    data: {
      workspaceId,
      name,
      isDefault: !existing,
      stages: { create: DEFAULT_STAGES }
    },
    include: { stages: { orderBy: { order: 'asc' } } }
  })
}

export interface ListDealsOpts {
  pipelineId?: string
  status?: string
}

export async function listDeals(workspaceId: string, opts: ListDealsOpts = {}) {
  const { pipelineId, status } = opts
  return prisma.deal.findMany({
    where: {
      workspaceId,
      ...(pipelineId && { pipelineId }),
      ...(status && { status })
    },
    include: {
      contact: { select: { id: true, name: true, phone: true, avatarUrl: true } },
      stage: { select: { id: true, name: true, color: true, order: true, isWon: true, isLost: true } },
      pipeline: { select: { id: true, name: true } }
    },
    orderBy: { updatedAt: 'desc' }
  })
}

export interface CreateDealData {
  contactId: string
  pipelineId: string
  stageId: string
  title: string
  value?: number
  currency?: string
  assignedToUserId?: string
  sourceChannelId?: string
}

export async function createDeal(workspaceId: string, data: CreateDealData) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: data.pipelineId, workspaceId } })
  if (!pipeline) throw new Error('Pipeline not found')
  const stage = await prisma.pipelineStage.findFirst({ where: { id: data.stageId, pipelineId: data.pipelineId } })
  if (!stage) throw new Error('Stage not found')

  return prisma.deal.create({
    data: {
      workspaceId,
      contactId: data.contactId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      title: data.title,
      value: data.value ?? 0,
      currency: data.currency ?? 'USD',
      ...(data.assignedToUserId && { assignedToUserId: data.assignedToUserId }),
      ...(data.sourceChannelId && { sourceChannelId: data.sourceChannelId })
    },
    include: {
      contact: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, color: true } }
    }
  })
}

export async function moveDeal(workspaceId: string, dealId: string, stageId: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId: deal.pipelineId } })
  if (!stage) throw new Error('Stage not found in this pipeline')

  return prisma.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      ...(stage.isWon && { status: 'WON', wonAt: new Date() }),
      ...(stage.isLost && { status: 'LOST', lostAt: new Date() })
    }
  })
}

export async function closeDeal(workspaceId: string, dealId: string, outcome: 'WON' | 'LOST', lostReason?: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } })
  if (!deal) throw new Error('Deal not found')
  const now = new Date()
  return prisma.deal.update({
    where: { id: dealId },
    data: {
      status: outcome,
      ...(outcome === 'WON' ? { wonAt: now } : { lostAt: now, lostReason })
    }
  })
}
```

- [ ] **Step 4: Run tests**

```bash
cd Backend && npx vitest run src/modules/crm/__tests__/pipeline.service.test.ts 2>&1 | tail -10
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/crm/pipeline.service.ts \
        "Backend/src/modules/crm/__tests__/pipeline.service.test.ts"
git commit -m "feat: pipeline.service — pipeline, stages, deal CRUD + close"
```

---

## Task 3: ticket.service.ts

**Files:**
- Create: `Backend/src/modules/crm/ticket.service.ts`
- Create: `Backend/src/modules/crm/__tests__/ticket.service.test.ts`

### Context

Owns ticket lifecycle. SLA deadlines are calculated from priority at creation time: URGENT=1h, HIGH=4h, MEDIUM=24h, LOW=72h. `resolveTicket` sets `status='RESOLVED'` and `resolvedAt=now()`.

Ticket status values: `OPEN | IN_PROGRESS | RESOLVED | CLOSED`
Ticket priority values: `LOW | MEDIUM | HIGH | URGENT`

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/crm/__tests__/ticket.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    ticket: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() }
  }
}))

import { listTickets, createTicket, updateTicket, resolveTicket } from '../ticket.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listTickets', () => {
  it('returns tickets scoped to workspaceId', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([])
    await listTickets(WS, {})
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    )
  })

  it('passes status and priority filters', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([])
    await listTickets(WS, { status: 'OPEN', priority: 'HIGH' })
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN', priority: 'HIGH' }) })
    )
  })
})

describe('createTicket', () => {
  it('throws if contact not in workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(createTicket(WS, { contactId: 'c1', title: 'Bug' })).rejects.toThrow('Contact not found')
  })

  it('sets SLA deadline from priority', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1' } as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 't1' } as any)
    const before = Date.now()
    await createTicket(WS, { contactId: 'c1', title: 'Urgent bug', priority: 'URGENT' })
    const call = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    const sla = call.data.slaDeadline as Date
    // URGENT = 1 hour = 3600000ms
    expect(sla.getTime() - before).toBeGreaterThan(3500000)
    expect(sla.getTime() - before).toBeLessThan(3700000)
  })

  it('defaults priority to MEDIUM when not provided', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1' } as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 't1' } as any)
    await createTicket(WS, { contactId: 'c1', title: 'Issue' })
    const call = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(call.data.priority).toBe('MEDIUM')
  })
})

describe('resolveTicket', () => {
  it('sets status=RESOLVED and resolvedAt', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1' } as any)
    vi.mocked(prisma.ticket.update).mockResolvedValue({} as any)
    await resolveTicket(WS, 't1')
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) })
      })
    )
  })

  it('throws if ticket not found', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null)
    await expect(resolveTicket(WS, 't1')).rejects.toThrow('Ticket not found')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/crm/__tests__/ticket.service.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../ticket.service'`

- [ ] **Step 3: Create ticket.service.ts**

Create `Backend/src/modules/crm/ticket.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'

const SLA_HOURS: Record<string, number> = {
  URGENT: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72
}

export interface ListTicketsOpts {
  status?: string
  priority?: string
  contactId?: string
  limit?: number
  cursor?: string
}

export async function listTickets(workspaceId: string, opts: ListTicketsOpts = {}) {
  const { status, priority, contactId, limit = 50, cursor } = opts
  return prisma.ticket.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(contactId && { contactId }),
      ...(cursor && { id: { lt: cursor } })
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } }
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: limit
  })
}

export interface CreateTicketData {
  contactId: string
  title: string
  description?: string
  priority?: string
  orderId?: string
  conversationId?: string
  assignedToUserId?: string
}

export async function createTicket(workspaceId: string, data: CreateTicketData) {
  const priority = data.priority ?? 'MEDIUM'
  const slaHours = SLA_HOURS[priority] ?? 24
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000)

  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  return prisma.ticket.create({
    data: {
      workspaceId,
      contactId: data.contactId,
      title: data.title,
      priority,
      slaDeadline,
      ...(data.description && { description: data.description }),
      ...(data.orderId && { orderId: data.orderId }),
      ...(data.conversationId && { conversationId: data.conversationId }),
      ...(data.assignedToUserId && { assignedToUserId: data.assignedToUserId })
    },
    include: { contact: { select: { id: true, name: true } } }
  })
}

export async function updateTicket(
  workspaceId: string,
  ticketId: string,
  data: { status?: string; priority?: string; assignedToUserId?: string | null }
) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } })
  if (!ticket) throw new Error('Ticket not found')

  const updateData: Record<string, unknown> = {}
  if (data.status) updateData.status = data.status
  if (data.priority) updateData.priority = data.priority
  if ('assignedToUserId' in data) updateData.assignedToUserId = data.assignedToUserId

  return prisma.ticket.update({ where: { id: ticketId }, data: updateData })
}

export async function resolveTicket(workspaceId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } })
  if (!ticket) throw new Error('Ticket not found')
  return prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  })
}
```

- [ ] **Step 4: Run all CRM tests**

```bash
cd Backend && npx vitest run src/modules/crm/ 2>&1 | tail -10
```
Expected: all 17 tests PASS across 3 test files

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/crm/ticket.service.ts \
        "Backend/src/modules/crm/__tests__/ticket.service.test.ts"
git commit -m "feat: ticket.service — CRUD with SLA deadline calculation"
```

---

## Task 4: crm.controller.ts + crm.routes.ts + app.ts

**Files:**
- Create: `Backend/src/modules/crm/crm.controller.ts`
- Create: `Backend/src/modules/crm/crm.routes.ts`
- Modify: `Backend/src/app.ts`

### Context

The controller wraps every service function in try/catch. Status code rules:
- `'Contact not found'` / `'Deal not found'` / `'Ticket not found'` → 404
- `'not found'` substring in error → 404
- missing required fields → 400
- everything else → 500

`requirePlan` checks `req.workspace.plan` (populated by `authenticate` middleware). Both middleware must run before any CRM handler.

Routes are mounted at `/api` in `app.ts` (same as messaging), so the router uses `/crm/...` prefixes — full paths become `/api/crm/...`.

- [ ] **Step 1: Create crm.controller.ts**

Create `Backend/src/modules/crm/crm.controller.ts`:

```typescript
import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/auth'
import * as cs from './contact.service'
import * as ps from './pipeline.service'
import * as ts from './ticket.service'

function notFoundStatus(msg: string) {
  return msg.toLowerCase().includes('not found') ? 404 : 500
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function listContactsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId!
    const { search, status, cursor, limit } = req.query as Record<string, string>
    res.json(await cs.listContacts(workspaceId, { search, status, cursor, limit: limit ? parseInt(limit, 10) : undefined }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function getContactHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await cs.getContact(req.user!.workspaceId!, req.params.contactId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function updateContactHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await cs.updateContact(req.user!.workspaceId!, req.params.contactId, req.body))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function addNoteHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { content } = req.body
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
    res.status(201).json(await cs.addNote(req.user!.workspaceId!, req.params.contactId, req.user!.id!, content.trim()))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function addTagHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await cs.addTag(req.user!.workspaceId!, req.params.contactId, name.trim(), color))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function removeTagHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await cs.removeTag(req.user!.workspaceId!, req.params.contactId, req.params.tagId)
    res.status(204).send()
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function calculateHealthScoreHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await cs.calculateHealthScore(req.user!.workspaceId!, req.params.contactId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

// ── Pipelines + Deals ─────────────────────────────────────────────────────────

export async function listPipelinesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ps.listPipelines(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createPipelineHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await ps.createPipeline(req.user!.workspaceId!, name.trim()))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function listDealsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { pipelineId, status } = req.query as Record<string, string>
    res.json(await ps.listDeals(req.user!.workspaceId!, { pipelineId, status }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { contactId, pipelineId, stageId, title, value, currency, assignedToUserId, sourceChannelId } = req.body
    if (!contactId || !pipelineId || !stageId || !title?.trim()) {
      res.status(400).json({ error: 'contactId, pipelineId, stageId, title are required' }); return
    }
    res.status(201).json(await ps.createDeal(req.user!.workspaceId!, { contactId, pipelineId, stageId, title: title.trim(), value, currency, assignedToUserId, sourceChannelId }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function moveDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { stageId } = req.body
    if (!stageId) { res.status(400).json({ error: 'stageId is required' }); return }
    res.json(await ps.moveDeal(req.user!.workspaceId!, req.params.dealId, stageId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function closeDealHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { outcome, lostReason } = req.body
    if (outcome !== 'WON' && outcome !== 'LOST') { res.status(400).json({ error: 'outcome must be WON or LOST' }); return }
    res.json(await ps.closeDeal(req.user!.workspaceId!, req.params.dealId, outcome, lostReason))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export async function listTicketsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, priority, contactId, cursor, limit } = req.query as Record<string, string>
    res.json(await ts.listTickets(req.user!.workspaceId!, { status, priority, contactId, cursor, limit: limit ? parseInt(limit, 10) : undefined }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { contactId, title, description, priority, orderId, conversationId, assignedToUserId } = req.body
    if (!contactId || !title?.trim()) { res.status(400).json({ error: 'contactId and title are required' }); return }
    res.status(201).json(await ts.createTicket(req.user!.workspaceId!, { contactId, title: title.trim(), description, priority, orderId, conversationId, assignedToUserId }))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function updateTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ts.updateTicket(req.user!.workspaceId!, req.params.ticketId, req.body))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}

export async function resolveTicketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await ts.resolveTicket(req.user!.workspaceId!, req.params.ticketId))
  } catch (err: any) { res.status(notFoundStatus(err.message)).json({ error: err.message }) }
}
```

- [ ] **Step 2: Create crm.routes.ts**

Create `Backend/src/modules/crm/crm.routes.ts`:

```typescript
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  listContactsHandler, getContactHandler, updateContactHandler,
  addNoteHandler, addTagHandler, removeTagHandler, calculateHealthScoreHandler,
  listPipelinesHandler, createPipelineHandler,
  listDealsHandler, createDealHandler, moveDealHandler, closeDealHandler,
  listTicketsHandler, createTicketHandler, updateTicketHandler, resolveTicketHandler
} from './crm.controller'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// Contacts
router.get('/crm/contacts', ...auth, listContactsHandler)
router.get('/crm/contacts/:contactId', ...auth, getContactHandler)
router.patch('/crm/contacts/:contactId', ...auth, updateContactHandler)
router.post('/crm/contacts/:contactId/notes', ...auth, addNoteHandler)
router.post('/crm/contacts/:contactId/tags', ...auth, addTagHandler)
router.delete('/crm/contacts/:contactId/tags/:tagId', ...auth, removeTagHandler)
router.post('/crm/contacts/:contactId/health-score', ...auth, calculateHealthScoreHandler)

// Pipelines + Deals
router.get('/crm/pipelines', ...auth, listPipelinesHandler)
router.post('/crm/pipelines', ...auth, createPipelineHandler)
router.get('/crm/deals', ...auth, listDealsHandler)
router.post('/crm/deals', ...auth, createDealHandler)
router.patch('/crm/deals/:dealId/move', ...auth, moveDealHandler)
router.patch('/crm/deals/:dealId/close', ...auth, closeDealHandler)

// Tickets
router.get('/crm/tickets', ...auth, listTicketsHandler)
router.post('/crm/tickets', ...auth, createTicketHandler)
router.patch('/crm/tickets/:ticketId', ...auth, updateTicketHandler)
router.post('/crm/tickets/:ticketId/resolve', ...auth, resolveTicketHandler)

export default router
```

- [ ] **Step 3: Register CRM routes in app.ts**

Read `Backend/src/app.ts`. Find the line `app.use('/api', messagingRoutes)` and add the CRM import + mount immediately before it:

```typescript
import crmRoutes from './modules/crm/crm.routes'
```

Add to imports at top (after messagingRoutes import), then add:

```typescript
app.use('/api', crmRoutes)
```

Add that line immediately before `app.use('/api', messagingRoutes)`.

- [ ] **Step 4: Build to confirm no TypeScript errors**

```bash
cd Backend && npm run build 2>&1 | tail -5
```
Expected: `CJS ⚡️ Build success`

- [ ] **Step 5: Run all tests**

```bash
cd Backend && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass (23 messaging + 17 CRM = 40 tests)

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/crm/crm.controller.ts \
        Backend/src/modules/crm/crm.routes.ts \
        Backend/src/app.ts
git commit -m "feat: CRM controller + routes — contacts, pipelines, deals, tickets"
```

---

## Task 5: Frontend — Contacts List Page

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/CrmContactsClient.tsx`

### Context

Server Component shell + Client Component table. Uses `fetchAPI` from `@/lib/api.ts` (auto-injects Bearer token). Needs `mounted` pattern to avoid hydration mismatch (localStorage access).

Contact status values and colors:
- LEAD → `bg-blue-100 text-blue-700`
- PROSPECT → `bg-purple-100 text-purple-700`
- CUSTOMER → `bg-green-100 text-green-700`
- VIP → `bg-yellow-100 text-yellow-700`
- CHURNED → `bg-red-100 text-red-700`

`Contact.ltv` comes from the API as a string (serialized Decimal) — use `Number(c.ltv).toFixed(2)`.

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/page.tsx`:

```tsx
import type { Metadata } from 'next'
import CrmContactsClient from './CrmContactsClient'

export const metadata: Metadata = {
  title: 'CRM — Contactos | Metria',
  description: 'Gestión de contactos, deals y tickets'
}

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <p className="text-sm text-muted-foreground mt-1">Clientes, leads y prospectos de tu workspace</p>
      </div>
      <CrmContactsClient />
    </div>
  )
}
```

- [ ] **Step 2: Create CrmContactsClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/CrmContactsClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

const STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700',
  PROSPECT: 'bg-purple-100 text-purple-700',
  CUSTOMER: 'bg-green-100 text-green-700',
  VIP: 'bg-yellow-100 text-yellow-700',
  CHURNED: 'bg-red-100 text-red-700'
}

const STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead', PROSPECT: 'Prospecto', CUSTOMER: 'Cliente', VIP: 'VIP', CHURNED: 'Inactivo'
}

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  ltv: string
  healthScore: number | null
  source: string
  tags: { id: string; name: string; color: string }[]
  _count: { conversations: number; deals: number; tickets: number }
}

export default function CrmContactsClient() {
  const [mounted, setMounted] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    setLoading(true)
    fetchAPI(`/crm/contacts?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setContacts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, search, statusFilter])

  if (!mounted) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="flex-1 max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin contactos</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Contacto</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
                <th className="text-right px-4 py-2 font-medium">LTV</th>
                <th className="text-center px-4 py-2 font-medium">Conv.</th>
                <th className="text-center px-4 py-2 font-medium">Deals</th>
                <th className="text-center px-4 py-2 font-medium">Tickets</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/crm/contacts/${c.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/dashboard/crm/contacts/${c.id}`) }}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone ?? c.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${Number(c.ltv).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.conversations}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.deals}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.tickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build to confirm no TypeScript errors**

```bash
cd metria-metrics/Frontend && npx tsc --noEmit 2>&1 | grep -v logistics | grep -v useWorkspaceConfig | head -10
```
Expected: no output (no errors in new files)

- [ ] **Step 4: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/crm/
git commit -m "feat: CRM contacts list page with search and status filter"
```

---

## Task 6: Frontend — Contact 360° Profile

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`

### Context

5-tab profile page:
1. **Resumen** — LTV, health score, status badge, source, tags list
2. **Conversaciones** — list of conversation previews (platform + last message date)
3. **Deals** — list of deals with stage chip and value
4. **Tickets** — list of tickets with priority/status badges
5. **Notas** — read notes + add note form

Fetch contact from `GET /api/crm/contacts/:contactId`. Data already includes all relations from `getContact()` in contact.service.ts.

Uses `mounted` pattern. `params.contactId` is a string from Next.js dynamic route — read it from `useParams()` or receive as prop from the Server Component.

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import ContactProfileClient from './ContactProfileClient'

export const metadata: Metadata = {
  title: 'Perfil de Contacto | Metria',
}

export default function ContactProfilePage({ params }: { params: { contactId: string } }) {
  return <ContactProfileClient contactId={params.contactId} />
}
```

- [ ] **Step 2: Create ContactProfileClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

const STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700', PROSPECT: 'bg-purple-100 text-purple-700',
  CUSTOMER: 'bg-green-100 text-green-700', VIP: 'bg-yellow-100 text-yellow-700',
  CHURNED: 'bg-red-100 text-red-700'
}
const STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead', PROSPECT: 'Prospecto', CUSTOMER: 'Cliente', VIP: 'VIP', CHURNED: 'Inactivo'
}
const TICKET_PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-gray-100 text-gray-700'
}
const PLATFORM_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', TELEGRAM: 'Telegram'
}

type Tab = 'resumen' | 'conversaciones' | 'deals' | 'tickets' | 'notas'

interface Contact {
  id: string; name: string; email: string | null; phone: string | null; status: string
  ltv: string; healthScore: number | null; source: string; createdAt: string
  tags: { id: string; name: string; color: string }[]
  contactNotes: { id: string; content: string; createdAt: string; userId: string }[]
  deals: { id: string; title: string; value: string; status: string; stage: { name: string; color: string } }[]
  tickets: { id: string; title: string; status: string; priority: string; createdAt: string; slaDeadline: string | null }[]
  conversations: { id: string; status: string; messageCount: number; lastMessageAt: string | null; channel: { platform: string; name: string } }[]
}

export default function ContactProfileClient({ contactId }: { contactId: string }) {
  const [mounted, setMounted] = useState(false)
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('resumen')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI(`/crm/contacts/${contactId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setContact)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, contactId])

  async function handleAddNote() {
    if (!noteContent.trim()) return
    setSavingNote(true)
    try {
      const res = await fetchAPI(`/crm/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent.trim() })
      })
      if (!res.ok) throw new Error('Failed to save note')
      const newNote = await res.json()
      setContact(prev => prev ? { ...prev, contactNotes: [newNote, ...prev.contactNotes] } : prev)
      setNoteContent('')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingNote(false)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted/40 rounded" />
        <div className="h-32 bg-muted/40 rounded-lg" />
        <div className="h-64 bg-muted/40 rounded-lg" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Contacto no encontrado.{' '}
        <button className="underline" onClick={() => router.back()}>Volver</button>
      </div>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'conversaciones', label: `Conversaciones (${contact.conversations.length})` },
    { key: 'deals', label: `Deals (${contact.deals.length})` },
    { key: 'tickets', label: `Tickets (${contact.tickets.length})` },
    { key: 'notas', label: `Notas (${contact.contactNotes.length})` }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold uppercase">
          {contact.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">{contact.phone ?? contact.email ?? '—'}</p>
        </div>
        <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[contact.status] ?? 'bg-muted'}`}>
          {STATUS_LABEL[contact.status] ?? contact.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'resumen' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Métricas</h3>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">LTV</span><span className="font-semibold">${Number(contact.ltv).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Health Score</span><span className="font-semibold">{contact.healthScore ?? '—'}/100</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fuente</span><span>{contact.source}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Miembro desde</span><span>{new Date(contact.createdAt).toLocaleDateString('es-CL')}</span></div>
          </div>
          {contact.tags.length > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Etiquetas</h3>
              <div className="flex flex-wrap gap-2">
                {contact.tags.map(tag => (
                  <span key={tag.id} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tag.color }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'conversaciones' && (
        <div className="space-y-2">
          {contact.conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin conversaciones</p>
          ) : contact.conversations.map(conv => (
            <div key={conv.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{PLATFORM_LABEL[conv.channel.platform] ?? conv.channel.platform}</span>
                <span className="text-muted-foreground ml-2">{conv.channel.name}</span>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">{conv.messageCount} mensajes</div>
                {conv.lastMessageAt && <div className="text-xs text-muted-foreground">{new Date(conv.lastMessageAt).toLocaleDateString('es-CL')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'deals' && (
        <div className="space-y-2">
          {contact.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin deals</p>
          ) : contact.deals.map(deal => (
            <div key={deal.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{deal.title}</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: deal.stage.color }}>{deal.stage.name}</span>
              </div>
              <span className="font-mono">${Number(deal.value).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'tickets' && (
        <div className="space-y-2">
          {contact.tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tickets</p>
          ) : contact.tickets.map(ticket => (
            <div key={ticket.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
              <span className="font-medium">{ticket.title}</span>
              <div className="flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${TICKET_PRIORITY_COLOR[ticket.priority] ?? 'bg-muted'}`}>{ticket.priority}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{ticket.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'notas' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <textarea
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background resize-none"
              rows={3}
              placeholder="Agregar una nota..."
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
            />
            <button
              onClick={handleAddNote}
              disabled={!noteContent.trim() || savingNote}
              className="self-end px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {savingNote ? '...' : 'Guardar'}
            </button>
          </div>
          <div className="space-y-2">
            {contact.contactNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin notas</p>
            ) : contact.contactNotes.map(note => (
              <div key={note.id} className="rounded-lg border p-3 text-sm">
                <p>{note.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(note.createdAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
cd metria-metrics/Frontend && npx tsc --noEmit 2>&1 | grep -v logistics | grep -v useWorkspaceConfig | head -10
```
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add "metria-metrics/Frontend/src/app/dashboard/crm/contacts/"
git commit -m "feat: contact 360° profile — 5 tabs: resumen, conversaciones, deals, tickets, notas"
```

---

## Task 7: Frontend — Pipeline Kanban

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/PipelinesClient.tsx`

### Context

Kanban board showing deals grouped by stage. No drag-and-drop — use a "Mover" button on each deal card that opens an inline stage selector (a `<select>` dropdown) to move the deal to a different stage. Pipeline selector at top allows switching between pipelines.

Data flow:
1. `GET /api/crm/pipelines` → get pipelines with stages
2. `GET /api/crm/deals?pipelineId=:id` → get all deals for selected pipeline
3. Group deals by `deal.stage.id` on the frontend
4. Move deal: `PATCH /api/crm/deals/:dealId/move` with body `{ stageId }`
5. Close deal: `PATCH /api/crm/deals/:dealId/close` with body `{ outcome: 'WON'|'LOST', lostReason? }`

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/page.tsx`:

```tsx
import type { Metadata } from 'next'
import PipelinesClient from './PipelinesClient'

export const metadata: Metadata = {
  title: 'Pipeline | Metria',
  description: 'Kanban de deals y oportunidades'
}

export default function PipelinesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Deals y oportunidades de venta</p>
      </div>
      <PipelinesClient />
    </div>
  )
}
```

- [ ] **Step 2: Create PipelinesClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/pipelines/PipelinesClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'

interface Stage {
  id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean
}
interface Pipeline {
  id: string; name: string; isDefault: boolean
  stages: Stage[]
  _count: { deals: number }
}
interface Deal {
  id: string; title: string; value: string; status: string
  contact: { id: string; name: string }
  stage: { id: string; name: string; color: string }
}

export default function PipelinesClient() {
  const [mounted, setMounted] = useState(false)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loadingPipelines, setLoadingPipelines] = useState(true)
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [movingDealId, setMovingDealId] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/crm/pipelines')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: Pipeline[]) => {
        setPipelines(data)
        if (data.length > 0) setSelectedPipelineId(data[0].id)
      })
      .catch(console.error)
      .finally(() => setLoadingPipelines(false))
  }, [mounted])

  useEffect(() => {
    if (!mounted || !selectedPipelineId) return
    setLoadingDeals(true)
    fetchAPI(`/crm/deals?pipelineId=${selectedPipelineId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setDeals)
      .catch(console.error)
      .finally(() => setLoadingDeals(false))
  }, [mounted, selectedPipelineId])

  async function handleMove(dealId: string, stageId: string) {
    setMovingDealId(dealId)
    try {
      const res = await fetchAPI(`/crm/deals/${dealId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId })
      })
      if (!res.ok) throw new Error('Move failed')
      const updated = await res.json()
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: updated.stage ?? d.stage, status: updated.status ?? d.status } : d))
    } catch (err) {
      console.error(err)
    } finally {
      setMovingDealId(null)
    }
  }

  if (!mounted || loadingPipelines) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-56 h-64 rounded-lg bg-muted/40 animate-pulse shrink-0" />
        ))}
      </div>
    )
  }

  if (pipelines.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Sin pipelines. Crea uno desde la API.</div>
  }

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages ?? []

  return (
    <div className="space-y-4">
      {/* Pipeline selector */}
      <div className="flex items-center gap-3">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={selectedPipelineId ?? ''}
          onChange={e => setSelectedPipelineId(e.target.value)}
        >
          {pipelines.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {loadingDeals && <span className="text-xs text-muted-foreground">Cargando...</span>}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageDeals = deals.filter(d => d.stage.id === stage.id)
          return (
            <div key={stage.id} className="w-60 shrink-0 flex flex-col gap-2">
              {/* Column header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium">{stage.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{stageDeals.length}</span>
              </div>

              {/* Deal cards */}
              <div className="space-y-2">
                {stageDeals.map(deal => (
                  <div key={deal.id} className="rounded-lg border bg-card p-3 space-y-2 text-sm shadow-sm">
                    <div className="font-medium leading-tight">{deal.title}</div>
                    <div className="text-xs text-muted-foreground">{deal.contact.name}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">${Number(deal.value).toFixed(2)}</span>
                      {deal.status === 'OPEN' && (
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background focus:outline-none"
                          value={deal.stage.id}
                          disabled={movingDealId === deal.id}
                          onChange={e => handleMove(deal.id, e.target.value)}
                        >
                          {stages.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      {deal.status !== 'OPEN' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${deal.status === 'WON' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {deal.status === 'WON' ? 'Ganado' : 'Perdido'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Vacío</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
cd metria-metrics/Frontend && npx tsc --noEmit 2>&1 | grep -v logistics | grep -v useWorkspaceConfig | head -10
```
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add "metria-metrics/Frontend/src/app/dashboard/crm/pipelines/"
git commit -m "feat: pipeline Kanban board with inline stage selector"
```

---

## Task 8: Frontend — Tickets List

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/tickets/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/crm/tickets/TicketsClient.tsx`

### Context

Table showing all tickets with priority and status badges. Priority order: URGENT > HIGH > MEDIUM > LOW. SLA deadline shown in red if overdue.

Inline actions: "Resolver" button calls `POST /api/crm/tickets/:ticketId/resolve`. Status update via inline `<select>` calls `PATCH /api/crm/tickets/:ticketId` with `{ status }`.

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/tickets/page.tsx`:

```tsx
import type { Metadata } from 'next'
import TicketsClient from './TicketsClient'

export const metadata: Metadata = {
  title: 'Tickets | Metria',
  description: 'Tickets de soporte y atención al cliente'
}

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground mt-1">Solicitudes de soporte y atención</p>
      </div>
      <TicketsClient />
    </div>
  )
}
```

- [ ] **Step 2: Create TicketsClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/crm/tickets/TicketsClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-600'
}
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600'
}
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierto', IN_PROGRESS: 'En progreso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado'
}

interface Ticket {
  id: string; title: string; status: string; priority: string
  slaDeadline: string | null; createdAt: string
  contact: { id: string; name: string; phone: string | null }
}

export default function TicketsClient() {
  const [mounted, setMounted] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    setLoading(true)
    fetchAPI(`/crm/tickets?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setTickets)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, statusFilter, priorityFilter])

  async function handleResolve(ticketId: string) {
    setResolvingId(ticketId)
    try {
      const res = await fetchAPI(`/crm/tickets/${ticketId}/resolve`, { method: 'POST' })
      if (!res.ok) throw new Error('Resolve failed')
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'RESOLVED' } : t))
    } catch (err) {
      console.error(err)
    } finally {
      setResolvingId(null)
    }
  }

  if (!mounted) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  const now = Date.now()

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
        >
          <option value="">Todas las prioridades</option>
          {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin tickets</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Ticket</th>
                <th className="text-left px-4 py-2 font-medium">Contacto</th>
                <th className="text-center px-4 py-2 font-medium">Prioridad</th>
                <th className="text-center px-4 py-2 font-medium">Estado</th>
                <th className="text-right px-4 py-2 font-medium">SLA</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => {
                const isOverdue = ticket.slaDeadline && new Date(ticket.slaDeadline).getTime() < now && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED'
                return (
                  <tr key={ticket.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{ticket.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ticket.contact.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[ticket.priority] ?? 'bg-muted'}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[ticket.status] ?? 'bg-muted'}`}>
                        {STATUS_LABEL[ticket.status] ?? ticket.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {ticket.slaDeadline
                        ? new Date(ticket.slaDeadline).toLocaleDateString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                      {isOverdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                        <button
                          onClick={() => handleResolve(ticket.id)}
                          disabled={resolvingId === ticket.id}
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                        >
                          {resolvingId === ticket.id ? '...' : 'Resolver'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
cd metria-metrics/Frontend && npx tsc --noEmit 2>&1 | grep -v logistics | grep -v useWorkspaceConfig | head -10
```
Expected: no output

- [ ] **Step 4: Run all backend tests to confirm nothing regressed**

```bash
cd Backend && npx vitest run 2>&1 | tail -8
```
Expected: all 40 tests pass

- [ ] **Step 5: Commit**

```bash
git add "metria-metrics/Frontend/src/app/dashboard/crm/tickets/"
git commit -m "feat: tickets list with priority/SLA indicators and inline resolve"
```

---

## Self-Review

### Spec coverage check

From spec section 11, Phase 3 = items 10-13:

| Spec item | Task |
|-----------|------|
| 10. Contact CRUD + 360° profile | Task 1 (service) + Task 4 (routes) + Task 5 (list) + Task 6 (profile) |
| 11. Pipeline + Kanban board | Task 2 (service) + Task 4 (routes) + Task 7 (Kanban) |
| 12. Ticket management | Task 3 (service) + Task 4 (routes) + Task 8 (tickets list) |
| 13. Contact health score calculation | Task 1 (`calculateHealthScore`) — manual trigger via `POST /api/crm/contacts/:id/health-score` |

All Phase 3 requirements covered. Daily cron for health score is Phase 4 (BullMQ not introduced yet — manual trigger suffices for Phase 3).

### Type consistency check

- `listContacts` returns contacts with `_count.conversations`, `_count.deals`, `_count.tickets` — matches `CrmContactsClient.tsx` Contact interface ✓
- `getContact` returns contact with `contactNotes` (not `notes`) — matches `ContactProfileClient.tsx` ✓
- `calculateHealthScore` returns `{ score, factors }` — matches controller response ✓
- `moveDeal` returns the updated deal — frontend uses `.stage` and `.status` from response ✓
- `createPipeline` with DEFAULT_STAGES has 6 stages — pipeline test asserts `{ name: 'Lead', order: 1 }` ✓
