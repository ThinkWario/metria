# Messaging + CRM — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the database schema, WebSocket server, planGate middleware, and a working end-to-end Telegram integration (receive message → store in DB → emit WebSocket event) that proves the full pipeline before adding more channels.

**Architecture:** Modular monolith — new code lives in `src/modules/messaging/` with strict boundaries. Socket.io is initialized in `index.ts` and exported via `src/lib/socket.ts` singleton. All new models are scoped to `workspaceId` and share the existing PostgreSQL instance.

**Tech Stack:** Vitest (already installed), socket.io, telegraf, pnpm, Prisma 5, Express 4, TypeScript 5

**Spec reference:** `docs/superpowers/specs/2026-05-09-messaging-crm-design.md`

**This is Phase 1 of 5.** Phases 2–5 (WhatsApp/Instagram, CRM, Bot Engine, Analytics) are separate plans.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `Backend/package.json` | Add test scripts |
| Create | `Backend/vitest.config.ts` | Vitest configuration |
| Modify | `Backend/prisma/schema.prisma` | Add 15 new models + Workspace relations |
| Create | `Backend/src/middleware/planGate.ts` | Plan-based route gating |
| Create | `Backend/src/middleware/__tests__/planGate.test.ts` | planGate tests |
| Create | `Backend/src/lib/socket.ts` | socket.io singleton (init + getIO) |
| Modify | `Backend/src/index.ts` | Use createServer + init socket.io |
| Create | `Backend/src/modules/messaging/socket.handler.ts` | WS auth + workspace rooms |
| Create | `Backend/src/modules/messaging/types.ts` | Shared messaging types |
| Create | `Backend/src/modules/messaging/message.service.ts` | find/create conversation+contact+message, emit WS |
| Create | `Backend/src/modules/messaging/__tests__/message.service.test.ts` | message.service tests |
| Create | `Backend/src/modules/messaging/channels/telegram.service.ts` | Telegraf bot + webhook handler |
| Create | `Backend/src/modules/messaging/messaging.controller.ts` | HTTP handlers for inbox + Telegram webhook |
| Create | `Backend/src/modules/messaging/messaging.routes.ts` | Route definitions |
| Modify | `Backend/src/app.ts` | Register new messaging routes |

---

## Task 1: Configure Vitest

**Files:**
- Modify: `Backend/package.json`
- Create: `Backend/vitest.config.ts`

- [ ] **Step 1: Add test scripts to package.json**

In `Backend/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Result:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsup src/index.ts --format cjs --dts",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "db:push": "prisma push",
  "db:studio": "prisma studio",
  "seed": "tsx prisma/seed.ts",
  "lint": "eslint src --ext .ts"
}
```

- [ ] **Step 2: Create vitest.config.ts**

Create `Backend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
```

- [ ] **Step 3: Write a trivial passing test to verify setup**

Create `Backend/src/__tests__/setup.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run tests**

From `Backend/`:
```bash
pnpm test
```

Expected output:
```
✓ src/__tests__/setup.test.ts > vitest setup > runs
Test Files  1 passed (1)
Tests       1 passed (1)
```

- [ ] **Step 5: Commit**
```bash
git add Backend/package.json Backend/vitest.config.ts Backend/src/__tests__/setup.test.ts
git commit -m "chore: configure vitest for backend"
```

---

## Task 2: Add New Prisma Models

**Files:**
- Modify: `Backend/prisma/schema.prisma`

- [ ] **Step 1: Add new relation fields to the existing Workspace model**

In `Backend/prisma/schema.prisma`, inside the `Workspace` model block, add these lines after the existing `adProductMappings` relation:

```prisma
  channels              Channel[]
  contacts              Contact[]
  pipelines             Pipeline[]
  deals                 Deal[]
  tickets               Ticket[]
  conversations         Conversation[]
  messages              Message[]
  botAgents             BotAgent[]
  botFlows              BotFlow[]
  quickReplies          QuickReply[]
  businessHours         BusinessHours?
  channelAnalyticSnapshots ChannelAnalyticSnapshot[]
```

- [ ] **Step 2: Append all new models at the end of schema.prisma**

Append to the end of `Backend/prisma/schema.prisma`:

```prisma
model Channel {
  id           String    @id @default(uuid())
  workspaceId  String    @map("workspace_id")
  platform     String    // WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK
  name         String
  status       String    @default("DISCONNECTED") // CONNECTED | DISCONNECTED | ERROR
  config       Json      @default("{}") // encrypted tokens, phone numbers, account IDs
  lastActivity DateTime? @map("last_activity")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversations         Conversation[]
  analyticSnapshots     ChannelAnalyticSnapshot[]

  @@unique([workspaceId, platform])
  @@map("channels")
}

model Contact {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  name             String
  email            String?
  phone            String?
  avatarUrl        String?   @map("avatar_url")
  source           String    // SHOPIFY | WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK | META_AD | GOOGLE_AD | TIKTOK_AD | MANUAL
  sourceCampaignId String?   @map("source_campaign_id")
  shopifyCustomerId String?  @map("shopify_customer_id")
  status           String    @default("LEAD") // LEAD | PROSPECT | CUSTOMER | VIP | CHURNED
  ltv              Decimal   @default(0) @db.Decimal(10, 2)
  healthScore      Int?      @map("health_score")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tags             ContactTag[]
  contactNotes     ContactNote[]
  deals            Deal[]
  tickets          Ticket[]
  conversations    Conversation[]
  healthScores     ContactHealthScore[]

  @@unique([workspaceId, email])
  @@index([workspaceId, status])
  @@map("contacts")
}

model ContactTag {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  contactId   String   @map("contact_id")
  name        String
  color       String   @default("#6366f1")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact     Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@map("contact_tags")
}

model ContactNote {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  contactId   String   @map("contact_id")
  userId      String   @map("user_id")
  content     String
  createdAt   DateTime @default(now()) @map("created_at")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact     Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@map("contact_notes")
}

model ContactHealthScore {
  id           String   @id @default(uuid())
  contactId    String   @map("contact_id")
  score        Int
  factors      Json
  calculatedAt DateTime @default(now()) @map("calculated_at")
  contact      Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@map("contact_health_scores")
}

model Pipeline {
  id          String          @id @default(uuid())
  workspaceId String          @map("workspace_id")
  name        String
  isDefault   Boolean         @default(false) @map("is_default")
  createdAt   DateTime        @default(now()) @map("created_at")
  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  stages      PipelineStage[]
  deals       Deal[]

  @@map("pipelines")
}

model PipelineStage {
  id         String   @id @default(uuid())
  pipelineId String   @map("pipeline_id")
  name       String
  color      String   @default("#6366f1")
  order      Int
  isWon      Boolean  @default(false) @map("is_won")
  isLost     Boolean  @default(false) @map("is_lost")
  pipeline   Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals      Deal[]

  @@map("pipeline_stages")
}

model Deal {
  id               String        @id @default(uuid())
  workspaceId      String        @map("workspace_id")
  contactId        String        @map("contact_id")
  pipelineId       String        @map("pipeline_id")
  stageId          String        @map("stage_id")
  title            String
  value            Decimal       @default(0) @db.Decimal(10, 2)
  currency         String        @default("USD")
  assignedToUserId String?       @map("assigned_to_user_id")
  status           String        @default("OPEN") // OPEN | WON | LOST
  wonAt            DateTime?     @map("won_at")
  lostAt           DateTime?     @map("lost_at")
  lostReason       String?       @map("lost_reason")
  sourceChannelId  String?       @map("source_channel_id")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")
  workspace        Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact          Contact       @relation(fields: [contactId], references: [id])
  pipeline         Pipeline      @relation(fields: [pipelineId], references: [id])
  stage            PipelineStage @relation(fields: [stageId], references: [id])

  @@index([workspaceId, status])
  @@map("deals")
}

model Ticket {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  contactId        String    @map("contact_id")
  orderId          String?   @map("order_id")
  conversationId   String?   @map("conversation_id")
  title            String
  description      String?
  status           String    @default("OPEN") // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  priority         String    @default("MEDIUM") // LOW | MEDIUM | HIGH | URGENT
  assignedToUserId String?   @map("assigned_to_user_id")
  slaDeadline      DateTime? @map("sla_deadline")
  resolvedAt       DateTime? @map("resolved_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact          Contact   @relation(fields: [contactId], references: [id])

  @@index([workspaceId, status, priority])
  @@map("tickets")
}

model Conversation {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  channelId        String    @map("channel_id")
  contactId        String?   @map("contact_id")
  externalId       String    @map("external_id")
  status           String    @default("OPEN") // OPEN | PENDING | RESOLVED | SPAM
  type             String    @default("GENERAL") // SUPPORT | SALES | GENERAL
  assignedToUserId String?   @map("assigned_to_user_id")
  assignedToBotId  String?   @map("assigned_to_bot_id")
  isHandledByBot   Boolean   @default(false) @map("is_handled_by_bot")
  messageCount     Int       @default(0) @map("message_count")
  lastMessageAt    DateTime? @map("last_message_at")
  firstResponseAt  DateTime? @map("first_response_at")
  resolvedAt       DateTime? @map("resolved_at")
  csatScore        Int?      @map("csat_score")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channel          Channel   @relation(fields: [channelId], references: [id])
  contact          Contact?  @relation(fields: [contactId], references: [id])
  messages         Message[]
  tags             ConversationTag[]

  @@unique([workspaceId, channelId, externalId])
  @@index([workspaceId, status])
  @@index([workspaceId, assignedToUserId])
  @@map("conversations")
}

model Message {
  id             String       @id @default(uuid())
  conversationId String       @map("conversation_id")
  workspaceId    String       @map("workspace_id")
  externalId     String?      @map("external_id")
  direction      String       // INBOUND | OUTBOUND
  senderType     String       @map("sender_type") // CONTACT | AGENT | BOT
  senderId       String?      @map("sender_id")
  content        String
  mediaUrl       String?      @map("media_url")
  mediaType      String?      @map("media_type")
  status         String       @default("SENT") // SENT | DELIVERED | READ | FAILED
  isInternal     Boolean      @default(false) @map("is_internal")
  sentAt         DateTime     @default(now()) @map("sent_at")
  deliveredAt    DateTime?    @map("delivered_at")
  readAt         DateTime?    @map("read_at")
  workspace      Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, sentAt])
  @@map("messages")
}

model ConversationTag {
  id             String       @id @default(uuid())
  conversationId String       @map("conversation_id")
  name           String
  color          String       @default("#6366f1")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("conversation_tags")
}

model BotAgent {
  id          String     @id @default(uuid())
  workspaceId String     @map("workspace_id")
  name        String
  avatarUrl   String?    @map("avatar_url")
  description String?
  isActive    Boolean    @default(true) @map("is_active")
  createdAt   DateTime   @default(now()) @map("created_at")
  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  flows       BotFlow[]

  @@map("bot_agents")
}

model BotFlow {
  id           String    @id @default(uuid())
  botAgentId   String    @map("bot_agent_id")
  workspaceId  String    @map("workspace_id")
  name         String
  triggerType  String    @map("trigger_type") // KEYWORD | FIRST_MESSAGE | ORDER_STATUS | INTENT | BUSINESS_HRS
  triggerValue String?   @map("trigger_value")
  channel      String    @default("ALL") // WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK | ALL
  actions      Json      // array of action objects — see spec section 8
  priority     Int       @default(100)
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at")
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  botAgent     BotAgent  @relation(fields: [botAgentId], references: [id], onDelete: Cascade)

  @@index([workspaceId, isActive, priority])
  @@map("bot_flows")
}

model QuickReply {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  title       String
  content     String
  shortcut    String?
  createdAt   DateTime  @default(now()) @map("created_at")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("quick_replies")
}

model BusinessHours {
  id             String    @id @default(uuid())
  workspaceId    String    @unique @map("workspace_id")
  timezone       String    @default("America/Santiago")
  monday         Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  tuesday        Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  wednesday      Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  thursday       Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  friday         Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  saturday       Json      @default("{\"open\": \"09:00\", \"close\": \"14:00\", \"enabled\": false}")
  sunday         Json      @default("{\"open\": \"09:00\", \"close\": \"14:00\", \"enabled\": false}")
  outsideMessage String?   @map("outside_message")
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("business_hours")
}

model ChannelAnalyticSnapshot {
  id                      String    @id @default(uuid())
  workspaceId             String    @map("workspace_id")
  channelId               String    @map("channel_id")
  date                    DateTime  @db.Date
  totalInbound            Int       @default(0) @map("total_inbound")
  totalOutbound           Int       @default(0) @map("total_outbound")
  newContacts             Int       @default(0) @map("new_contacts")
  conversationsOpened     Int       @default(0) @map("conversations_opened")
  conversationsResolved   Int       @default(0) @map("conversations_resolved")
  avgFirstResponseSeconds Int       @default(0) @map("avg_first_response_seconds")
  dealsCreated            Int       @default(0) @map("deals_created")
  dealsWon                Int       @default(0) @map("deals_won")
  dealsWonValue           Decimal   @default(0) @map("deals_won_value") @db.Decimal(10, 2)
  csatAvg                 Decimal?  @map("csat_avg") @db.Decimal(3, 2)
  workspace               Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channel                 Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, channelId, date])
  @@map("channel_analytic_snapshots")
}
```

- [ ] **Step 3: Run DB migration**

Make sure Docker is running (`docker compose up -d` from `Backend/`), then:
```bash
cd Backend && npm run db:push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Verify in Prisma Studio**
```bash
npm run db:studio
```
Confirm the new tables appear: `channels`, `contacts`, `conversations`, `messages`, `bot_agents`, etc.

- [ ] **Step 5: Commit**
```bash
git add Backend/prisma/schema.prisma
git commit -m "feat(db): add messaging+CRM schema — 15 new models"
```

---

## Task 3: planGate Middleware

**Files:**
- Create: `Backend/src/middleware/planGate.ts`
- Create: `Backend/src/middleware/__tests__/planGate.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `Backend/src/middleware/__tests__/planGate.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { requirePlan } from '../planGate'
import type { Request, Response, NextFunction } from 'express'

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
  return res as unknown as Response
}

describe('requirePlan', () => {
  it('calls next() when workspace plan matches', () => {
    const req = { workspace: { plan: 'PRO' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO', 'SCALE')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when workspace plan does not match', () => {
    const req = { workspace: { plan: 'STARTER' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO', 'SCALE')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlans: ['PRO', 'SCALE']
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when workspace is missing', () => {
    const req = {} as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requirePlan('PRO')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**
```bash
cd Backend && pnpm test
```
Expected: `planGate.ts` not found errors.

- [ ] **Step 3: Implement planGate.ts**

Create `Backend/src/middleware/planGate.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express'

export function requirePlan(...plans: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const workspace = (req as any).workspace
    if (!workspace || !plans.includes(workspace.plan)) {
      res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlans: plans })
      return
    }
    next()
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**
```bash
pnpm test
```
Expected:
```
✓ src/middleware/__tests__/planGate.test.ts (3 tests)
Tests 4 passed (4)
```

- [ ] **Step 5: Commit**
```bash
git add Backend/src/middleware/planGate.ts Backend/src/middleware/__tests__/planGate.test.ts
git commit -m "feat: add planGate middleware with tests"
```

---

## Task 4: Socket.io Singleton

**Files:**
- Create: `Backend/src/lib/socket.ts`

- [ ] **Step 1: Install socket.io**
```bash
cd Backend && pnpm add socket.io
```

- [ ] **Step 2: Create the socket singleton**

Create `Backend/src/lib/socket.ts`:
```typescript
import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

let _io: Server | null = null

export function initSocket(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }
  })
  return _io
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first')
  return _io
}
```

- [ ] **Step 3: Commit**
```bash
git add Backend/src/lib/socket.ts Backend/package.json Backend/pnpm-lock.yaml
git commit -m "feat: add socket.io singleton lib"
```

---

## Task 5: Wire Socket.io into index.ts

**Files:**
- Modify: `Backend/src/index.ts`

- [ ] **Step 1: Update index.ts**

Replace the full contents of `Backend/src/index.ts` with:
```typescript
import 'dotenv/config'
import { createServer } from 'http'
import app from './app'
import { initSocket } from './lib/socket'
import { registerSocketHandlers } from './modules/messaging/socket.handler'

const PORT = process.env.PORT || 4000

const httpServer = createServer(app)
const io = initSocket(httpServer)
registerSocketHandlers(io)

httpServer.listen(PORT, () => {
  console.log(`[Server] API running on http://127.0.0.1:${PORT}`)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  httpServer.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})
```

- [ ] **Step 2: Create socket.handler.ts (stub) so index.ts compiles**

Create `Backend/src/modules/messaging/socket.handler.ts`:
```typescript
import type { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'

interface AuthPayload {
  userId: string
}

export function registerSocketHandlers(io: Server): void {
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as any)?.token as string | undefined
    if (!token) return next(new Error('AUTH_REQUIRED'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, workspaceId: true }
      })
      if (!user?.workspaceId) return next(new Error('NO_WORKSPACE'));
      (socket as any).userId = user.id;
      (socket as any).workspaceId = user.workspaceId
      next()
    } catch {
      next(new Error('INVALID_TOKEN'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const { userId, workspaceId } = socket as any
    socket.join(`workspace:${workspaceId}`)

    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`workspace:${workspaceId}:conv:${conversationId}`)
      io.to(`workspace:${workspaceId}`).emit('agent:viewing', { conversationId, userId })
    })

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`workspace:${workspaceId}:conv:${conversationId}`)
    })
  })
}
```

- [ ] **Step 3: Verify dev server starts**
```bash
cd Backend && npm run dev
```
Expected: `[Server] API running on http://127.0.0.1:4000`
No TypeScript errors.

- [ ] **Step 4: Commit**
```bash
git add Backend/src/index.ts Backend/src/modules/messaging/socket.handler.ts
git commit -m "feat: wire socket.io into HTTP server with workspace rooms"
```

---

## Task 6: Shared Messaging Types

**Files:**
- Create: `Backend/src/modules/messaging/types.ts`

- [ ] **Step 1: Create types.ts**

Create `Backend/src/modules/messaging/types.ts`:
```typescript
export interface InboundMessageData {
  workspaceId: string
  channelId: string
  /** Platform-level conversation/thread identifier (chat.id for Telegram, thread_id for IG, etc.) */
  externalConversationId: string
  /** Platform-level message identifier */
  externalMessageId: string
  /** Sender's platform identifier (Telegram user ID, WhatsApp phone, Instagram user ID) */
  senderExternalId: string
  senderName?: string
  content: string
  mediaUrl?: string
  mediaType?: string
}

export interface ProcessedMessage {
  conversationId: string
  messageId: string
  contactId: string
  isNewConversation: boolean
}

// WebSocket event payloads emitted to workspace:{workspaceId}
export interface WsConversationNew {
  id: string
  channelId: string
  externalId: string
  status: string
  contact: { id: string; name: string; status: string; phone: string | null } | null
  createdAt: Date
}

export interface WsMessageNew {
  id: string
  conversationId: string
  direction: string
  senderType: string
  content: string
  sentAt: Date
}
```

- [ ] **Step 2: Commit**
```bash
git add Backend/src/modules/messaging/types.ts
git commit -m "feat: add shared messaging types"
```

---

## Task 7: message.service.ts

**Files:**
- Create: `Backend/src/modules/messaging/message.service.ts`
- Create: `Backend/src/modules/messaging/__tests__/message.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/messaging/__tests__/message.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma and socket before importing the service
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn() },
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    message: { create: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }))
}))

import { processInboundMessage } from '../message.service'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'

const WORKSPACE_ID = 'ws-1'
const CHANNEL_ID = 'ch-1'

const baseData = {
  workspaceId: WORKSPACE_ID,
  channelId: CHANNEL_ID,
  externalConversationId: 'ext-conv-1',
  externalMessageId: 'ext-msg-1',
  senderExternalId: '+56912345678',
  senderName: 'Juan Pérez',
  content: 'Hola, ¿dónde está mi pedido?'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processInboundMessage', () => {
  it('creates a new contact when none exists with that phone', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'contact-1', name: 'Juan Pérez', status: 'LEAD', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-1', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 0,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = {
      id: 'msg-1', conversationId: 'conv-1', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 1 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const result = await processInboundMessage(baseData)

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        phone: '+56912345678',
        name: 'Juan Pérez',
        source: 'TELEGRAM',
        status: 'LEAD'
      })
    })
    expect(result.isNewConversation).toBe(true)
    expect(result.contactId).toBe('contact-1')
  })

  it('reuses existing contact when phone matches', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'contact-existing', name: 'Juan', status: 'CUSTOMER', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-existing', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 5,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = {
      id: 'msg-2', conversationId: 'conv-existing', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 6 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const result = await processInboundMessage(baseData)

    expect(prisma.contact.create).not.toHaveBeenCalled()
    expect(result.isNewConversation).toBe(false)
    expect(result.contactId).toBe('contact-existing')
  })

  it('emits conversation:new on first message in a thread', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'c1', name: 'Ana', status: 'LEAD', phone: '+56911111111' }
    const mockConversation = {
      id: 'conv-new', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 0,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = { id: 'msg-3', conversationId: 'conv-new', direction: 'INBOUND', senderType: 'CONTACT', content: 'Hi', sentAt: new Date() }
    const mockIO = { to: vi.fn().mockReturnThis(), emit: vi.fn() }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 1 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)
    vi.mocked(getIO).mockReturnValue(mockIO as any)

    await processInboundMessage({ ...baseData, senderExternalId: '+56911111111' })

    expect(mockIO.to).toHaveBeenCalledWith(`workspace:${WORKSPACE_ID}`)
    expect(mockIO.emit).toHaveBeenCalledWith('conversation:new', expect.objectContaining({ id: 'conv-new' }))
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**
```bash
cd Backend && pnpm test
```
Expected: `Cannot find module '../message.service'`

- [ ] **Step 3: Implement message.service.ts**

Create `Backend/src/modules/messaging/message.service.ts`:
```typescript
import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import type { InboundMessageData, ProcessedMessage } from './types'

const PLATFORM_TO_SOURCE: Record<string, string> = {
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  TELEGRAM: 'TELEGRAM',
  TIKTOK: 'TIKTOK'
}

export async function processInboundMessage(data: InboundMessageData): Promise<ProcessedMessage> {
  const {
    workspaceId, channelId, externalConversationId, externalMessageId,
    senderExternalId, senderName, content, mediaUrl, mediaType
  } = data

  // Resolve contact source from channel platform
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true }
  })
  const source = PLATFORM_TO_SOURCE[channel?.platform ?? ''] ?? 'MANUAL'

  // Find or create contact by phone within this workspace
  let contact = await prisma.contact.findFirst({
    where: { workspaceId, phone: senderExternalId }
  })
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        name: senderName ?? senderExternalId,
        phone: senderExternalId,
        source,
        status: 'LEAD'
      }
    })
  }

  // Find or create conversation
  let isNewConversation = false
  let conversation = await prisma.conversation.findUnique({
    where: {
      workspaceId_channelId_externalId: {
        workspaceId,
        channelId,
        externalId: externalConversationId
      }
    },
    include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
  })

  if (!conversation) {
    isNewConversation = true
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        channelId,
        contactId: contact.id,
        externalId: externalConversationId,
        status: 'OPEN'
      },
      include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
    })
  }

  // Store message
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      externalId: externalMessageId,
      direction: 'INBOUND',
      senderType: 'CONTACT',
      senderId: contact.id,
      content,
      mediaUrl,
      mediaType,
      status: 'DELIVERED'
    }
  })

  // Update conversation counters
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      messageCount: { increment: 1 }
    }
  })

  // Emit WebSocket event to workspace room
  const io = getIO()
  const room = `workspace:${workspaceId}`

  if (isNewConversation) {
    io.to(room).emit('conversation:new', {
      id: conversation.id,
      channelId: conversation.channelId,
      externalId: conversation.externalId,
      status: conversation.status,
      contact: conversation.contact,
      createdAt: conversation.createdAt
    })
  } else {
    io.to(room).emit('message:new', {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      senderType: message.senderType,
      content: message.content,
      sentAt: message.sentAt
    })
  }

  return {
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
    isNewConversation
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**
```bash
pnpm test
```
Expected:
```
✓ src/modules/messaging/__tests__/message.service.test.ts (3 tests)
Tests  7 passed (7)
```

- [ ] **Step 5: Commit**
```bash
git add Backend/src/modules/messaging/message.service.ts \
        Backend/src/modules/messaging/__tests__/message.service.test.ts \
        Backend/src/modules/messaging/types.ts
git commit -m "feat: message.service — find/create conversation+contact, emit WS event"
```

---

## Task 8: Telegram Channel Service

**Files:**
- Create: `Backend/src/modules/messaging/channels/telegram.service.ts`

- [ ] **Step 1: Install telegraf**
```bash
cd Backend && pnpm add telegraf
```

- [ ] **Step 2: Create telegram.service.ts**

Create `Backend/src/modules/messaging/channels/telegram.service.ts`:
```typescript
import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { processInboundMessage } from '../message.service'

// Cache bot instances — one per workspace channel to avoid recreating on each webhook call
const botCache = new Map<string, Telegraf>()

function createBot(workspaceId: string, channelId: string): Telegraf {
  // Bot token is injected at call time, not stored here
  return new Telegraf('placeholder') // replaced by setToken below
}

function getOrCreateBot(workspaceId: string, channelId: string, botToken: string): Telegraf {
  const key = `${workspaceId}:${channelId}`
  if (!botCache.has(key)) {
    const bot = new Telegraf(botToken)

    bot.on('text', async (ctx) => {
      const from = ctx.message.from
      const chat = ctx.message.chat
      await processInboundMessage({
        workspaceId,
        channelId,
        externalConversationId: String(chat.id),
        externalMessageId: String(ctx.message.message_id),
        senderExternalId: String(from.id),
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id),
        content: ctx.message.text
      })
    })

    botCache.set(key, bot)
  }
  return botCache.get(key)!
}

export async function handleTelegramUpdate(
  workspaceId: string,
  channelId: string,
  botToken: string,
  update: Update
): Promise<void> {
  const bot = getOrCreateBot(workspaceId, channelId, botToken)
  await bot.handleUpdate(update)
}

export function clearBotCache(key?: string): void {
  if (key) botCache.delete(key)
  else botCache.clear()
}
```

- [ ] **Step 3: Commit**
```bash
git add Backend/src/modules/messaging/channels/telegram.service.ts \
        Backend/package.json Backend/pnpm-lock.yaml
git commit -m "feat: telegram channel service with bot instance caching"
```

---

## Task 9: Messaging Controller + Routes

**Files:**
- Create: `Backend/src/modules/messaging/messaging.controller.ts`
- Create: `Backend/src/modules/messaging/messaging.routes.ts`

- [ ] **Step 1: Create messaging.controller.ts**

Create `Backend/src/modules/messaging/messaging.controller.ts`:
```typescript
import type { Request, Response } from 'express'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { prisma } from '../../lib/prisma'
import { handleTelegramUpdate } from './channels/telegram.service'

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: 'TELEGRAM', status: 'CONNECTED' }
  })
  if (!channel) {
    res.sendStatus(404)
    return
  }
  const config = channel.config as Record<string, string>
  await handleTelegramUpdate(workspaceId, channel.id, config.botToken, req.body as Update)
  res.sendStatus(200)
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  const workspaceId = (req as any).workspace.id as string
  const { status, channelId } = req.query

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(status ? { status: String(status) } : {}),
      ...(channelId ? { channelId: String(channelId) } : {})
    },
    include: {
      contact: { select: { id: true, name: true, status: true, phone: true } },
      channel: { select: { id: true, platform: true, name: true } }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50
  })
  res.json(conversations)
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  const workspaceId = (req as any).workspace.id as string
  const { conversationId } = req.params

  // Verify conversation belongs to workspace
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  })
  if (!conversation || conversation.workspaceId !== workspaceId) {
    res.sendStatus(404)
    return
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, workspaceId },
    orderBy: { sentAt: 'asc' }
  })
  res.json(messages)
}
```

- [ ] **Step 2: Create messaging.routes.ts**

Create `Backend/src/modules/messaging/messaging.routes.ts`:
```typescript
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  getConversations,
  getMessages
} from './messaging.controller'

const router = Router()

// Public webhook — auth via unique workspaceId in URL (no JWT)
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)

// Protected inbox endpoints — PRO/SCALE only
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversations)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessages)

export default router
```

- [ ] **Step 3: Register routes in app.ts**

In `Backend/src/app.ts`, add after the existing imports:
```typescript
import messagingRoutes from './modules/messaging/messaging.routes'
```

And add before the error handler:
```typescript
app.use('/api', messagingRoutes)
```

- [ ] **Step 4: Verify server starts without errors**
```bash
cd Backend && npm run dev
```
Expected: `[Server] API running on http://127.0.0.1:4000` with no TypeScript errors.

- [ ] **Step 5: Commit**
```bash
git add Backend/src/modules/messaging/messaging.controller.ts \
        Backend/src/modules/messaging/messaging.routes.ts \
        Backend/src/app.ts
git commit -m "feat: messaging controller, routes, and register in app"
```

---

## Task 10: Create a Test Telegram Channel and Smoke Test

**Files:**
- No new files — manual DB + curl verification

- [ ] **Step 1: Insert a test Channel via Prisma Studio**

Run `npm run db:studio` from `Backend/`. In the `channels` table, create a record:
```json
{
  "id": "test-channel-telegram-1",
  "workspaceId": "<your-workspace-id-from-workspaces-table>",
  "platform": "TELEGRAM",
  "name": "Bot Soporte Test",
  "status": "CONNECTED",
  "config": { "botToken": "FAKE_TOKEN_FOR_TEST" }
}
```

- [ ] **Step 2: Send a simulated Telegram update to the webhook**

```bash
curl -X POST http://localhost:4000/api/webhooks/telegram/<your-workspace-id> \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "from": { "id": 123456, "first_name": "Juan", "last_name": "Perez", "is_bot": false },
      "chat": { "id": 123456, "type": "private" },
      "date": 1700000000,
      "text": "Hola, donde esta mi pedido?"
    }
  }'
```

Expected: HTTP 200

- [ ] **Step 3: Verify in Prisma Studio**

Check:
- `contacts` table: new row with `phone = "123456"`, `name = "Juan Perez"`, `source = "TELEGRAM"`, `status = "LEAD"`
- `conversations` table: new row with `external_id = "123456"`, `status = "OPEN"`, `channel_id = "test-channel-telegram-1"`
- `messages` table: new row with `content = "Hola, donde esta mi pedido?"`, `direction = "INBOUND"`

- [ ] **Step 4: Run full test suite**
```bash
cd Backend && pnpm test
```
Expected: all tests pass.

- [ ] **Step 5: Final commit**
```bash
git add .
git commit -m "feat(phase1): complete messaging foundation — DB, WebSockets, Telegram, planGate"
```

---

## Phase 1 Complete ✓

What's working after Phase 1:
- All 15 new DB models migrated and ready
- `requirePlan` middleware protecting PRO/SCALE routes
- WebSocket server with workspace-scoped rooms + JWT auth
- Telegram messages → stored in DB → WebSocket event emitted
- REST endpoints: `GET /api/messaging/conversations` + `GET /api/messaging/conversations/:id/messages`

**Next:** `2026-05-09-messaging-crm-phase2-whatsapp-instagram-inbox.md`
— WhatsApp Business API + Instagram DMs + Frontend 3-column inbox with live WebSocket updates.
