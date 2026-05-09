# Metria — Messaging + CRM Module Design
**Date:** 2026-05-09  
**Status:** Approved  
**Goal:** Unified inbox (WhatsApp, Instagram, Telegram, TikTok) + CRM + Bot Engine + Analytics. Beat GoHighLevel by being e-commerce native.

---

## 1. Strategic Differentiator

GoHighLevel is a generic CRM. Metria already has Shopify orders, ad spend data (Meta/Google/TikTok), and Dropi logistics. Every conversation in Metria is pre-enriched with the customer's full commercial journey. This is the moat.

**Native joins that GHL cannot do:**
```sql
-- Revenue attributed to WhatsApp conversations
SELECT c.name, SUM(d.value) as revenue, ca.platform
FROM contacts c
JOIN deals d ON d.contact_id = c.id
JOIN conversations cv ON cv.contact_id = c.id
JOIN channels ca ON ca.id = cv.channel_id
WHERE d.status = 'WON' AND ca.platform = 'WHATSAPP';

-- Contacts from Meta ads that purchased
SELECT c.name, o.total_price, c.source_campaign_id
FROM contacts c
JOIN orders o ON o.customer_email = c.email
JOIN ad_spend ads ON ads.campaign_id = c.source_campaign_id
WHERE ads.platform = 'META';
```

---

## 2. Scope

### In scope (v1)
- Unified reactive inbox: WhatsApp Business, Instagram DMs, Telegram, TikTok (limited)
- CRM: Contacts 360°, Pipelines (Kanban), Tickets (helpdesk), both coexisting
- Bot agents: configurable programmable responses, assignable like human agents, human takeover
- Channel analytics: volume, response time, resolution rate, attributed revenue
- Team management: SUPERVISOR / AGENT roles, manual assignment
- Plan gating: STARTER sees locked UI with upgrade CTA, PRO/SCALE has full access
- Full attribution funnel: Ad → Conversation → Deal → Purchase

### Out of scope (v1)
- Outbound broadcasts / mass messaging
- AI/LLM-powered intent detection (v2)
- Voice/video calls
- Email channel
- TikTok full DM inbox (API limitations — shown as Beta)

---

## 3. Architecture — Modular Monolith (Option C)

Single Express backend, strict module separation. Shared PostgreSQL enables native joins across messaging, CRM, and existing e-commerce data.

### Backend module structure
```
Backend/src/
├── modules/
│   ├── messaging/
│   │   ├── channels/
│   │   │   ├── whatsapp.service.ts   # Meta Cloud API webhooks + send
│   │   │   ├── instagram.service.ts  # Meta Graph API webhooks + send
│   │   │   ├── telegram.service.ts   # Telegraf library
│   │   │   └── tiktok.service.ts     # TikTok Business API (limited/beta)
│   │   ├── inbox.service.ts          # conversation management
│   │   ├── message.service.ts        # store + dispatch messages
│   │   ├── socket.handler.ts         # WebSocket events
│   │   ├── messaging.routes.ts
│   │   └── messaging.controller.ts
│   ├── crm/
│   │   ├── contact.service.ts        # Shopify enrichment + ad attribution
│   │   ├── pipeline.service.ts       # deals + Kanban stages
│   │   ├── ticket.service.ts         # support tickets + SLA
│   │   ├── crm.routes.ts
│   │   └── crm.controller.ts
│   └── bot/
│       ├── bot-agent.service.ts      # CRUD bot agents
│       ├── flow-engine.service.ts    # evaluate triggers, execute actions
│       ├── bot.routes.ts
│       └── bot.controller.ts
├── routes/           # existing routes — untouched
├── middleware/
│   ├── auth.ts       # existing — untouched
│   └── planGate.ts   # NEW: requirePlan('PRO', 'SCALE')
└── app.ts            # adds socket.io + registers new module routes
```

### Plan gate middleware
```typescript
export const requirePlan = (...plans: string[]) =>
  (req, res, next) => {
    if (!plans.includes(req.workspace.plan)) {
      return res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlans: plans });
    }
    next();
  };
// Bot flows: requirePlan('PRO', 'SCALE')
// Inbox: requirePlan('PRO', 'SCALE')
// CRM: requirePlan('PRO', 'SCALE')
```

---

## 4. Data Model

All new models scoped to `workspaceId`. Existing models (Workspace, User, Order, AdSpend, Shipment) are untouched.

### New Prisma models

```prisma
model Channel {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  platform    String   // WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK
  name        String
  status      String   @default("DISCONNECTED") // CONNECTED | DISCONNECTED | ERROR
  config      Json     @default("{}") // encrypted tokens, phone numbers, account IDs
  lastActivity DateTime? @map("last_activity")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversations Conversation[]
  analyticSnapshots ChannelAnalyticSnapshot[]

  @@unique([workspaceId, platform])
  @@map("channels")
}

model Contact {
  id                 String   @id @default(uuid())
  workspaceId        String   @map("workspace_id")
  name               String
  email              String?
  phone              String?
  avatarUrl          String?  @map("avatar_url")
  source             String   // SHOPIFY | WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK | META_AD | GOOGLE_AD | TIKTOK_AD | MANUAL
  sourceCampaignId   String?  @map("source_campaign_id") // FK to AdSpend.campaignId
  shopifyCustomerId  String?  @map("shopify_customer_id")
  status             String   @default("LEAD") // LEAD | PROSPECT | CUSTOMER | VIP | CHURNED
  ltv                Decimal  @default(0) @db.Decimal(10, 2)
  healthScore        Int?     @map("health_score") // 0-100
  notes              String?
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tags               ContactTag[]
  contactNotes       ContactNote[]
  deals              Deal[]
  tickets            Ticket[]
  conversations      Conversation[]
  healthScoreLog     ContactHealthScore[]

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
  id          String   @id @default(uuid())
  contactId   String   @map("contact_id")
  score       Int
  factors     Json     // { ltvScore, orderFrequency, complaintHistory, recentActivity }
  calculatedAt DateTime @default(now()) @map("calculated_at")
  contact     Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

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
  id                String        @id @default(uuid())
  workspaceId       String        @map("workspace_id")
  contactId         String        @map("contact_id")
  pipelineId        String        @map("pipeline_id")
  stageId           String        @map("stage_id")
  title             String
  value             Decimal       @default(0) @db.Decimal(10, 2)
  currency          String        @default("USD")
  assignedToUserId  String?       @map("assigned_to_user_id")
  status            String        @default("OPEN") // OPEN | WON | LOST
  wonAt             DateTime?     @map("won_at")
  lostAt            DateTime?     @map("lost_at")
  lostReason        String?       @map("lost_reason")
  sourceChannelId   String?       @map("source_channel_id") // which channel generated this deal
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")
  workspace         Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact           Contact       @relation(fields: [contactId], references: [id])
  pipeline          Pipeline      @relation(fields: [pipelineId], references: [id])
  stage             PipelineStage @relation(fields: [stageId], references: [id])

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
  externalId       String    @map("external_id") // platform conversation ID
  status           String    @default("OPEN") // OPEN | PENDING | RESOLVED | SPAM
  type             String    @default("GENERAL") // SUPPORT | SALES | GENERAL
  assignedToUserId String?   @map("assigned_to_user_id")
  assignedToBotId  String?   @map("assigned_to_bot_id")
  isHandledByBot   Boolean   @default(false) @map("is_handled_by_bot")
  messageCount     Int       @default(0) @map("message_count")
  lastMessageAt    DateTime? @map("last_message_at")
  firstResponseAt  DateTime? @map("first_response_at") // for response time SLA
  resolvedAt       DateTime? @map("resolved_at")
  csatScore        Int?      @map("csat_score") // 1-5
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
  isInternal     Boolean      @default(false) @map("is_internal") // internal agent notes
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
  triggerValue String?   @map("trigger_value") // keyword, regex, etc.
  channel      String    @default("ALL") // WHATSAPP | INSTAGRAM | TELEGRAM | TIKTOK | ALL
  actions      Json      // array of action objects
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
  shortcut    String?   // trigger with /shortcut
  createdAt   DateTime  @default(now()) @map("created_at")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("quick_replies")
}

model BusinessHours {
  id          String    @id @default(uuid())
  workspaceId String    @unique @map("workspace_id")
  timezone    String    @default("America/Santiago")
  monday      Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  tuesday     Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  wednesday   Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  thursday    Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  friday      Json      @default("{\"open\": \"09:00\", \"close\": \"18:00\", \"enabled\": true}")
  saturday    Json      @default("{\"open\": \"09:00\", \"close\": \"14:00\", \"enabled\": false}")
  sunday      Json      @default("{\"open\": \"09:00\", \"close\": \"14:00\", \"enabled\": false}")
  outsideMessage String? @map("outside_message")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("business_hours")
}

model ChannelAnalyticSnapshot {
  id                       String   @id @default(uuid())
  workspaceId              String   @map("workspace_id")
  channelId                String   @map("channel_id")
  date                     DateTime @db.Date
  totalInbound             Int      @default(0) @map("total_inbound")
  totalOutbound            Int      @default(0) @map("total_outbound")
  newContacts              Int      @default(0) @map("new_contacts")
  conversationsOpened      Int      @default(0) @map("conversations_opened")
  conversationsResolved    Int      @default(0) @map("conversations_resolved")
  avgFirstResponseSeconds  Int      @default(0) @map("avg_first_response_seconds")
  dealsCreated             Int      @default(0) @map("deals_created")
  dealsWon                 Int      @default(0) @map("deals_won")
  dealsWonValue            Decimal  @default(0) @map("deals_won_value") @db.Decimal(10, 2)
  csatAvg                  Decimal? @map("csat_avg") @db.Decimal(3, 2)
  workspace                Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channel                  Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, channelId, date])
  @@map("channel_analytic_snapshots")
}
```

---

## 5. Real-time Architecture (WebSockets)

Socket.io added to `app.ts`. Rooms scoped per workspace.

```
workspace:{workspaceId}              ← all workspace events
workspace:{workspaceId}:conv:{id}    ← specific conversation events
```

**Events:**
| Event | Payload | Trigger |
|-------|---------|---------|
| `conversation:new` | conversation + contact summary | new inbound message in new thread |
| `conversation:updated` | { id, status, assignedTo, isHandledByBot } | assignment, status change |
| `message:new` | full Message object | any new message |
| `message:status` | { id, status, readAt } | delivery/read receipt |
| `bot:typing` | { conversationId } | bot is processing |
| `agent:viewing` | { conversationId, userId } | collision detection |

---

## 6. Inbound Message Flow

```
External platform POST /api/webhooks/:platform
    │
    ▼
[platform].service.ts — validate HMAC / token
    │
    ▼
message.service.ts
    ├── find/create Conversation by externalId
    ├── auto-enrich Contact: match phone → Shopify customer
    │   → populate ltv, orders, source campaign
    └── persist Message
    │
    ▼
flow-engine.service.ts
    ├── load active BotFlows for workspace (ordered by priority)
    ├── evaluate triggers against message + conversation + contact
    ├── first match → execute actions sequentially
    │   └── bot actions: send_message, lookup_order, create_ticket,
    │       assign_agent, update_stage, generate_coupon, send_csat, wait_human
    └── no match + no agent assigned → conversation status = PENDING
    │
    ▼
socket.handler.ts — emit to workspace:{workspaceId}
```

---

## 7. Channel Connection Flows

### WhatsApp Business (Meta Cloud API)
1. User inputs: Meta Business Account ID, Phone Number ID, Access Token
2. Backend registers webhook: `POST /api/webhooks/whatsapp`
3. Meta sends `verify_token` challenge → backend confirms
4. Inbound: `POST /api/webhooks/whatsapp` — verified via `X-Hub-Signature-256`
5. Outbound: `POST graph.facebook.com/v18.0/{phone_id}/messages`

### Instagram DMs (Meta Graph API)
1. OAuth: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`
2. Store: Instagram Account ID + Page Access Token
3. Webhook: `POST /api/webhooks/instagram`
4. Outbound: `POST graph.facebook.com/v18.0/me/messages`
5. Requires: Instagram Business account linked to Facebook Page

### Telegram (Telegraf)
1. User creates bot via @BotFather → gets BOT_TOKEN
2. Backend registers: `POST api.telegram.org/bot{token}/setWebhook`
3. Webhook: `POST /api/webhooks/telegram/:workspaceId`
4. Token in URL path acts as auth (no HMAC)
5. Outbound: Telegraf `ctx.reply()`

### TikTok (Beta — limited)
1. TikTok for Business API — ad comment webhooks + DM from campaigns
2. Outbound: `POST open-api.tiktok.com/v2/message/send/`
3. Shown in UI as "Beta — funcionalidad limitada"

---

## 8. Bot Flow Engine

### Trigger types
| Trigger | Condition |
|---------|-----------|
| `FIRST_MESSAGE` | `conversation.messageCount === 1` |
| `KEYWORD` | `message.content.toLowerCase().includes(triggerValue)` |
| `ORDER_STATUS` | contact has order with active Dropi shipment |
| `INTENT` | simple regex pattern match on content (v1) |
| `BUSINESS_HRS` | current time outside BusinessHours config |

### Action JSON format (stored in BotFlow.actions)
```json
[
  { "type": "send_message", "content": "Hola {nombre}, ¿en qué ayudo?" },
  { "type": "lookup_order" },
  { "type": "assign_agent", "userId": "uuid-del-agente" },
  { "type": "create_ticket", "priority": "HIGH" },
  { "type": "update_stage", "status": "CUSTOMER" },
  { "type": "generate_coupon", "percent": 10 },
  { "type": "send_csat" },
  { "type": "wait_human" }
]
```

### Action types
| Action | What it does |
|--------|-------------|
| `send_message` | send text/template with dynamic variables |
| `lookup_order` | query Shopify + Dropi, populate `{pedido_*}` variables |
| `create_ticket` | create Ticket with priority and assign |
| `assign_agent` | set conversation.assignedToUserId |
| `update_stage` | move Contact to new status or Deal to new PipelineStage |
| `generate_coupon` | create Shopify discount code via API |
| `send_csat` | send 1-5 rating request, store on Conversation |
| `wait_human` | set isHandledByBot = false, leave PENDING |

### Dynamic variables
| Variable | Resolves to |
|----------|------------|
| `{nombre}` | Contact.name |
| `{pedido_numero}` | last Order.orderId for contact |
| `{pedido_estado}` | last Shipment.status from Dropi |
| `{pedido_tracking}` | Dropi tracking URL |
| `{descuento_codigo}` | generated Shopify coupon code |
| `{agente_nombre}` | assigned User.name |
| `{hora_apertura}` | BusinessHours.opensAt for current day |

### Human takeover
```
agent clicks "Tomar control"
→ conversation.isHandledByBot = false
→ conversation.assignedToUserId = agentId
→ socket emits conversation:updated to workspace
→ FlowEngine skips conversations where isHandledByBot = false
```

---

## 9. Frontend Structure

### New Next.js routes
```
app/dashboard/
├── inbox/
│   ├── page.tsx                     # 3-column unified inbox
│   └── [conversationId]/page.tsx    # open conversation
├── crm/
│   ├── page.tsx                     # contacts list + summary stats
│   ├── contacts/[contactId]/page.tsx # 360° contact profile
│   ├── pipelines/page.tsx           # Kanban deals board
│   └── tickets/page.tsx             # support ticket list
├── channels/
│   ├── page.tsx                     # connect/manage channels
│   └── [channelId]/bot/page.tsx     # bot configuration
└── messaging-analytics/
    └── page.tsx                     # per-channel stats + attribution funnel
```

### Inbox layout (3 columns)
- **Left:** channel filter tabs + conversation list (status badge, contact name, last message, contact stage chip)
- **Center:** chat window with message history, composer with quick-reply `/` trigger
- **Right:** Contact 360° sidebar — Shopify orders, ad attribution, active deals, open tickets, health score

### Contact 360° profile tabs
| Tab | Content |
|-----|---------|
| Resumen | LTV, status, health score, source campaign, first contact date |
| Conversaciones | Full chat history across all channels with timeline |
| Pedidos | All Shopify orders with status and Dropi tracking |
| Deals | Pipeline history and current active deals |
| Tickets | Support ticket history |
| Notas | Team notes with @mention support |

### Messaging Analytics — 90-day default
- Per-channel cards: volume, avg response time, resolution rate, attributed revenue
- Attribution funnel table: Leads → Chats → Deals → WON → Revenue + ROAS
- Stacked area chart (Recharts): open/pending/resolved per day
- Agent performance table: conversations handled, avg response time, CSAT score

### Plan gating UI pattern
- STARTER: feature visible, clicking shows upgrade modal with `PLAN_UPGRADE_REQUIRED` code
- PRO/SCALE: full access
- Bot flows config: PRO/SCALE only, with clear badge in UI

---

## 10. Exclusive Differentiators vs GoHighLevel

| Feature | GHL | Metria |
|---------|-----|--------|
| Pre-enriched conversations with order history | ✗ | ✓ |
| Ad attribution per conversation (which campaign) | ✗ | ✓ |
| ROAS per messaging channel | ✗ | ✓ |
| Bot action: lookup real Dropi tracking | ✗ | ✓ |
| Bot action: generate Shopify discount code | ✗ | ✓ |
| Customer health score (LTV + behavior) | ✗ | ✓ |
| Alert: ROAS drop correlated with complaint spike | ✗ | ✓ |
| Contact timeline: ad → chat → purchase → support | ✗ | ✓ |
| Auto-enrich contact from Shopify on first message | ✗ | ✓ |
| Collision detection between agents | ✗ | ✓ |

---

## 11. Build Order (Phases)

### Phase 1 — Foundation (no UI yet)
1. Prisma schema migration (all new models)
2. `planGate.ts` middleware
3. WebSocket server initialization in `app.ts`
4. `message.service.ts` + Shopify auto-enrichment
5. Telegram integration (simplest API, no OAuth)

### Phase 2 — Core Inbox
6. WhatsApp webhook + send
7. Instagram OAuth + webhook + send
8. Frontend: inbox 3-column layout (static, no real-time yet)
9. Frontend: WebSocket connection + live message updates

### Phase 3 — CRM
10. Contact CRUD + 360° profile
11. Pipeline + Kanban board
12. Ticket management
13. Contact health score calculation (daily cron)

### Phase 4 — Bot Engine
14. BotAgent + BotFlow CRUD
15. FlowEngine with all trigger/action types
16. Bot Builder UI
17. Quick replies + Business hours

### Phase 5 — Analytics
18. ChannelAnalyticSnapshot daily aggregation cron
19. Messaging analytics page
20. Attribution funnel dashboard
21. TikTok integration (beta)

---

## 12. Technical Dependencies to Add

```json
{
  "socket.io": "^4.x",
  "telegraf": "^4.x",
  "@bull-board/express": "^5.x",
  "bullmq": "^5.x"
}
```

Frontend:
```json
{
  "socket.io-client": "^4.x"
}
```
