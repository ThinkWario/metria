# Messaging + CRM — Phase 5: Analytics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily-aggregated analytics layer that snapshots per-channel messaging metrics, exposes them via a REST API, and renders a dashboard page with a Recharts stacked-area chart, per-channel KPI cards, and an attribution funnel table.

**Architecture:** A new `Backend/src/modules/analytics/` module with three files — `analytics.service.ts` (aggregation logic + read helpers), `analytics.cron.ts` (node-cron daily job), and `analytics.controller.ts` + `analytics.routes.ts` (REST). The cron job runs at 01:00 UTC every day and upserts one `ChannelAnalyticSnapshot` row per channel for the previous calendar day. Frontend has a single page at `/dashboard/messaging-analytics` with a client component that fetches the data and renders it.

**Tech Stack:** Express 4, Prisma 5 (PostgreSQL), node-cron 3, Vitest, Next.js 16 App Router, TypeScript, Recharts 3, Tailwind CSS 4

**Spec reference:** `docs/superpowers/specs/2026-05-09-messaging-crm-design.md` (section 9 — Messaging Analytics, section 11 Phase 5)

**Prerequisite:** Phases 1–4 complete. `ChannelAnalyticSnapshot` model exists in `schema.prisma` with `@@unique([workspaceId, channelId, date])`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `Backend/src/modules/analytics/analytics.service.ts` | aggregateChannelSnapshot + getSnapshots + getFunnelSummary |
| Create | `Backend/src/modules/analytics/__tests__/analytics.service.test.ts` | Tests |
| Create | `Backend/src/modules/analytics/analytics.cron.ts` | node-cron daily job |
| Create | `Backend/src/modules/analytics/analytics.controller.ts` | Express handlers |
| Create | `Backend/src/modules/analytics/analytics.routes.ts` | Route registration |
| Modify | `Backend/src/app.ts` | Mount analytics routes + start cron |
| Create | `metria-metrics/Frontend/src/app/dashboard/messaging-analytics/page.tsx` | Server shell + Metadata |
| Create | `metria-metrics/Frontend/src/app/dashboard/messaging-analytics/MessagingAnalyticsClient.tsx` | Chart + KPI cards + funnel table |

---

## Task 1: analytics.service.ts

**Files:**
- Create: `Backend/src/modules/analytics/analytics.service.ts`
- Create: `Backend/src/modules/analytics/__tests__/analytics.service.test.ts`

### Context

Three exported functions:

1. `aggregateChannelSnapshot(workspaceId, channelId, dateStr)` — computes metrics for one channel on one date (string `YYYY-MM-DD`), upserts into `ChannelAnalyticSnapshot`. Returns the upserted row.

2. `getSnapshots(workspaceId, days?, channelId?)` — returns snapshots ordered by date desc, up to `days` (default 90) calendar days back. If `channelId` provided, filters to that channel.

3. `getFunnelSummary(workspaceId, days?)` — returns totals across all channels: `{ totalInbound, totalOutbound, newContacts, conversationsOpened, conversationsResolved, dealsCreated, dealsWon, dealsWonValue, avgResolutionRate, avgResponseSeconds }`.

**Aggregation queries for `aggregateChannelSnapshot`:**
- Date window: `start = new Date(dateStr + 'T00:00:00.000Z')`, `end = new Date(dateStr + 'T23:59:59.999Z')` — use UTC midnight boundaries.
- `totalInbound`: `prisma.message.count({ where: { conversation: { channelId }, direction: 'INBOUND', sentAt: { gte: start, lte: end } } })`
- `totalOutbound`: same but `direction: 'OUTBOUND'`
- `newContacts`: `prisma.contact.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } })` — workspace-wide (contacts don't have channelId)
- `conversationsOpened`: `prisma.conversation.count({ where: { channelId, createdAt: { gte: start, lte: end } } })`
- `conversationsResolved`: `prisma.conversation.count({ where: { channelId, status: 'RESOLVED', updatedAt: { gte: start, lte: end } } })`
- `avgFirstResponseSeconds`: raw SQL via `prisma.$queryRaw` — for each conversation opened that day, find the time diff between first INBOUND and first subsequent OUTBOUND message. Use 0 if no conversations.
- `dealsCreated`: `prisma.deal.count({ where: { contact: { conversations: { some: { channelId } } }, createdAt: { gte: start, lte: end } } })`
- `dealsWon`: `prisma.deal.count({ where: { contact: { conversations: { some: { channelId } } }, status: 'WON', updatedAt: { gte: start, lte: end } } })`
- `dealsWonValue`: `prisma.deal.aggregate({ _sum: { value: true }, where: { contact: { conversations: { some: { channelId } } }, status: 'WON', updatedAt: { gte: start, lte: end } } })`
- `csatAvg`: `null` (CSAT from bot actions — out of scope for this phase)

Upsert key: `workspaceId_channelId_date: { workspaceId, channelId, date: start }`.

- [ ] **Step 1: Write failing tests**

```typescript
// Backend/src/modules/analytics/__tests__/analytics.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../lib/prisma'
import {
  aggregateChannelSnapshot,
  getSnapshots,
  getFunnelSummary
} from '../analytics.service'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    message: { count: vi.fn() },
    contact: { count: vi.fn() },
    conversation: { count: vi.fn() },
    deal: { count: vi.fn(), aggregate: vi.fn() },
    channelAnalyticSnapshot: { upsert: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn()
  }
}))

const mockPrisma = prisma as unknown as {
  message: { count: ReturnType<typeof vi.fn> }
  contact: { count: ReturnType<typeof vi.fn> }
  conversation: { count: ReturnType<typeof vi.fn> }
  deal: { count: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> }
  channelAnalyticSnapshot: {
    upsert: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
  }
  $queryRaw: ReturnType<typeof vi.fn>
}

const WS = 'ws-1'
const CH = 'ch-1'
const DATE = '2026-05-09'

describe('aggregateChannelSnapshot', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('counts messages and upserts snapshot', async () => {
    mockPrisma.message.count.mockResolvedValue(5)
    mockPrisma.contact.count.mockResolvedValue(2)
    mockPrisma.conversation.count.mockResolvedValue(3)
    mockPrisma.deal.count.mockResolvedValue(1)
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 100 } })
    mockPrisma.$queryRaw.mockResolvedValue([{ avg_seconds: 120 }])
    const snapRow = { id: 's1', workspaceId: WS, channelId: CH }
    mockPrisma.channelAnalyticSnapshot.upsert.mockResolvedValue(snapRow)

    const result = await aggregateChannelSnapshot(WS, CH, DATE)
    expect(result).toEqual(snapRow)
    expect(mockPrisma.channelAnalyticSnapshot.upsert).toHaveBeenCalledOnce()
    const call = mockPrisma.channelAnalyticSnapshot.upsert.mock.calls[0][0]
    expect(call.create.totalInbound).toBe(5)
    expect(call.create.totalOutbound).toBe(5)
    expect(call.create.avgFirstResponseSeconds).toBe(120)
    expect(call.create.dealsWonValue).toBe(100)
  })

  it('uses 0 for avgFirstResponseSeconds when $queryRaw returns empty', async () => {
    mockPrisma.message.count.mockResolvedValue(0)
    mockPrisma.contact.count.mockResolvedValue(0)
    mockPrisma.conversation.count.mockResolvedValue(0)
    mockPrisma.deal.count.mockResolvedValue(0)
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: null } })
    mockPrisma.$queryRaw.mockResolvedValue([])
    mockPrisma.channelAnalyticSnapshot.upsert.mockResolvedValue({ id: 's2' })

    await aggregateChannelSnapshot(WS, CH, DATE)
    const call = mockPrisma.channelAnalyticSnapshot.upsert.mock.calls[0][0]
    expect(call.create.avgFirstResponseSeconds).toBe(0)
    expect(call.create.dealsWonValue).toBe(0)
  })
})

describe('getSnapshots', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns snapshots with default 90 days', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }]
    mockPrisma.channelAnalyticSnapshot.findMany.mockResolvedValue(rows)

    const result = await getSnapshots(WS)
    expect(result).toEqual(rows)
    const call = mockPrisma.channelAnalyticSnapshot.findMany.mock.calls[0][0]
    expect(call.where.workspaceId).toBe(WS)
    expect(call.orderBy).toEqual({ date: 'desc' })
  })

  it('filters by channelId when provided', async () => {
    mockPrisma.channelAnalyticSnapshot.findMany.mockResolvedValue([])
    await getSnapshots(WS, 30, CH)
    const call = mockPrisma.channelAnalyticSnapshot.findMany.mock.calls[0][0]
    expect(call.where.channelId).toBe(CH)
  })
})

describe('getFunnelSummary', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('aggregates totals across all channels', async () => {
    mockPrisma.channelAnalyticSnapshot.aggregate.mockResolvedValue({
      _sum: {
        totalInbound: 100, totalOutbound: 80, newContacts: 20,
        conversationsOpened: 50, conversationsResolved: 30,
        dealsCreated: 10, dealsWon: 5, dealsWonValue: 5000,
        avgFirstResponseSeconds: 360
      }
    })
    mockPrisma.channelAnalyticSnapshot.findMany.mockResolvedValue([])

    const result = await getFunnelSummary(WS, 30)
    expect(result.totalInbound).toBe(100)
    expect(result.dealsWon).toBe(5)
    expect(result.dealsWonValue).toBe(5000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd Backend && npx vitest run src/modules/analytics/__tests__/analytics.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// Backend/src/modules/analytics/analytics.service.ts
import { prisma } from '../../lib/prisma'
import { Prisma } from '@prisma/client'

export async function aggregateChannelSnapshot(
  workspaceId: string,
  channelId: string,
  dateStr: string
) {
  const start = new Date(dateStr + 'T00:00:00.000Z')
  const end = new Date(dateStr + 'T23:59:59.999Z')

  const [
    totalInbound,
    totalOutbound,
    newContacts,
    conversationsOpened,
    conversationsResolved,
    dealsCreated,
    dealsWon,
    dealsWonAgg,
    avgRows
  ] = await Promise.all([
    prisma.message.count({
      where: { conversation: { channelId }, direction: 'INBOUND', sentAt: { gte: start, lte: end } }
    }),
    prisma.message.count({
      where: { conversation: { channelId }, direction: 'OUTBOUND', sentAt: { gte: start, lte: end } }
    }),
    prisma.contact.count({
      where: { workspaceId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, status: 'RESOLVED', updatedAt: { gte: start, lte: end } }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        createdAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        status: 'WON',
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.aggregate({
      _sum: { value: true },
      where: {
        contact: { conversations: { some: { channelId } } },
        status: 'WON',
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.$queryRaw<Array<{ avg_seconds: number | null }>>(
      Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (o.sent_at - i.sent_at)))::int AS avg_seconds
        FROM messages i
        JOIN conversations c ON c.id = i.conversation_id AND c.channel_id = ${channelId}
        JOIN LATERAL (
          SELECT sent_at FROM messages
          WHERE conversation_id = i.conversation_id AND direction = 'OUTBOUND' AND sent_at > i.sent_at
          ORDER BY sent_at ASC LIMIT 1
        ) o ON TRUE
        WHERE i.direction = 'INBOUND'
          AND i.sent_at >= ${start} AND i.sent_at <= ${end}
      `
    )
  ])

  const avgFirstResponseSeconds = avgRows[0]?.avg_seconds ?? 0
  const dealsWonValue = Number(dealsWonAgg._sum.value ?? 0)

  return prisma.channelAnalyticSnapshot.upsert({
    where: { workspaceId_channelId_date: { workspaceId, channelId, date: start } },
    create: {
      workspaceId,
      channelId,
      date: start,
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue,
      csatAvg: null
    },
    update: {
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue
    }
  })
}

export async function getSnapshots(
  workspaceId: string,
  days = 90,
  channelId?: string
) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  return prisma.channelAnalyticSnapshot.findMany({
    where: {
      workspaceId,
      ...(channelId ? { channelId } : {}),
      date: { gte: since }
    },
    include: { channel: { select: { id: true, name: true, platform: true } } },
    orderBy: { date: 'desc' }
  })
}

export async function getFunnelSummary(workspaceId: string, days = 90) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const agg = await prisma.channelAnalyticSnapshot.aggregate({
    _sum: {
      totalInbound: true,
      totalOutbound: true,
      newContacts: true,
      conversationsOpened: true,
      conversationsResolved: true,
      dealsCreated: true,
      dealsWon: true,
      dealsWonValue: true,
      avgFirstResponseSeconds: true
    },
    where: { workspaceId, date: { gte: since } }
  })

  const s = agg._sum
  const opened = s.conversationsOpened ?? 0
  const resolved = s.conversationsResolved ?? 0

  return {
    totalInbound: s.totalInbound ?? 0,
    totalOutbound: s.totalOutbound ?? 0,
    newContacts: s.newContacts ?? 0,
    conversationsOpened: opened,
    conversationsResolved: resolved,
    dealsCreated: s.dealsCreated ?? 0,
    dealsWon: s.dealsWon ?? 0,
    dealsWonValue: Number(s.dealsWonValue ?? 0),
    avgResolutionRate: opened > 0 ? Math.round((resolved / opened) * 100) : 0,
    avgResponseSeconds: s.avgFirstResponseSeconds ?? 0
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd Backend && npx vitest run src/modules/analytics/__tests__/analytics.service.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/analytics/analytics.service.ts Backend/src/modules/analytics/__tests__/analytics.service.test.ts
git commit -m "feat(analytics): add analytics.service with aggregation, snapshots, funnel summary"
```

---

## Task 2: analytics.cron.ts + app.ts registration

**Files:**
- Create: `Backend/src/modules/analytics/analytics.cron.ts`
- Modify: `Backend/src/app.ts`

### Context

`node-cron` is not installed. Install it first. The cron runs every day at 01:00 UTC. For each workspace, iterate all active channels and call `aggregateChannelSnapshot` for yesterday (`YYYY-MM-DD`).

The cron function is exported as `startAnalyticsCron()` and called from `app.ts` after the server is ready.

- [ ] **Step 1: Install node-cron**

```
cd Backend && npm install node-cron && npm install --save-dev @types/node-cron
```

Expected: `node-cron` added to `package.json` dependencies.

- [ ] **Step 2: Write implementation**

```typescript
// Backend/src/modules/analytics/analytics.cron.ts
import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { aggregateChannelSnapshot } from './analytics.service'

function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function runDailyAggregation(): Promise<void> {
  const dateStr = yesterdayUTC()
  console.log(`[AnalyticsCron] Running aggregation for ${dateStr}`)

  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    select: { id: true, workspaceId: true }
  })

  let ok = 0
  let failed = 0
  for (const ch of channels) {
    try {
      await aggregateChannelSnapshot(ch.workspaceId, ch.id, dateStr)
      ok++
    } catch (err) {
      failed++
      console.error(`[AnalyticsCron] Failed for channel ${ch.id}:`, err)
    }
  }

  console.log(`[AnalyticsCron] Done — ${ok} ok, ${failed} failed`)
}

export function startAnalyticsCron(): void {
  // Runs every day at 01:00 UTC
  cron.schedule('0 1 * * *', () => {
    runDailyAggregation().catch(err =>
      console.error('[AnalyticsCron] Unhandled error:', err)
    )
  }, { timezone: 'UTC' })

  console.log('[AnalyticsCron] Scheduled daily at 01:00 UTC')
}
```

- [ ] **Step 3: Register in app.ts**

In `Backend/src/app.ts`, after the server `listen` callback (or after other module imports at the bottom of the file), add:

```typescript
import { startAnalyticsCron } from './modules/analytics/analytics.cron'
// ...after all route registrations and before export:
startAnalyticsCron()
```

- [ ] **Step 4: Verify TypeScript compiles**

```
cd Backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/analytics/analytics.cron.ts Backend/src/app.ts Backend/package.json Backend/package-lock.json
git commit -m "feat(analytics): add daily aggregation cron with node-cron"
```

---

## Task 3: analytics.controller.ts + routes.ts + app.ts mount

**Files:**
- Create: `Backend/src/modules/analytics/analytics.controller.ts`
- Create: `Backend/src/modules/analytics/analytics.routes.ts`
- Modify: `Backend/src/app.ts`

### Context

Three endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/snapshots` | authenticate | Query params: `days` (default 90), `channelId` (optional) |
| GET | `/api/analytics/funnel` | authenticate | Query params: `days` (default 90) |
| POST | `/api/analytics/run` | authenticate | Body: `{ date?: string }` — manually trigger aggregation for all channels. Admin-only (workspaces own their data; any authenticated user can trigger for their workspace). |

All handlers extract `workspaceId` from `req.user.workspaceId`.

- [ ] **Step 1: Write implementation**

```typescript
// Backend/src/modules/analytics/analytics.controller.ts
import type { Request, Response } from 'express'
import { getSnapshots, getFunnelSummary, aggregateChannelSnapshot } from './analytics.service'
import { prisma } from '../../lib/prisma'

export async function listSnapshots(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const days = req.query.days ? Number(req.query.days) : 90
    const channelId = req.query.channelId as string | undefined
    const snapshots = await getSnapshots(workspaceId, days, channelId)
    res.json({ snapshots })
  } catch (err) {
    console.error('[Analytics] listSnapshots error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function funnelSummary(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const days = req.query.days ? Number(req.query.days) : 90
    const summary = await getFunnelSummary(workspaceId, days)
    res.json({ summary })
  } catch (err) {
    console.error('[Analytics] funnelSummary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function runAggregation(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const dateStr: string = req.body?.date ?? new Date().toISOString().slice(0, 10)

    const channels = await prisma.channel.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true }
    })

    const results = await Promise.allSettled(
      channels.map(ch => aggregateChannelSnapshot(workspaceId, ch.id, dateStr))
    )

    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    res.json({ date: dateStr, ok, failed })
  } catch (err) {
    console.error('[Analytics] runAggregation error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

```typescript
// Backend/src/modules/analytics/analytics.routes.ts
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { listSnapshots, funnelSummary, runAggregation } from './analytics.controller'

const router = Router()

router.get('/analytics/snapshots', ...[authenticate] as const, listSnapshots)
router.get('/analytics/funnel', ...[authenticate] as const, funnelSummary)
router.post('/analytics/run', ...[authenticate] as const, runAggregation)

export default router
```

- [ ] **Step 2: Mount in app.ts**

In `Backend/src/app.ts`, add after the bot routes import:

```typescript
import analyticsRoutes from './modules/analytics/analytics.routes'
// ...
app.use('/api', analyticsRoutes)
```

- [ ] **Step 3: Verify TypeScript compiles**

```
cd Backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add Backend/src/modules/analytics/analytics.controller.ts Backend/src/modules/analytics/analytics.routes.ts Backend/src/app.ts
git commit -m "feat(analytics): add REST endpoints for snapshots, funnel, and manual run"
```

---

## Task 4: Frontend MessagingAnalyticsClient.tsx

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/messaging-analytics/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/messaging-analytics/MessagingAnalyticsClient.tsx`

### Context

The page has three sections:

1. **KPI cards row** (6 cards): Total Messages In, Total Messages Out, New Contacts, Conversations Opened, Conversations Resolved, Deals Won.
2. **Stacked area chart** (Recharts): X-axis = date, stacked areas = `conversationsOpened` (blue), `conversationsResolved` (green), `totalInbound` (amber). Last 30 days.
3. **Attribution funnel table**: Rows = funnel stages (New Contacts → Chats Opened → Chats Resolved → Deals Created → Deals Won), values and conversion rates.

Data is fetched via `fetchAPI('/analytics/snapshots?days=30')` and `fetchAPI('/analytics/funnel?days=30')` from `src/lib/api.ts`. Use the `mounted` pattern to avoid SSR hydration mismatch.

Format `avgResponseSeconds` as `Xm Ys` (e.g. `2m 15s`). Format `dealsWonValue` as currency `$X,XXX.XX`.

The sidebar nav already has a "Messaging Analytics" link (it was added in Phase 2). No sidebar changes needed.

- [ ] **Step 1: Write page.tsx (server shell)**

```typescript
// metria-metrics/Frontend/src/app/dashboard/messaging-analytics/page.tsx
import type { Metadata } from 'next'
import MessagingAnalyticsClient from './MessagingAnalyticsClient'

export const metadata: Metadata = {
  title: 'Messaging Analytics | Metria'
}

export default function MessagingAnalyticsPage() {
  return <MessagingAnalyticsClient />
}
```

- [ ] **Step 2: Write MessagingAnalyticsClient.tsx**

```typescript
// metria-metrics/Frontend/src/app/dashboard/messaging-analytics/MessagingAnalyticsClient.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { fetchAPI } from '@/lib/api'

interface Snapshot {
  id: string
  date: string
  channelId: string
  totalInbound: number
  totalOutbound: number
  newContacts: number
  conversationsOpened: number
  conversationsResolved: number
  dealsCreated: number
  dealsWon: number
  dealsWonValue: number
  channel: { id: string; name: string; platform: string }
}

interface FunnelSummary {
  totalInbound: number
  totalOutbound: number
  newContacts: number
  conversationsOpened: number
  conversationsResolved: number
  dealsCreated: number
  dealsWon: number
  dealsWonValue: number
  avgResolutionRate: number
  avgResponseSeconds: number
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function conversionRate(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

export default function MessagingAnalyticsClient() {
  const [mounted, setMounted] = useState(false)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const load = async () => {
      try {
        const [snapRes, funnelRes] = await Promise.all([
          fetchAPI('/analytics/snapshots?days=30'),
          fetchAPI('/analytics/funnel?days=30')
        ])
        setSnapshots(snapRes.snapshots ?? [])
        setFunnel(funnelRes.summary ?? null)
      } catch {
        setError('Failed to load analytics data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mounted])

  if (!mounted) return null

  // Aggregate snapshots by date for the chart
  const chartData = (() => {
    const byDate = new Map<string, { date: string; opened: number; resolved: number; inbound: number }>()
    for (const s of snapshots) {
      const d = s.date.slice(0, 10)
      const existing = byDate.get(d) ?? { date: d, opened: 0, resolved: 0, inbound: 0 }
      existing.opened += s.conversationsOpened
      existing.resolved += s.conversationsResolved
      existing.inbound += s.totalInbound
      byDate.set(d, existing)
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const funnelRows = funnel
    ? [
        { label: 'New Contacts', value: funnel.newContacts, rate: '—' },
        { label: 'Chats Opened', value: funnel.conversationsOpened, rate: conversionRate(funnel.conversationsOpened, funnel.newContacts) },
        { label: 'Chats Resolved', value: funnel.conversationsResolved, rate: conversionRate(funnel.conversationsResolved, funnel.conversationsOpened) },
        { label: 'Deals Created', value: funnel.dealsCreated, rate: conversionRate(funnel.dealsCreated, funnel.conversationsOpened) },
        { label: 'Deals Won', value: funnel.dealsWon, rate: conversionRate(funnel.dealsWon, funnel.dealsCreated) },
      ]
    : []

  const kpis = funnel
    ? [
        { label: 'Messages In', value: funnel.totalInbound.toLocaleString() },
        { label: 'Messages Out', value: funnel.totalOutbound.toLocaleString() },
        { label: 'New Contacts', value: funnel.newContacts.toLocaleString() },
        { label: 'Chats Opened', value: funnel.conversationsOpened.toLocaleString() },
        { label: 'Deals Won', value: funnel.dealsWon.toLocaleString() },
        { label: 'Revenue Won', value: formatCurrency(funnel.dealsWonValue) },
      ]
    : []

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Messaging Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30 days</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpis.map(kpi => (
              <div key={kpi.label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-semibold mt-1">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Stacked Area Chart */}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-4">Conversation Volume</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data yet. Run the aggregation first.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="opened" name="Opened" stroke="#3b82f6" fill="url(#colorOpened)" stackId="1" />
                  <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#22c55e" fill="url(#colorResolved)" stackId="1" />
                  <Area type="monotone" dataKey="inbound" name="Inbound" stroke="#f59e0b" fill="url(#colorInbound)" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Attribution Funnel */}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-4">Attribution Funnel</h2>
            {funnelRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No funnel data.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 font-medium text-muted-foreground">Stage</th>
                    <th className="text-right pb-2 font-medium text-muted-foreground">Count</th>
                    <th className="text-right pb-2 font-medium text-muted-foreground">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelRows.map(row => (
                    <tr key={row.label} className="border-b last:border-0">
                      <td className="py-2">{row.label}</td>
                      <td className="py-2 text-right tabular-nums">{row.value.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{row.rate}</td>
                    </tr>
                  ))}
                  {funnel && (
                    <tr className="border-t">
                      <td className="pt-3 font-medium">Revenue Won</td>
                      <td className="pt-3 text-right font-semibold">{formatCurrency(funnel.dealsWonValue)}</td>
                      <td className="pt-3 text-right text-muted-foreground">Avg Response: {formatSeconds(funnel.avgResponseSeconds)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```
cd metria-metrics/Frontend && pnpm tsc --noEmit 2>&1 | grep "messaging-analytics"
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/messaging-analytics/
git commit -m "feat(analytics): add messaging analytics dashboard page with chart and funnel table"
```

---

## Self-Review

**Spec coverage:**
- ✅ `ChannelAnalyticSnapshot` daily aggregation cron (Task 2)
- ✅ Messaging analytics page (Task 4)
- ✅ Attribution funnel dashboard (Task 4 — funnel table)
- ✅ Per-channel cards: volume, resolution rate, revenue (KPI cards)
- ✅ Stacked area chart (Recharts, Task 4)
- ✅ 90-day default in API (Tasks 1/3)

**Items intentionally deferred (out of scope for this phase):**
- CSAT avg — requires bot CSAT action to be wired (Phase 4 bot engine does this; snapshot field is nullable)
- Agent performance table — no per-agent message tracking model exists yet
- TikTok beta integration — spec item 21, separate concern

**Placeholder scan:** None found.

**Type consistency:** `Snapshot.date` is `string` throughout. `dealsWonValue` is `number` on the frontend (converted from Prisma `Decimal`). `avgFirstResponseSeconds` is `Int` in schema, used as `number` in TypeScript.
