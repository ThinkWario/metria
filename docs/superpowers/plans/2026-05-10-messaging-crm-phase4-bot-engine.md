# Messaging + CRM — Phase 4: Bot Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bot automation engine that matches inbound messages against configurable flows and executes actions (send message, assign agent, create ticket, transfer to human) with a UI to manage bots and flows.

**Architecture:** A new `Backend/src/modules/bot/` module with three files — `bot.service.ts` (CRUD), `businessHours.service.ts` (config), and `flow.engine.ts` (trigger matching + action execution). The engine is wired into `message.service.ts` as a fire-and-forget call after each inbound message is persisted. Frontend has two pages: bot list and per-bot flow editor.

**Tech Stack:** Express 4, Prisma 5 (PostgreSQL), Vitest, Next.js 16 App Router, TypeScript, Tailwind CSS 4

**Spec reference:** `docs/superpowers/specs/2026-05-09-messaging-crm-design.md` (sections 14–17, lines 501–556)

**Prerequisite:** Phases 1–3 complete. All Prisma models exist: `BotAgent`, `BotFlow`, `BusinessHours`. `Conversation.isHandledByBot`, `Conversation.messageCount`, `Conversation.assignedToUserId` fields exist.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `Backend/src/modules/bot/bot.service.ts` | BotAgent + BotFlow CRUD |
| Create | `Backend/src/modules/bot/__tests__/bot.service.test.ts` | Tests |
| Create | `Backend/src/modules/bot/businessHours.service.ts` | BusinessHours config + isOutside helper |
| Create | `Backend/src/modules/bot/__tests__/businessHours.service.test.ts` | Tests |
| Create | `Backend/src/modules/bot/flow.engine.ts` | Trigger matching + action execution |
| Create | `Backend/src/modules/bot/__tests__/flow.engine.test.ts` | Tests |
| Create | `Backend/src/modules/bot/bot.controller.ts` | Express handlers |
| Create | `Backend/src/modules/bot/bot.routes.ts` | Route registration |
| Modify | `Backend/src/app.ts` | Mount bot routes |
| Modify | `Backend/src/modules/messaging/message.service.ts` | Wire FlowEngine (fire-and-forget) |
| Create | `metria-metrics/Frontend/src/app/dashboard/bots/page.tsx` | Server shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/bots/BotListClient.tsx` | Bot list + create |
| Create | `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/page.tsx` | Server shell |
| Create | `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/BotDetailClient.tsx` | Flow editor |

---

## Task 1: bot.service.ts

**Files:**
- Create: `Backend/src/modules/bot/bot.service.ts`
- Create: `Backend/src/modules/bot/__tests__/bot.service.test.ts`

### Context

CRUD for `BotAgent` (the bot identity) and `BotFlow` (the automation rule). A workspace can have multiple BotAgents, each with multiple BotFlows. All functions take `workspaceId` as first argument.

`BotFlow.actions` is a Prisma `Json` field — typed as `unknown[]` in the service. `BotFlow.channel` defaults to `'ALL'`. `BotFlow.priority` defaults to `100` (lower = higher priority).

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/bot/__tests__/bot.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    botAgent: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    botFlow: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  }
}))

import { listAgents, createAgent, updateAgent, deleteAgent, listFlows, createFlow, updateFlow, deleteFlow } from '../bot.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listAgents', () => {
  it('returns agents scoped to workspaceId', async () => {
    vi.mocked(prisma.botAgent.findMany).mockResolvedValue([])
    await listAgents(WS)
    expect(prisma.botAgent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
  })
})

describe('createAgent', () => {
  it('creates agent with workspaceId', async () => {
    vi.mocked(prisma.botAgent.create).mockResolvedValue({ id: 'a1', name: 'Bot 1' } as any)
    await createAgent(WS, { name: 'Bot 1' })
    expect(prisma.botAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, name: 'Bot 1' }) })
    )
  })
})

describe('updateAgent', () => {
  it('throws if agent not found', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(updateAgent(WS, 'a1', { name: 'New' })).rejects.toThrow('Agent not found')
  })

  it('updates agent fields', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botAgent.update).mockResolvedValue({ id: 'a1', isActive: false } as any)
    await updateAgent(WS, 'a1', { isActive: false })
    expect(prisma.botAgent.update).toHaveBeenCalledWith({ where: { id: 'a1', workspaceId: WS }, data: { isActive: false } })
  })
})

describe('deleteAgent', () => {
  it('throws if agent not found', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(deleteAgent(WS, 'a1')).rejects.toThrow('Agent not found')
  })

  it('deletes agent', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botAgent.delete).mockResolvedValue({} as any)
    await deleteAgent(WS, 'a1')
    expect(prisma.botAgent.delete).toHaveBeenCalledWith({ where: { id: 'a1' } })
  })
})

describe('listFlows', () => {
  it('throws if agent not in workspace', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(listFlows(WS, 'a1')).rejects.toThrow('Agent not found')
  })

  it('returns flows ordered by priority', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([])
    await listFlows(WS, 'a1')
    expect(prisma.botFlow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priority: 'asc' } })
    )
  })
})

describe('createFlow', () => {
  it('creates flow with channel=ALL and priority=100 by default', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.botFlow.create).mockResolvedValue({ id: 'f1' } as any)
    await createFlow(WS, 'a1', { name: 'Bienvenida', triggerType: 'FIRST_MESSAGE', actions: [] })
    expect(prisma.botFlow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'ALL', priority: 100 })
      })
    )
  })

  it('throws if agent not in workspace', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue(null)
    await expect(createFlow(WS, 'a1', { name: 'x', triggerType: 'KEYWORD', actions: [] })).rejects.toThrow('Agent not found')
  })
})

describe('updateFlow', () => {
  it('throws if flow not found', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue(null)
    await expect(updateFlow(WS, 'f1', { isActive: false })).rejects.toThrow('Flow not found')
  })

  it('updates flow fields', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue({ id: 'f1' } as any)
    vi.mocked(prisma.botFlow.update).mockResolvedValue({} as any)
    await updateFlow(WS, 'f1', { isActive: false })
    expect(prisma.botFlow.update).toHaveBeenCalledWith({ where: { id: 'f1', workspaceId: WS }, data: { isActive: false } })
  })
})

describe('deleteFlow', () => {
  it('throws if flow not found', async () => {
    vi.mocked(prisma.botFlow.findFirst).mockResolvedValue(null)
    await expect(deleteFlow(WS, 'f1')).rejects.toThrow('Flow not found')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```
cd Backend && npx vitest run src/modules/bot/__tests__/bot.service.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../bot.service'`

- [ ] **Step 3: Create bot.service.ts**

Create `Backend/src/modules/bot/bot.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'

export async function listAgents(workspaceId: string) {
  return prisma.botAgent.findMany({
    where: { workspaceId },
    include: { _count: { select: { flows: true } } },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createAgent(
  workspaceId: string,
  data: { name: string; description?: string; avatarUrl?: string }
) {
  return prisma.botAgent.create({ data: { workspaceId, ...data } })
}

export async function updateAgent(
  workspaceId: string,
  agentId: string,
  data: { name?: string; isActive?: boolean; description?: string }
) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botAgent.update({ where: { id: agentId, workspaceId }, data })
}

export async function deleteAgent(workspaceId: string, agentId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  await prisma.botAgent.delete({ where: { id: agentId } })
}

export async function listFlows(workspaceId: string, botAgentId: string) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botFlow.findMany({
    where: { botAgentId, workspaceId },
    orderBy: { priority: 'asc' }
  })
}

export interface CreateFlowData {
  name: string
  triggerType: string
  triggerValue?: string
  channel?: string
  actions: unknown[]
  priority?: number
}

export async function createFlow(
  workspaceId: string,
  botAgentId: string,
  data: CreateFlowData
) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } })
  if (!agent) throw new Error('Agent not found')
  return prisma.botFlow.create({
    data: {
      workspaceId,
      botAgentId,
      name: data.name,
      triggerType: data.triggerType,
      triggerValue: data.triggerValue,
      channel: data.channel ?? 'ALL',
      actions: data.actions,
      priority: data.priority ?? 100
    }
  })
}

export async function updateFlow(
  workspaceId: string,
  flowId: string,
  data: Partial<CreateFlowData> & { isActive?: boolean }
) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } })
  if (!flow) throw new Error('Flow not found')
  return prisma.botFlow.update({ where: { id: flowId, workspaceId }, data })
}

export async function deleteFlow(workspaceId: string, flowId: string) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } })
  if (!flow) throw new Error('Flow not found')
  await prisma.botFlow.delete({ where: { id: flowId } })
}
```

- [ ] **Step 4: Run tests**

```
cd Backend && npx vitest run src/modules/bot/__tests__/bot.service.test.ts 2>&1 | tail -10
```
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```
git add Backend/src/modules/bot/bot.service.ts "Backend/src/modules/bot/__tests__/bot.service.test.ts"
git commit -m "feat: bot.service — BotAgent + BotFlow CRUD"
```

---

## Task 2: businessHours.service.ts

**Files:**
- Create: `Backend/src/modules/bot/businessHours.service.ts`
- Create: `Backend/src/modules/bot/__tests__/businessHours.service.test.ts`

### Context

`BusinessHours` has `@@unique([workspaceId])` — one record per workspace. Day fields (monday–sunday) are JSON with shape `{ open: "HH:MM", close: "HH:MM", enabled: boolean }`. The `isOutsideBusinessHours` function uses `Date.toLocaleString` with the workspace's timezone to get the local time.

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/bot/__tests__/businessHours.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    businessHours: { findUnique: vi.fn(), upsert: vi.fn() }
  }
}))

import { getBusinessHours, upsertBusinessHours, isOutsideBusinessHours } from '../businessHours.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

const DEFAULT_BH = {
  workspaceId: WS,
  timezone: 'America/Santiago',
  monday: { open: '09:00', close: '18:00', enabled: true },
  tuesday: { open: '09:00', close: '18:00', enabled: true },
  wednesday: { open: '09:00', close: '18:00', enabled: true },
  thursday: { open: '09:00', close: '18:00', enabled: true },
  friday: { open: '09:00', close: '18:00', enabled: true },
  saturday: { open: '09:00', close: '14:00', enabled: false },
  sunday: { open: '09:00', close: '14:00', enabled: false },
  outsideMessage: null
}

beforeEach(() => vi.clearAllMocks())

describe('getBusinessHours', () => {
  it('fetches by workspaceId unique key', async () => {
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(DEFAULT_BH as any)
    const result = await getBusinessHours(WS)
    expect(prisma.businessHours.findUnique).toHaveBeenCalledWith({ where: { workspaceId: WS } })
    expect(result).toEqual(DEFAULT_BH)
  })

  it('returns null when not configured', async () => {
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(null)
    expect(await getBusinessHours(WS)).toBeNull()
  })
})

describe('upsertBusinessHours', () => {
  it('upserts with workspaceId as unique key', async () => {
    vi.mocked(prisma.businessHours.upsert).mockResolvedValue(DEFAULT_BH as any)
    await upsertBusinessHours(WS, { timezone: 'America/Bogota' })
    expect(prisma.businessHours.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    )
  })
})

describe('isOutsideBusinessHours', () => {
  it('returns true when day is disabled (saturday)', () => {
    const bh = { ...DEFAULT_BH, saturday: { open: '09:00', close: '14:00', enabled: false } }
    // Saturday 10:00 UTC → in America/Santiago it's UTC-3 so 07:00 (still Saturday)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-11T13:00:00Z')) // Saturday 10:00 AM Santiago (-3)
    expect(isOutsideBusinessHours(bh)).toBe(true)
    vi.useRealTimers()
  })

  it('returns false during business hours on a weekday', () => {
    // Monday 2025-01-06, 14:00 UTC = 11:00 AM Santiago (UTC-3, inside 09:00–18:00)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T14:00:00Z'))
    const bh = { ...DEFAULT_BH }
    expect(isOutsideBusinessHours(bh)).toBe(false)
    vi.useRealTimers()
  })

  it('returns true before open hour', () => {
    // Monday 2025-01-06, 11:00 UTC = 08:00 AM Santiago (before 09:00 open)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T11:00:00Z'))
    expect(isOutsideBusinessHours(DEFAULT_BH)).toBe(true)
    vi.useRealTimers()
  })

  it('returns true after close hour', () => {
    // Monday 2025-01-06, 22:00 UTC = 19:00 Santiago (after 18:00 close)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-06T22:00:00Z'))
    expect(isOutsideBusinessHours(DEFAULT_BH)).toBe(true)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```
cd Backend && npx vitest run src/modules/bot/__tests__/businessHours.service.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../businessHours.service'`

- [ ] **Step 3: Create businessHours.service.ts**

Create `Backend/src/modules/bot/businessHours.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'

interface DaySchedule {
  open: string
  close: string
  enabled: boolean
}

type BusinessHoursRecord = {
  workspaceId: string
  timezone: string
  monday: DaySchedule | unknown
  tuesday: DaySchedule | unknown
  wednesday: DaySchedule | unknown
  thursday: DaySchedule | unknown
  friday: DaySchedule | unknown
  saturday: DaySchedule | unknown
  sunday: DaySchedule | unknown
  outsideMessage: string | null
}

export async function getBusinessHours(workspaceId: string) {
  return prisma.businessHours.findUnique({ where: { workspaceId } })
}

export async function upsertBusinessHours(
  workspaceId: string,
  data: {
    timezone?: string
    monday?: DaySchedule
    tuesday?: DaySchedule
    wednesday?: DaySchedule
    thursday?: DaySchedule
    friday?: DaySchedule
    saturday?: DaySchedule
    sunday?: DaySchedule
    outsideMessage?: string
  }
) {
  return prisma.businessHours.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data
  })
}

export function isOutsideBusinessHours(bh: BusinessHoursRecord): boolean {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: bh.timezone }))
  const dayName = days[localDate.getDay()]
  const schedule = bh[dayName as keyof BusinessHoursRecord] as DaySchedule
  if (!schedule || !schedule.enabled) return true
  const hh = localDate.getHours().toString().padStart(2, '0')
  const mm = localDate.getMinutes().toString().padStart(2, '0')
  const timeStr = `${hh}:${mm}`
  return timeStr < schedule.open || timeStr >= schedule.close
}
```

- [ ] **Step 4: Run tests**

```
cd Backend && npx vitest run src/modules/bot/__tests__/businessHours.service.test.ts 2>&1 | tail -10
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```
git add Backend/src/modules/bot/businessHours.service.ts "Backend/src/modules/bot/__tests__/businessHours.service.test.ts"
git commit -m "feat: businessHours.service — config CRUD + outside-hours helper"
```

---

## Task 3: flow.engine.ts

**Files:**
- Create: `Backend/src/modules/bot/flow.engine.ts`
- Create: `Backend/src/modules/bot/__tests__/flow.engine.test.ts`

### Context

`tryRunBotFlows` is the public entry point. It loads all active BotFlows for the workspace, iterates in priority order (lower number = higher priority), finds the first trigger match, and executes all actions for that flow.

**Trigger types implemented:**
- `FIRST_MESSAGE`: fires when `conversation.messageCount === 1`
- `KEYWORD`: fires when `content.toLowerCase().includes(triggerValue.toLowerCase())`
- `BUSINESS_HRS`: fires when current time is outside workspace business hours

**Action types implemented:**
- `send_message`: interpolates `{nombre}` / `{agente_nombre}` vars, sends via appropriate channel API, stores outbound Message in DB
- `assign_agent`: updates `conversation.assignedToUserId`
- `create_ticket`: calls `createTicket()` from ticket.service
- `wait_human`: sets `conversation.isHandledByBot = false`
- `update_stage`: calls `updateContact()` with new `status`
- `send_csat`: sends "¿Cómo calificarías nuestra atención? Responde del 1 al 5." message

**Conversation shape expected** (passed from message.service.ts after the messageCount increment):
```typescript
{
  id, workspaceId, channelId, contactId, externalId,
  messageCount, isHandledByBot, assignedToUserId,
  channel: { platform, config }
}
```

`Channel.config` JSON shape per platform:
- WHATSAPP: `{ phoneNumberId, accessToken }`
- INSTAGRAM: `{ pageAccessToken }`
- TELEGRAM: `{ botToken }`

The `message.create` call for outbound bot messages must include `senderType: 'BOT'`. Read `Backend/prisma/schema.prisma` for the `Message` model fields to ensure the create call is valid.

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/bot/__tests__/flow.engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    botFlow: { findMany: vi.fn() },
    conversation: { update: vi.fn() },
    contact: { findUnique: vi.fn() },
    message: { create: vi.fn() },
    businessHours: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() }
  }
}))
vi.mock('../../messaging/channels/whatsapp.service', () => ({ sendWhatsAppMessage: vi.fn() }))
vi.mock('../../messaging/channels/instagram.service', () => ({ sendInstagramMessage: vi.fn() }))
vi.mock('../../messaging/channels/telegram.service', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('../../crm/ticket.service', () => ({ createTicket: vi.fn() }))
vi.mock('../../crm/contact.service', () => ({ updateContact: vi.fn() }))
vi.mock('../businessHours.service', () => ({ isOutsideBusinessHours: vi.fn() }))

import { tryRunBotFlows } from '../flow.engine'
import { prisma } from '../../../lib/prisma'
import { sendWhatsAppMessage } from '../../messaging/channels/whatsapp.service'
import { createTicket } from '../../crm/ticket.service'
import { updateContact } from '../../crm/contact.service'
import { isOutsideBusinessHours } from '../businessHours.service'

const WS = 'ws-1'
const CH = 'ch-1'

const makeConv = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1', workspaceId: WS, channelId: CH, contactId: 'ct-1',
  externalId: '+56912345678', messageCount: 1, isHandledByBot: true,
  assignedToUserId: null,
  channel: { platform: 'WHATSAPP', config: { phoneNumberId: 'ph-1', accessToken: 'tok' } },
  ...overrides
})

const makeFlow = (overrides: Record<string, unknown> = {}) => ({
  id: 'f1', workspaceId: WS, channel: 'ALL', isActive: true,
  triggerType: 'KEYWORD', triggerValue: 'hola', priority: 100,
  actions: [{ type: 'send_message', content: 'Hola {nombre}!' }],
  botAgent: { isActive: true },
  ...overrides
})

beforeEach(() => vi.clearAllMocks())

describe('tryRunBotFlows', () => {
  it('skips entirely when isHandledByBot is false', async () => {
    await tryRunBotFlows(WS, CH, makeConv({ isHandledByBot: false }))
    expect(prisma.botFlow.findMany).not.toHaveBeenCalled()
  })

  it('sends interpolated message on KEYWORD match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([makeFlow()] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({} as any)
    vi.mocked(sendWhatsAppMessage as any).mockResolvedValue(undefined)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola cómo están')

    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph-1', 'tok', '+56912345678', 'Hola Ana!')
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'OUTBOUND', senderType: 'BOT' }) })
    )
  })

  it('does not send when KEYWORD does not match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([makeFlow({ triggerValue: 'precio' })] as any)
    await tryRunBotFlows(WS, CH, makeConv(), 'hola')
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('matches FIRST_MESSAGE when messageCount === 1', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'FIRST_MESSAGE', triggerValue: null, actions: [{ type: 'wait_human' }] })
    ] as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({} as any)

    await tryRunBotFlows(WS, CH, makeConv({ messageCount: 1 }))

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHandledByBot: false }) })
    )
  })

  it('skips FIRST_MESSAGE when messageCount > 1', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'FIRST_MESSAGE', triggerValue: null, actions: [{ type: 'wait_human' }] })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv({ messageCount: 3 }))

    expect(prisma.conversation.update).not.toHaveBeenCalled()
  })

  it('fires BUSINESS_HRS flow when outside hours', async () => {
    const bh = { workspaceId: WS, timezone: 'America/Santiago' }
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'BUSINESS_HRS', triggerValue: null, actions: [{ type: 'send_message', content: 'Estamos cerrados' }] })
    ] as any)
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(bh as any)
    vi.mocked(isOutsideBusinessHours as any).mockReturnValue(true)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({} as any)
    vi.mocked(sendWhatsAppMessage as any).mockResolvedValue(undefined)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph-1', 'tok', '+56912345678', 'Estamos cerrados')
  })

  it('creates ticket on create_ticket action', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ actions: [{ type: 'create_ticket', priority: 'HIGH' }] })
    ] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(createTicket as any).mockResolvedValue({})

    await tryRunBotFlows(WS, CH, makeConv(), 'tengo un reclamo')

    expect(createTicket).toHaveBeenCalledWith(
      WS, expect.objectContaining({ contactId: 'ct-1', priority: 'HIGH' })
    )
  })

  it('calls updateContact on update_stage action', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ actions: [{ type: 'update_stage', status: 'CUSTOMER' }] })
    ] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(updateContact as any).mockResolvedValue({})

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(updateContact).toHaveBeenCalledWith(WS, 'ct-1', { status: 'CUSTOMER' })
  })

  it('stops at first matching flow (first wins)', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ id: 'f1', priority: 100, actions: [{ type: 'wait_human' }] }),
      makeFlow({ id: 'f2', priority: 200, actions: [{ type: 'create_ticket', priority: 'LOW' }] })
    ] as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({} as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(prisma.conversation.update).toHaveBeenCalledTimes(1)
    expect(createTicket).not.toHaveBeenCalled()
  })

  it('skips flow if botAgent is inactive', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ botAgent: { isActive: false } })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('skips flow if channel filter does not match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ channel: 'TELEGRAM' })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv({ channel: { platform: 'WHATSAPP', config: {} } }), 'hola')

    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```
cd Backend && npx vitest run src/modules/bot/__tests__/flow.engine.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../flow.engine'`

- [ ] **Step 3: Create flow.engine.ts**

Before writing: read `Backend/prisma/schema.prisma` lines around the `Message` model to confirm the exact fields available for `prisma.message.create`. Specifically check if `senderType` is a valid field.

Create `Backend/src/modules/bot/flow.engine.ts`:

```typescript
import { prisma } from '../../lib/prisma'
import { sendWhatsAppMessage } from '../messaging/channels/whatsapp.service'
import { sendInstagramMessage } from '../messaging/channels/instagram.service'
import { sendTelegramMessage } from '../messaging/channels/telegram.service'
import { createTicket } from '../crm/ticket.service'
import { updateContact } from '../crm/contact.service'
import { isOutsideBusinessHours } from './businessHours.service'

interface ActionDef {
  type: 'send_message' | 'assign_agent' | 'create_ticket' | 'wait_human' | 'update_stage' | 'send_csat'
  content?: string
  userId?: string
  priority?: string
  status?: string
}

interface ConversationSnap {
  id: string
  workspaceId: string
  channelId: string
  contactId: string | null
  externalId: string
  messageCount: number
  isHandledByBot: boolean
  assignedToUserId: string | null
  channel: { platform: string; config: unknown }
}

export async function tryRunBotFlows(
  workspaceId: string,
  channelId: string,
  conversation: ConversationSnap,
  content?: string
): Promise<void> {
  if (!conversation.isHandledByBot) return

  const flows = await prisma.botFlow.findMany({
    where: { workspaceId, isActive: true },
    include: { botAgent: { select: { isActive: true } } },
    orderBy: { priority: 'asc' }
  })

  for (const flow of flows) {
    if (!flow.botAgent.isActive) continue
    if (flow.channel !== 'ALL' && flow.channel !== conversation.channel.platform) continue
    if (!(await matchesTrigger(flow, conversation, content))) continue
    await executeActions(workspaceId, conversation, flow.actions as ActionDef[])
    return
  }
}

async function matchesTrigger(
  flow: { triggerType: string; triggerValue: string | null; workspaceId: string },
  conversation: ConversationSnap,
  content?: string
): Promise<boolean> {
  switch (flow.triggerType) {
    case 'FIRST_MESSAGE':
      return conversation.messageCount === 1
    case 'KEYWORD':
      if (!flow.triggerValue || !content) return false
      return content.toLowerCase().includes(flow.triggerValue.toLowerCase())
    case 'BUSINESS_HRS': {
      const bh = await prisma.businessHours.findUnique({ where: { workspaceId: flow.workspaceId } })
      if (!bh) return false
      return isOutsideBusinessHours(bh)
    }
    default:
      return false
  }
}

async function resolveVariables(conversation: ConversationSnap): Promise<Record<string, string>> {
  const contact = conversation.contactId
    ? await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } })
    : null
  const assignedUser = conversation.assignedToUserId
    ? await prisma.user.findUnique({ where: { id: conversation.assignedToUserId }, select: { name: true } })
    : null
  return {
    '{nombre}': contact?.name ?? 'Cliente',
    '{agente_nombre}': assignedUser?.name ?? 'nuestro equipo'
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), template)
}

async function sendBotMessage(
  workspaceId: string,
  conversation: ConversationSnap,
  text: string
): Promise<void> {
  const config = conversation.channel.config as Record<string, string>
  switch (conversation.channel.platform) {
    case 'WHATSAPP':
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conversation.externalId, text)
      break
    case 'INSTAGRAM':
      await sendInstagramMessage(config.pageAccessToken, conversation.externalId, text)
      break
    case 'TELEGRAM':
      await sendTelegramMessage(config.botToken, conversation.externalId, text)
      break
  }
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'BOT',
      content: text
    }
  })
}

async function executeActions(
  workspaceId: string,
  conversation: ConversationSnap,
  actions: ActionDef[]
): Promise<void> {
  const vars = await resolveVariables(conversation)

  for (const action of actions) {
    switch (action.type) {
      case 'send_message': {
        if (!action.content) break
        await sendBotMessage(workspaceId, conversation, interpolate(action.content, vars))
        break
      }
      case 'assign_agent': {
        if (!action.userId) break
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { assignedToUserId: action.userId }
        })
        break
      }
      case 'create_ticket': {
        if (!conversation.contactId) break
        await createTicket(workspaceId, {
          contactId: conversation.contactId,
          title: 'Ticket creado por bot',
          priority: action.priority ?? 'MEDIUM',
          conversationId: conversation.id
        })
        break
      }
      case 'wait_human': {
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { isHandledByBot: false }
        })
        break
      }
      case 'update_stage': {
        if (!conversation.contactId || !action.status) break
        await updateContact(workspaceId, conversation.contactId, { status: action.status })
        break
      }
      case 'send_csat': {
        await sendBotMessage(workspaceId, conversation, '¿Cómo calificarías nuestra atención? Responde del 1 al 5.')
        break
      }
    }
  }
}
```

- [ ] **Step 4: Run all bot tests**

```
cd Backend && npx vitest run src/modules/bot/ 2>&1 | tail -10
```
Expected: all tests PASS across 3 files

- [ ] **Step 5: Commit**

```
git add Backend/src/modules/bot/flow.engine.ts "Backend/src/modules/bot/__tests__/flow.engine.test.ts"
git commit -m "feat: flow.engine — trigger matching + action execution"
```

---

## Task 4: bot.controller.ts + bot.routes.ts + app.ts

**Files:**
- Create: `Backend/src/modules/bot/bot.controller.ts`
- Create: `Backend/src/modules/bot/bot.routes.ts`
- Modify: `Backend/src/app.ts`

### Context

The controller wraps service calls in try/catch. Error status: 'not found' → 404, else → 500. Routes mounted at `/api` in app.ts → full paths become `/api/bots/...`. All routes behind `authenticate + requirePlan('PRO','SCALE')`.

- [ ] **Step 1: Create bot.controller.ts**

Create `Backend/src/modules/bot/bot.controller.ts`:

```typescript
import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/auth'
import * as bs from './bot.service'
import * as bh from './businessHours.service'

function notFound(msg: string) {
  return msg.toLowerCase().includes('not found') ? 404 : 500
}

export async function listAgentsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listAgents(req.user!.workspaceId!))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function createAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, description, avatarUrl } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    res.status(201).json(await bs.createAgent(req.user!.workspaceId!, { name: name.trim(), description, avatarUrl }))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function updateAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.updateAgent(req.user!.workspaceId!, req.params.agentId, req.body))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function deleteAgentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await bs.deleteAgent(req.user!.workspaceId!, req.params.agentId)
    res.status(204).send()
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function listFlowsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.listFlows(req.user!.workspaceId!, req.params.agentId))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function createFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, triggerType, triggerValue, channel, actions, priority } = req.body
    if (!name?.trim() || !triggerType) { res.status(400).json({ error: 'name and triggerType are required' }); return }
    if (!Array.isArray(actions)) { res.status(400).json({ error: 'actions must be an array' }); return }
    res.status(201).json(await bs.createFlow(req.user!.workspaceId!, req.params.agentId, { name: name.trim(), triggerType, triggerValue, channel, actions, priority }))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function updateFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bs.updateFlow(req.user!.workspaceId!, req.params.flowId, req.body))
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function deleteFlowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    await bs.deleteFlow(req.user!.workspaceId!, req.params.flowId)
    res.status(204).send()
  } catch (err: any) { res.status(notFound(err.message)).json({ error: err.message }) }
}

export async function getBusinessHoursHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await bh.getBusinessHours(req.user!.workspaceId!)
    res.json(result ?? {})
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}

export async function upsertBusinessHoursHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await bh.upsertBusinessHours(req.user!.workspaceId!, req.body))
  } catch (err: any) { res.status(500).json({ error: err.message }) }
}
```

- [ ] **Step 2: Create bot.routes.ts**

Create `Backend/src/modules/bot/bot.routes.ts`:

```typescript
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  listAgentsHandler, createAgentHandler, updateAgentHandler, deleteAgentHandler,
  listFlowsHandler, createFlowHandler, updateFlowHandler, deleteFlowHandler,
  getBusinessHoursHandler, upsertBusinessHoursHandler
} from './bot.controller'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

router.get('/bots/agents', ...auth, listAgentsHandler)
router.post('/bots/agents', ...auth, createAgentHandler)
router.patch('/bots/agents/:agentId', ...auth, updateAgentHandler)
router.delete('/bots/agents/:agentId', ...auth, deleteAgentHandler)

router.get('/bots/agents/:agentId/flows', ...auth, listFlowsHandler)
router.post('/bots/agents/:agentId/flows', ...auth, createFlowHandler)
router.patch('/bots/flows/:flowId', ...auth, updateFlowHandler)
router.delete('/bots/flows/:flowId', ...auth, deleteFlowHandler)

router.get('/bots/business-hours', ...auth, getBusinessHoursHandler)
router.put('/bots/business-hours', ...auth, upsertBusinessHoursHandler)

export default router
```

- [ ] **Step 3: Mount in app.ts**

Read `Backend/src/app.ts`. Find the `import crmRoutes` line. Add immediately after it:

```typescript
import botRoutes from './modules/bot/bot.routes'
```

Find `app.use('/api', crmRoutes)`. Add immediately before it:

```typescript
app.use('/api', botRoutes)
```

- [ ] **Step 4: Build check**

```
cd Backend && npm run build 2>&1 | tail -5
```
Expected: `CJS ⚡️ Build success`

- [ ] **Step 5: Commit**

```
git add Backend/src/modules/bot/bot.controller.ts Backend/src/modules/bot/bot.routes.ts Backend/src/app.ts
git commit -m "feat: bot controller + routes — agents, flows, business hours"
```

---

## Task 5: Wire FlowEngine into message.service.ts

**Files:**
- Modify: `Backend/src/modules/messaging/message.service.ts`

### Context

`processInboundMessage` already exists. The hook goes after the `prisma.conversation.update({ messageCount: increment(1) })` call. The update returns the updated conversation — use its result to pass the incremented messageCount to `tryRunBotFlows`.

The call is **fire-and-forget** with `.catch()` so the webhook returns 200 immediately. The channel with its config must be available on the conversation object passed to `tryRunBotFlows`.

- [ ] **Step 1: Read current message.service.ts**

Read `Backend/src/modules/messaging/message.service.ts` to find:
1. The exact line where `prisma.conversation.update({ messageCount: { increment: 1 } })` is called
2. Whether the function already loads the channel with its `config` field
3. The exact shape of the `conversation` variable at that point

- [ ] **Step 2: Add tryRunBotFlows import and hook**

At the top of `message.service.ts`, add the import:

```typescript
import { tryRunBotFlows } from '../bot/flow.engine'
```

Find the `prisma.conversation.update` call that does `messageCount: { increment: 1 }`. Change it so it captures the result AND includes the channel with config. Then add the fire-and-forget call:

```typescript
// The update now includes channel for the bot engine
const updatedConv = await prisma.conversation.update({
  where: { id: conversation.id },
  data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
  include: { channel: { select: { platform: true, config: true } } }
})

// Fire-and-forget: bot engine processes in background
tryRunBotFlows(workspaceId, channelId, updatedConv, params.content).catch(err =>
  console.error('[BotEngine]', err)
)
```

**Note:** If the conversation variable already has `channel` loaded from an earlier include in the same function, check whether it has `config`. If yes, you can reuse the existing conversation object and just add the fire-and-forget. If not, add `include: { channel: { select: { platform: true, config: true } } }` to the update call as shown above.

- [ ] **Step 3: Build check + full test run**

```
cd Backend && npm run build 2>&1 | tail -5
cd Backend && npx vitest run 2>&1 | tail -8
```
Expected: build success, all tests pass

- [ ] **Step 4: Commit**

```
git add Backend/src/modules/messaging/message.service.ts
git commit -m "feat: wire FlowEngine into message.service — fire-and-forget bot hook"
```

---

## Task 6: Frontend — Bot List Page

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/bots/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/bots/BotListClient.tsx`

### Context

Lists all BotAgents for the workspace. Shows name, description, active/inactive status, flow count. "Nuevo Bot" button opens an inline form (name + description). Clicking a bot navigates to `/dashboard/bots/:agentId`. Uses `mounted` pattern and `fetchAPI`.

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/bots/page.tsx`:

```tsx
import type { Metadata } from 'next'
import BotListClient from './BotListClient'

export const metadata: Metadata = {
  title: 'Bots | Metria',
  description: 'Automatizaciones de mensajería'
}

export default function BotsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bots</h1>
        <p className="text-sm text-muted-foreground mt-1">Automatizaciones para mensajes entrantes</p>
      </div>
      <BotListClient />
    </div>
  )
}
```

- [ ] **Step 2: Create BotListClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/bots/BotListClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

interface BotAgent {
  id: string
  name: string
  description: string | null
  isActive: boolean
  _count: { flows: number }
}

export default function BotListClient() {
  const [mounted, setMounted] = useState(false)
  const [agents, setAgents] = useState<BotAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/bots/agents')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setAgents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted])

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetchAPI('/bots/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined })
      })
      if (!res.ok) throw new Error('Create failed')
      const agent = await res.json()
      setAgents(prev => [agent, ...prev])
      setNewName(''); setNewDesc(''); setShowForm(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function handleToggle(agentId: string, current: boolean) {
    try {
      const res = await fetchAPI(`/bots/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current })
      })
      if (!res.ok) throw new Error('Update failed')
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, isActive: !current } : a))
    } catch (err) { console.error(err) }
  }

  if (!mounted) return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">{agents.length} bot{agents.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          + Nuevo Bot
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Nombre del bot *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Descripción (opcional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              {saving ? '...' : 'Crear'}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewName(''); setNewDesc('') }}
              className="px-3 py-1.5 rounded-lg border text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin bots. Crea el primero.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {agents.map((agent, idx) => (
            <div
              key={agent.id}
              className={`flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors ${idx > 0 ? 'border-t' : ''}`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/bots/${agent.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/dashboard/bots/${agent.id}`) }}
                className="flex-1 cursor-pointer focus-visible:outline-none"
              >
                <div className="font-medium text-sm">{agent.name}</div>
                <div className="text-xs text-muted-foreground">
                  {agent._count.flows} flujo{agent._count.flows !== 1 ? 's' : ''}
                  {agent.description ? ` · ${agent.description}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleToggle(agent.id, agent.isActive)}
                className={`ml-4 text-xs px-2 py-1 rounded-full font-medium ${agent.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
              >
                {agent.isActive ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```
cd "metria-metrics/Frontend" && npx tsc --noEmit 2>&1 | grep "bots" | head -10
```
Expected: no errors in new files.

- [ ] **Step 4: Commit**

```
git add "metria-metrics/Frontend/src/app/dashboard/bots/"
git commit -m "feat: bot list page — create and toggle bot agents"
```

---

## Task 7: Frontend — Bot Detail / Flow Editor

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/BotDetailClient.tsx`

### Context

Shows all flows for a bot. Each flow displays: name, trigger type + value, channel, active/inactive toggle. "Nuevo Flujo" button opens an inline form. Only implement the most common actions in the create form: FIRST_MESSAGE and KEYWORD triggers, `send_message` action.

Trigger type labels: `FIRST_MESSAGE` → "Primer mensaje", `KEYWORD` → "Palabra clave", `BUSINESS_HRS` → "Fuera de horario".

- [ ] **Step 1: Create page.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import BotDetailClient from './BotDetailClient'

export const metadata: Metadata = {
  title: 'Flujos del Bot | Metria',
}

export default function BotDetailPage({ params }: { params: { botId: string } }) {
  return <BotDetailClient botId={params.botId} />
}
```

- [ ] **Step 2: Create BotDetailClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/bots/[botId]/BotDetailClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

const TRIGGER_LABEL: Record<string, string> = {
  FIRST_MESSAGE: 'Primer mensaje',
  KEYWORD: 'Palabra clave',
  BUSINESS_HRS: 'Fuera de horario'
}

const CHANNEL_LABEL: Record<string, string> = {
  ALL: 'Todos', WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', TELEGRAM: 'Telegram'
}

interface BotFlow {
  id: string
  name: string
  triggerType: string
  triggerValue: string | null
  channel: string
  isActive: boolean
  priority: number
  actions: unknown[]
}

export default function BotDetailClient({ botId }: { botId: string }) {
  const [mounted, setMounted] = useState(false)
  const [flows, setFlows] = useState<BotFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', triggerType: 'FIRST_MESSAGE', triggerValue: '', channel: 'ALL', messageContent: '' })
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI(`/bots/agents/${botId}/flows`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setFlows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, botId])

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const actions = form.messageContent.trim()
        ? [{ type: 'send_message', content: form.messageContent.trim() }]
        : []
      const res = await fetchAPI(`/bots/agents/${botId}/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          triggerType: form.triggerType,
          triggerValue: form.triggerValue.trim() || undefined,
          channel: form.channel,
          actions
        })
      })
      if (!res.ok) throw new Error('Create failed')
      const flow = await res.json()
      setFlows(prev => [...prev, flow])
      setForm({ name: '', triggerType: 'FIRST_MESSAGE', triggerValue: '', channel: 'ALL', messageContent: '' })
      setShowForm(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function handleToggle(flowId: string, current: boolean) {
    try {
      const res = await fetchAPI(`/bots/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current })
      })
      if (!res.ok) throw new Error('Update failed')
      setFlows(prev => prev.map(f => f.id === flowId ? { ...f, isActive: !current } : f))
    } catch (err) { console.error(err) }
  }

  async function handleDelete(flowId: string) {
    try {
      const res = await fetchAPI(`/bots/flows/${flowId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setFlows(prev => prev.filter(f => f.id !== flowId))
    } catch (err) { console.error(err) }
  }

  if (!mounted) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted/40 rounded" />
      <div className="h-32 bg-muted/40 rounded-lg" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
        <h1 className="text-xl font-semibold">Flujos del Bot</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          + Nuevo Flujo
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Nombre del flujo *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          />
          <div className="flex gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-background flex-1 focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.triggerType}
              onChange={e => setForm(p => ({ ...p, triggerType: e.target.value }))}
            >
              {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-background flex-1 focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.channel}
              onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
            >
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {form.triggerType === 'KEYWORD' && (
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Palabra clave (ej: precio, hola)"
              value={form.triggerValue}
              onChange={e => setForm(p => ({ ...p, triggerValue: e.target.value }))}
            />
          )}
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder="Mensaje de respuesta (opcional). Usa {nombre} para el nombre del contacto."
            value={form.messageContent}
            onChange={e => setForm(p => ({ ...p, messageContent: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              {saving ? '...' : 'Crear'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin flujos. Crea el primero.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {flows.map((flow, idx) => (
            <div key={flow.id} className={`flex items-center gap-4 px-4 py-3 ${idx > 0 ? 'border-t' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{flow.name}</div>
                <div className="text-xs text-muted-foreground">
                  {TRIGGER_LABEL[flow.triggerType] ?? flow.triggerType}
                  {flow.triggerValue && `: "${flow.triggerValue}"`}
                  {' · '}{CHANNEL_LABEL[flow.channel] ?? flow.channel}
                  {' · '}prioridad {flow.priority}
                </div>
              </div>
              <button
                onClick={() => handleToggle(flow.id, flow.isActive)}
                className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${flow.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
              >
                {flow.isActive ? 'Activo' : 'Inactivo'}
              </button>
              <button
                onClick={() => handleDelete(flow.id)}
                className="text-xs text-red-500 hover:text-red-700 shrink-0"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```
cd "metria-metrics/Frontend" && npx tsc --noEmit 2>&1 | grep "bots" | head -10
```
Expected: no errors.

- [ ] **Step 4: Run all backend tests**

```
cd Backend && npx vitest run 2>&1 | tail -8
```
All tests must still pass.

- [ ] **Step 5: Commit**

```
git add "metria-metrics/Frontend/src/app/dashboard/bots/[botId]/"
git commit -m "feat: bot detail page — flow editor with create/toggle/delete"
```

---

## Self-Review

**Spec coverage:**
- ✅ BotAgent CRUD (items 14) — Task 1
- ✅ BotFlow CRUD (item 14) — Task 1
- ✅ FlowEngine with FIRST_MESSAGE, KEYWORD, BUSINESS_HRS triggers (item 15) — Task 3
- ✅ Action types: send_message, assign_agent, create_ticket, wait_human, update_stage, send_csat (item 15) — Task 3
- ✅ Bot Builder UI (item 16) — Tasks 6 + 7
- ✅ Quick replies via KEYWORD trigger with send_message action (item 17) — Task 3 + 7
- ✅ Business hours config (item 17) — Task 2 + controller GET/PUT

**Placeholder scan:** No TODOs, no TBDs. All code blocks complete.

**Type consistency:** `ConversationSnap` interface defined in Task 3 and used consistently. `tryRunBotFlows` signature matches usage in Task 5.
