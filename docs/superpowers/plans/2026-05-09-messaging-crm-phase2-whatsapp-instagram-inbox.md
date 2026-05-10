# Messaging + CRM — Phase 2: WhatsApp, Instagram & Live Inbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WhatsApp Business and Instagram DM channels (inbound + outbound), a unified send-message endpoint, and a 3-column live inbox UI with WebSocket real-time updates.

**Architecture:** Three new channel services follow the same pattern as `telegram.service.ts` — validate HMAC, parse platform format, call `processInboundMessage`. A new `inbox.service.ts` owns conversation listing + the unified `sendMessage()` dispatcher. The frontend `dashboard/inbox/` page uses `socket.io-client` to receive live events from the backend WebSocket server already running on port 4000.

**Tech Stack:** Node.js fetch (built-in), `crypto` (stdlib), `socket.io-client` 4.x, Next.js 16 App Router, Tailwind CSS 4, shadcn/ui, Zustand 5

**Spec reference:** `docs/superpowers/specs/2026-05-09-messaging-crm-design.md`

**Prerequisite:** Phase 1 complete — `message.service.ts`, `socket.handler.ts`, `messaging.controller.ts`, `messaging.routes.ts`, and all 15 Prisma models are in place.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `Backend/src/modules/messaging/inbox.service.ts` | getConversations, getMessages, sendMessage dispatcher |
| Create | `Backend/src/modules/messaging/__tests__/inbox.service.test.ts` | Tests for inbox.service |
| Create | `Backend/src/modules/messaging/channels/whatsapp.service.ts` | Meta Cloud API inbound parse + HMAC verify + outbound send |
| Create | `Backend/src/modules/messaging/__tests__/whatsapp.service.test.ts` | Tests for whatsapp.service |
| Create | `Backend/src/modules/messaging/channels/instagram.service.ts` | Meta Graph API inbound parse + HMAC verify + outbound send |
| Create | `Backend/src/modules/messaging/__tests__/instagram.service.test.ts` | Tests for instagram.service |
| Modify | `Backend/src/modules/messaging/messaging.controller.ts` | Add whatsapp/instagram webhook handlers + sendMessage |
| Modify | `Backend/src/modules/messaging/messaging.routes.ts` | Add WA/IG webhook routes + POST send route |
| Modify | `Backend/src/app.ts` | Add express.raw() for WA/IG webhook paths |
| Create | `metria-metrics/Frontend/src/lib/socket.ts` | socket.io-client singleton with JWT auth |
| Create | `metria-metrics/Frontend/src/hooks/useInbox.ts` | Conversation + message state + WebSocket events |
| Create | `metria-metrics/Frontend/src/app/dashboard/inbox/page.tsx` | 3-column inbox layout (Server Component shell) |
| Create | `metria-metrics/Frontend/src/app/dashboard/inbox/InboxClient.tsx` | Client Component — full inbox UI with live updates |
| Create | `metria-metrics/Frontend/src/app/dashboard/inbox/components/ConversationList.tsx` | Left column: filters + conversation list |
| Create | `metria-metrics/Frontend/src/app/dashboard/inbox/components/ChatWindow.tsx` | Center column: message history + composer |
| Create | `metria-metrics/Frontend/src/app/dashboard/inbox/components/ContactPanel.tsx` | Right column: contact info + status badge |

---

## Task 1: inbox.service.ts — Conversation Listing + Send Dispatcher

**Files:**
- Create: `Backend/src/modules/messaging/inbox.service.ts`
- Create: `Backend/src/modules/messaging/__tests__/inbox.service.test.ts`

### Context

`inbox.service.ts` is the backend's unified inbox layer. It provides:
- `getConversations()` — paginated list with optional filters
- `getMessages()` — cursor-paginated message history
- `sendMessage()` — stores outbound message + dispatches to the right channel service based on `channel.platform`

The `sendMessage` dispatcher imports channel services lazily to avoid circular deps. The WS emit for outbound messages reuses `getIO()` from `src/lib/socket.ts`. Auth: all functions take `workspaceId` and verify it matches DB records (multi-tenancy).

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/messaging/__tests__/inbox.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    message: { findMany: vi.fn(), create: vi.fn() },
    channel: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

// Channel service mocks — registered lazily per platform
vi.mock('../channels/whatsapp.service', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../channels/telegram.service', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined)
}))

import { getConversations, getMessages, sendMessage } from '../inbox.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('getConversations', () => {
  it('returns conversations scoped to workspaceId', async () => {
    const mockConvs = [{ id: 'c1', status: 'OPEN', contact: { name: 'Ana' } }]
    vi.mocked(prisma.conversation.findMany).mockResolvedValue(mockConvs as any)

    const result = await getConversations(WS_ID, {})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_ID }) })
    )
    expect(result).toEqual(mockConvs)
  })

  it('applies status filter when provided', async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([])

    await getConversations(WS_ID, { status: 'PENDING' })

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID, status: 'PENDING' })
      })
    )
  })
})

describe('getMessages', () => {
  it('returns messages for conversation in workspaceId', async () => {
    const mockMsgs = [{ id: 'm1', content: 'Hola', direction: 'INBOUND' }]
    vi.mocked(prisma.message.findMany).mockResolvedValue(mockMsgs as any)

    const result = await getMessages(WS_ID, 'conv-1', undefined)

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_ID, conversationId: 'conv-1' }) })
    )
    expect(result).toEqual(mockMsgs)
  })
})

describe('sendMessage', () => {
  it('throws if conversation not found in workspace', async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null)

    await expect(sendMessage(WS_ID, 'conv-x', 'user-1', 'Hola')).rejects.toThrow('Conversation not found')
  })

  it('creates outbound message and dispatches to channel service', async () => {
    const mockChannel = { id: 'ch-1', platform: 'WHATSAPP', config: { phoneNumberId: 'ph1', accessToken: 'tok' } }
    const mockContact = { id: 'ct-1', phone: '+56912345678' }
    const mockConv = { id: 'conv-1', workspaceId: WS_ID, channelId: 'ch-1', contactId: 'ct-1' }
    const mockMsg = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'AGENT', content: 'Hola', sentAt: new Date() }

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMsg as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    const { sendWhatsAppMessage } = await import('../channels/whatsapp.service')

    await sendMessage(WS_ID, 'conv-1', 'user-1', 'Hola')

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'OUTBOUND', senderType: 'AGENT', content: 'Hola' })
      })
    )
    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph1', 'tok', '+56912345678', 'Hola')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/inbox.service.test.ts
```
Expected: FAIL — `Cannot find module '../inbox.service'`

- [ ] **Step 3: Create inbox.service.ts**

Create `Backend/src/modules/messaging/inbox.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'

export interface GetConversationsOpts {
  status?: string
  channelId?: string
  limit?: number
  cursor?: string
}

export async function getConversations(workspaceId: string, opts: GetConversationsOpts) {
  const { status, channelId, limit = 30, cursor } = opts
  return prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(channelId && { channelId }),
      ...(cursor && { id: { lt: cursor } })
    },
    include: {
      contact: { select: { id: true, name: true, status: true, phone: true, avatarUrl: true } },
      channel: { select: { id: true, platform: true, name: true } }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit
  })
}

export async function getMessages(workspaceId: string, conversationId: string, cursor: string | undefined) {
  return prisma.message.findMany({
    where: {
      workspaceId,
      conversationId,
      ...(cursor && { id: { lt: cursor } })
    },
    orderBy: { sentAt: 'asc' },
    take: 50
  })
}

export async function sendMessage(
  workspaceId: string,
  conversationId: string,
  userId: string,
  content: string
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId }
  })
  if (!conversation) throw new Error('Conversation not found')

  const [channel, contact] = await Promise.all([
    prisma.channel.findUnique({ where: { id: conversation.channelId } }),
    prisma.contact.findUnique({ where: { id: conversation.contactId } })
  ])
  if (!channel) throw new Error(`Channel not found: ${conversation.channelId}`)
  if (!contact) throw new Error(`Contact not found: ${conversation.contactId}`)

  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      senderId: userId,
      content,
      status: 'SENT'
    }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } }
  })

  const config = channel.config as Record<string, string>

  switch (channel.platform) {
    case 'WHATSAPP': {
      const { sendWhatsAppMessage } = await import('./channels/whatsapp.service')
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, contact.phone!, content)
      break
    }
    case 'INSTAGRAM': {
      const { sendInstagramMessage } = await import('./channels/instagram.service')
      await sendInstagramMessage(config.pageAccessToken, contact.phone!, content)
      break
    }
    case 'TELEGRAM': {
      const { sendTelegramMessage } = await import('./channels/telegram.service')
      await sendTelegramMessage(config.botToken, contact.phone!, content)
      break
    }
    default:
      throw new Error(`Unsupported platform for outbound: ${channel.platform}`)
  }

  getIO()
    .to(`workspace:${workspaceId}`)
    .emit('message:new', {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      senderType: message.senderType,
      content: message.content,
      sentAt: message.sentAt
    })
}
```

- [ ] **Step 4: Run tests — expect failures about missing channel services**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/inbox.service.test.ts
```
Expected: some tests still fail because `whatsapp.service` and `telegram.service` don't export `sendWhatsAppMessage`/`sendTelegramMessage` yet. That's fine — continue to next steps.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/messaging/inbox.service.ts \
        "Backend/src/modules/messaging/__tests__/inbox.service.test.ts"
git commit -m "feat: inbox.service — getConversations, getMessages, sendMessage dispatcher"
```

---

## Task 2: WhatsApp Service

**Files:**
- Create: `Backend/src/modules/messaging/channels/whatsapp.service.ts`
- Create: `Backend/src/modules/messaging/__tests__/whatsapp.service.test.ts`

### Context

Meta Cloud API webhook flow:
1. **Verify** (GET): Meta sends `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` → return `hub.challenge` if token matches
2. **Inbound** (POST): body has `entry[].changes[].value.messages[]`. HMAC-SHA256 of raw body with app_secret must match `X-Hub-Signature-256` header.
3. **Outbound**: `POST https://graph.facebook.com/v18.0/{phoneNumberId}/messages`

Channel config JSON shape: `{ phoneNumberId: string, accessToken: string, appSecret: string, verifyToken: string }`

The HMAC verification and the inbound parse are the two testable units. The outbound HTTP call uses `fetch` (Node 18+, available in Node 24).

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/messaging/__tests__/whatsapp.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

import { verifyWhatsAppSignature, parseWhatsAppUpdate } from '../channels/whatsapp.service'
import { processInboundMessage } from '../message.service'

const APP_SECRET = 'test-secret'

function makeSignature(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('verifyWhatsAppSignature', () => {
  it('returns true when signature matches', () => {
    const body = '{"test":1}'
    const sig = makeSignature(body)
    expect(verifyWhatsAppSignature(body, sig, APP_SECRET)).toBe(true)
  })

  it('returns false when signature does not match', () => {
    expect(verifyWhatsAppSignature('{"test":1}', 'sha256=bad', APP_SECRET)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    expect(verifyWhatsAppSignature('{}', '', APP_SECRET)).toBe(false)
  })
})

describe('parseWhatsAppUpdate', () => {
  it('calls processInboundMessage for a text message', async () => {
    const body = {
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Juan Perez' }, wa_id: '56912345678' }],
            messages: [{
              id: 'wamid.123',
              from: '56912345678',
              timestamp: '1700000000',
              type: 'text',
              text: { body: 'Hola' }
            }]
          }
        }]
      }]
    }

    await parseWhatsAppUpdate('ws-1', 'ch-1', body)

    expect(processInboundMessage).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      channelId: 'ch-1',
      externalConversationId: '56912345678',
      externalMessageId: 'wamid.123',
      senderExternalId: '56912345678',
      senderName: 'Juan Perez',
      content: 'Hola',
      mediaUrl: undefined,
      mediaType: undefined
    })
  })

  it('skips non-message webhooks silently', async () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: '1', status: 'delivered' }] } }] }] }
    await parseWhatsAppUpdate('ws-1', 'ch-1', body)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/whatsapp.service.test.ts
```
Expected: FAIL — `Cannot find module '../channels/whatsapp.service'`

- [ ] **Step 3: Create whatsapp.service.ts**

Create `Backend/src/modules/messaging/channels/whatsapp.service.ts`:

```typescript
import crypto from 'crypto'
import { processInboundMessage } from '../message.service'

const GRAPH_API = 'https://graph.facebook.com/v18.0'

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  if (!signatureHeader.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  } catch {
    return false
  }
}

interface WhatsAppBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
        messages?: Array<{
          id: string
          from: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string }
          video?: { id: string; mime_type: string }
        }>
        statuses?: unknown[]
      }
    }>
  }>
}

export async function parseWhatsAppUpdate(workspaceId: string, channelId: string, body: WhatsAppBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value?.messages?.length) continue

      const contactMap = new Map((value.contacts ?? []).map(c => [c.wa_id, c.profile?.name]))

      for (const msg of value.messages) {
        if (msg.type !== 'text') continue
        await processInboundMessage({
          workspaceId,
          channelId,
          externalConversationId: msg.from,
          externalMessageId: msg.id,
          senderExternalId: msg.from,
          senderName: contactMap.get(msg.from),
          content: msg.text!.body,
          mediaUrl: undefined,
          mediaType: undefined
        })
      }
    }
  }
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp send failed (${res.status}): ${err}`)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/whatsapp.service.test.ts
```
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/messaging/channels/whatsapp.service.ts \
        "Backend/src/modules/messaging/__tests__/whatsapp.service.test.ts"
git commit -m "feat: WhatsApp service — HMAC verification, inbound parse, outbound send"
```

---

## Task 3: Instagram Service

**Files:**
- Create: `Backend/src/modules/messaging/channels/instagram.service.ts`
- Create: `Backend/src/modules/messaging/__tests__/instagram.service.test.ts`

### Context

Instagram DM webhook format differs from WhatsApp. It uses the Meta Messenger platform format via `entry[].messaging[]` arrays. Same HMAC verification as WhatsApp (same function signature). Outbound uses `POST graph.facebook.com/v18.0/me/messages`.

Channel config JSON shape: `{ instagramAccountId: string, pageAccessToken: string, appSecret: string, verifyToken: string }`

- [ ] **Step 1: Write failing tests**

Create `Backend/src/modules/messaging/__tests__/instagram.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

import { verifyInstagramSignature, parseInstagramUpdate } from '../channels/instagram.service'
import { processInboundMessage } from '../message.service'

const APP_SECRET = 'ig-secret'

function makeSig(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('verifyInstagramSignature', () => {
  it('returns true on valid signature', () => {
    const body = '{"test":1}'
    expect(verifyInstagramSignature(body, makeSig(body), APP_SECRET)).toBe(true)
  })

  it('returns false on invalid signature', () => {
    expect(verifyInstagramSignature('{}', 'sha256=bad', APP_SECRET)).toBe(false)
  })
})

describe('parseInstagramUpdate', () => {
  it('calls processInboundMessage for a DM text event', async () => {
    const body = {
      object: 'instagram',
      entry: [{
        id: 'page-123',
        messaging: [{
          sender: { id: 'ig-user-456' },
          recipient: { id: 'page-123' },
          timestamp: 1700000000,
          message: { mid: 'mid.abc123', text: 'Hola desde IG' }
        }]
      }]
    }

    await parseInstagramUpdate('ws-1', 'ch-ig', body)

    expect(processInboundMessage).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      channelId: 'ch-ig',
      externalConversationId: 'ig-user-456',
      externalMessageId: 'mid.abc123',
      senderExternalId: 'ig_ig-user-456',
      senderName: undefined,
      content: 'Hola desde IG',
      mediaUrl: undefined,
      mediaType: undefined
    })
  })

  it('skips echo messages (sender == recipient)', async () => {
    const body = {
      object: 'instagram',
      entry: [{
        id: 'page-123',
        messaging: [{
          sender: { id: 'page-123' },
          recipient: { id: 'ig-user-456' },
          timestamp: 1700000000,
          message: { mid: 'mid.echo', text: 'echo', is_echo: true }
        }]
      }]
    }

    await parseInstagramUpdate('ws-1', 'ch-ig', body)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/instagram.service.test.ts
```
Expected: FAIL — `Cannot find module '../channels/instagram.service'`

- [ ] **Step 3: Create instagram.service.ts**

Create `Backend/src/modules/messaging/channels/instagram.service.ts`:

```typescript
import crypto from 'crypto'
import { processInboundMessage } from '../message.service'

const GRAPH_API = 'https://graph.facebook.com/v18.0'

export function verifyInstagramSignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  if (!signatureHeader.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  } catch {
    return false
  }
}

interface MessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: { mid: string; text?: string; is_echo?: boolean; attachments?: Array<{ type: string; payload: { url?: string } }> }
}

interface InstagramBody {
  object?: string
  entry?: Array<{ id: string; messaging?: MessagingEvent[] }>
}

export async function parseInstagramUpdate(workspaceId: string, channelId: string, body: InstagramBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message || event.message.is_echo) continue

      const attachment = event.message.attachments?.[0]
      await processInboundMessage({
        workspaceId,
        channelId,
        externalConversationId: event.sender.id,
        externalMessageId: event.message.mid,
        senderExternalId: `ig_${event.sender.id}`,
        senderName: undefined,
        content: event.message.text,
        mediaUrl: attachment?.payload?.url,
        mediaType: attachment?.type
      })
    }
  }
}

export async function sendInstagramMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string
): Promise<void> {
  // recipientId stored as ig_{userId} — strip prefix for API call
  const igUserId = recipientId.startsWith('ig_') ? recipientId.slice(3) : recipientId
  const res = await fetch(`${GRAPH_API}/me/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: { text }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram send failed (${res.status}): ${err}`)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd Backend && npx vitest run src/modules/messaging/__tests__/instagram.service.test.ts
```
Expected: all 3 tests PASS

- [ ] **Step 5: Run all backend tests**

```bash
cd Backend && npx vitest run
```
Expected: all tests pass (inbox.service tests may still fail on `sendTelegramMessage` — fix that next)

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/messaging/channels/instagram.service.ts \
        "Backend/src/modules/messaging/__tests__/instagram.service.test.ts"
git commit -m "feat: Instagram service — HMAC verification, inbound parse, outbound send"
```

---

## Task 4: Add sendTelegramMessage + Fix inbox.service Tests

**Files:**
- Modify: `Backend/src/modules/messaging/channels/telegram.service.ts`
- Run tests to confirm all pass

### Context

`inbox.service.ts` has a `case 'TELEGRAM'` dispatch that calls `sendTelegramMessage(botToken, phone, text)`. The existing `telegram.service.ts` doesn't have this function yet. Add it now.

Telegram outbound: `POST https://api.telegram.org/bot{token}/sendMessage` with `{ chat_id, text }`. The `contact.phone` for Telegram contacts is `tg_{userId}` — strip the prefix to get the Telegram chat ID.

- [ ] **Step 1: Read telegram.service.ts**

Read `Backend/src/modules/messaging/channels/telegram.service.ts` to see the current exports.

- [ ] **Step 2: Add sendTelegramMessage**

Add to the end of `Backend/src/modules/messaging/channels/telegram.service.ts`:

```typescript
export async function sendTelegramMessage(
  botToken: string,
  phone: string,
  text: string
): Promise<void> {
  const chatId = phone.startsWith('tg_') ? phone.slice(3) : phone
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram send failed (${res.status}): ${err}`)
  }
}
```

- [ ] **Step 3: Run all backend tests**

```bash
cd Backend && npx vitest run
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add Backend/src/modules/messaging/channels/telegram.service.ts
git commit -m "feat: add sendTelegramMessage outbound to telegram.service"
```

---

## Task 5: Update Controller + Routes + app.ts Raw Body

**Files:**
- Modify: `Backend/src/modules/messaging/messaging.controller.ts`
- Modify: `Backend/src/modules/messaging/messaging.routes.ts`
- Modify: `Backend/src/app.ts`

### Context

Three new controller groups:
1. **WhatsApp webhook**: `GET /api/webhooks/whatsapp/:workspaceId` (verify challenge) + `POST /api/webhooks/whatsapp/:workspaceId` (inbound)
2. **Instagram webhook**: `GET /api/webhooks/instagram/:workspaceId` + `POST /api/webhooks/instagram/:workspaceId`
3. **Send message**: `POST /api/messaging/conversations/:conversationId/messages` (PRO/SCALE)

The WhatsApp/Instagram webhooks need the raw request body for HMAC verification. Add `express.raw({ type: 'application/json' })` in `app.ts` before the `express.json()` middleware for these paths. The raw body is available as `req.body` (Buffer) — convert to string before passing to the verify function.

Channel lookup: webhooks identify the channel by `workspaceId` + `platform`. Since a workspace can have multiple channels, look up the first active channel matching `{ workspaceId, platform: 'WHATSAPP' }` (or `INSTAGRAM`). The `config.verifyToken` is used for the GET verify handshake.

- [ ] **Step 1: Read current messaging.controller.ts**

Read `Backend/src/modules/messaging/messaging.controller.ts` to see existing structure (telegramWebhook, getConversations, getMessages are already there).

- [ ] **Step 2: Add new controllers to messaging.controller.ts**

Append to `Backend/src/modules/messaging/messaging.controller.ts`:

```typescript
import { getConversations as _getConversations, getMessages as _getMessages, sendMessage as _sendMessage } from './inbox.service'
import { verifyWhatsAppSignature, parseWhatsAppUpdate } from './channels/whatsapp.service'
import { verifyInstagramSignature, parseInstagramUpdate } from './channels/instagram.service'

// Replaces existing getConversations and getMessages — they now call inbox.service
export async function getConversationsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const { status, channelId, cursor } = req.query as Record<string, string>
    const convs = await _getConversations(workspaceId, { status, channelId, cursor })
    res.json(convs)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
}

export async function getMessagesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const { conversationId } = req.params
    const { cursor } = req.query as Record<string, string>
    const msgs = await _getMessages(workspaceId, conversationId, cursor)
    res.json(msgs)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
}

export async function sendMessageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const userId = req.user!.id
    const { conversationId } = req.params
    const { content } = req.body
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
    await _sendMessage(workspaceId, conversationId, userId, content.trim())
    res.status(201).json({ ok: true })
  } catch (err: any) {
    const status = err.message === 'Conversation not found' ? 404 : 500
    res.status(status).json({ error: err.message })
  }
}

async function getActiveChannel(workspaceId: string, platform: string) {
  const { prisma } = await import('../../lib/prisma')
  return prisma.channel.findFirst({ where: { workspaceId, platform, status: 'CONNECTED' } })
}

export async function whatsappWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
  const workspaceId = req.params.workspaceId
  const channel = await getActiveChannel(workspaceId, 'WHATSAPP')
  const config = channel?.config as Record<string, string> | undefined
  if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
  res.status(200).send(challenge)
}

export async function whatsappWebhook(req: Request, res: Response): Promise<void> {
  const workspaceId = req.params.workspaceId
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
  const signature = req.headers['x-hub-signature-256'] as string ?? ''
  const channel = await getActiveChannel(workspaceId, 'WHATSAPP')
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
  const config = channel.config as Record<string, string>
  if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }
  res.status(200).json({ ok: true })
  const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body
  parseWhatsAppUpdate(workspaceId, channel.id, body).catch(err => console.error('[WhatsApp webhook]', err))
}

export async function instagramWebhookVerify(req: Request, res: Response): Promise<void> {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>
  if (mode !== 'subscribe') { res.status(400).send('Bad request'); return }
  const workspaceId = req.params.workspaceId
  const channel = await getActiveChannel(workspaceId, 'INSTAGRAM')
  const config = channel?.config as Record<string, string> | undefined
  if (!channel || token !== config?.verifyToken) { res.status(403).send('Forbidden'); return }
  res.status(200).send(challenge)
}

export async function instagramWebhook(req: Request, res: Response): Promise<void> {
  const workspaceId = req.params.workspaceId
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
  const signature = req.headers['x-hub-signature-256'] as string ?? ''
  const channel = await getActiveChannel(workspaceId, 'INSTAGRAM')
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
  const config = channel.config as Record<string, string>
  if (!verifyInstagramSignature(rawBody, signature, config.appSecret)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }
  res.status(200).json({ ok: true })
  const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body
  parseInstagramUpdate(workspaceId, channel.id, body).catch(err => console.error('[Instagram webhook]', err))
}
```

**Important:** The file already imports `Request, Response` and `AuthRequest` at the top. Add the missing imports at the top of the file. Do NOT duplicate imports — just add the lines that are missing.

- [ ] **Step 3: Update messaging.routes.ts**

Read `Backend/src/modules/messaging/messaging.routes.ts`. Replace the entire file with the updated version below (it supersedes the existing routes):

```typescript
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import {
  telegramWebhook,
  whatsappWebhookVerify,
  whatsappWebhook,
  instagramWebhookVerify,
  instagramWebhook,
  getConversationsHandler,
  getMessagesHandler,
  sendMessageHandler
} from './messaging.controller'

const router = Router()

// Public webhooks — no JWT, identified by workspaceId in URL
router.post('/webhooks/telegram/:workspaceId', telegramWebhook)
router.get('/webhooks/whatsapp/:workspaceId', whatsappWebhookVerify)
router.post('/webhooks/whatsapp/:workspaceId', whatsappWebhook)
router.get('/webhooks/instagram/:workspaceId', instagramWebhookVerify)
router.post('/webhooks/instagram/:workspaceId', instagramWebhook)

// Authenticated inbox routes — PRO and SCALE plans only
router.get('/messaging/conversations', authenticate, requirePlan('PRO', 'SCALE'), getConversationsHandler)
router.get('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), getMessagesHandler)
router.post('/messaging/conversations/:conversationId/messages', authenticate, requirePlan('PRO', 'SCALE'), sendMessageHandler)

export default router
```

- [ ] **Step 4: Add raw body parsers to app.ts**

Read `Backend/src/app.ts`. Find the line `app.use('/webhooks/shopify', express.raw(...))` and add two more lines immediately after it:

```typescript
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/instagram', express.raw({ type: 'application/json' }))
```

- [ ] **Step 5: Build the backend to confirm no TypeScript errors**

```bash
cd Backend && npm run build 2>&1 | tail -10
```
Expected: `CJS ⚡️ Build success`

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/messaging/messaging.controller.ts \
        Backend/src/modules/messaging/messaging.routes.ts \
        Backend/src/app.ts
git commit -m "feat: WhatsApp/Instagram webhooks, sendMessage endpoint, raw body parsing"
```

---

## Task 6: Frontend — Install socket.io-client + Socket Provider

**Files:**
- Modify: `metria-metrics/Frontend/package.json` (via pnpm add)
- Create: `metria-metrics/Frontend/src/lib/socket.ts`
- Create: `metria-metrics/Frontend/src/hooks/useInbox.ts`

### Context

The backend socket server is already running at `ws://localhost:4000`. It authenticates via `socket.handshake.auth.token` (JWT from localStorage key `metria_token`). On connect it joins the `workspace:{workspaceId}` room.

Frontend socket flow:
1. `socket.ts` exports a lazy singleton that reads `metria_token` from localStorage
2. `useInbox` hook manages: conversation list, selected conversation, message list, loading state, WS subscription
3. WS events to handle: `conversation:new` (prepend to list), `message:new` (append to messages if active conversation matches)

The existing frontend pattern for localStorage + hydration: always use the `mounted` pattern for components that read localStorage.

API base URL: `process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api'`

- [ ] **Step 1: Install socket.io-client**

```bash
cd metria-metrics/Frontend && pnpm add socket.io-client
```

Expected: `socket.io-client` added to `package.json` dependencies.

- [ ] **Step 2: Create src/lib/socket.ts**

Create `metria-metrics/Frontend/src/lib/socket.ts`:

```typescript
import { io, Socket } from 'socket.io-client'

let _socket: Socket | null = null

export function getSocket(): Socket {
  if (!_socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('metria_token') : null
    _socket = io(process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://127.0.0.1:4000', {
      auth: { token },
      autoConnect: false
    })
  }
  return _socket
}

export function disconnectSocket(): void {
  if (_socket?.connected) _socket.disconnect()
  _socket = null
}
```

- [ ] **Step 3: Create src/hooks/useInbox.ts**

Create `metria-metrics/Frontend/src/hooks/useInbox.ts`:

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSocket } from '@/lib/socket'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api'

function authHeaders() {
  const token = localStorage.getItem('metria_token')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export interface Conversation {
  id: string
  status: string
  lastMessageAt: string | null
  messageCount: number
  channel: { id: string; platform: string; name: string }
  contact: { id: string; name: string; status: string; phone: string | null; avatarUrl: string | null }
}

export interface Message {
  id: string
  conversationId: string
  direction: 'INBOUND' | 'OUTBOUND'
  senderType: string
  content: string | null
  mediaUrl: string | null
  sentAt: string
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  // Fetch conversations on mount
  useEffect(() => {
    fetch(`${API}/messaging/conversations`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setConversations(data) })
      .catch(console.error)
      .finally(() => setLoadingConvs(false))
  }, [])

  // Fetch messages when selected conversation changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    setLoadingMsgs(true)
    fetch(`${API}/messaging/conversations/${selectedId}/messages`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMessages(data) })
      .catch(console.error)
      .finally(() => setLoadingMsgs(false))
  }, [selectedId])

  // WebSocket subscription
  useEffect(() => {
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    function onConversationNew(conv: Conversation) {
      setConversations(prev => [conv, ...prev.filter(c => c.id !== conv.id)])
    }

    function onMessageNew(msg: Message) {
      setMessages(prev => {
        if (msg.conversationId !== selectedId) return prev
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // Bump conversation to top
      setConversations(prev => prev.map(c =>
        c.id === msg.conversationId ? { ...c, lastMessageAt: msg.sentAt } : c
      ).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')))
    }

    socket.on('conversation:new', onConversationNew)
    socket.on('message:new', onMessageNew)

    return () => {
      socket.off('conversation:new', onConversationNew)
      socket.off('message:new', onMessageNew)
    }
  }, [selectedId])

  const selectConversation = useCallback((id: string) => setSelectedId(id), [])

  const sendMessage = useCallback(async (content: string) => {
    if (!selectedId || !content.trim()) return
    const res = await fetch(`${API}/messaging/conversations/${selectedId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: content.trim() })
    })
    if (!res.ok) throw new Error('Failed to send message')
  }, [selectedId])

  return { conversations, selectedId, messages, loadingConvs, loadingMsgs, selectConversation, sendMessage }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd metria-metrics/Frontend && pnpm build 2>&1 | tail -20
```
Expected: build succeeds (no errors for the new files — inbox page doesn't exist yet so it won't be caught by App Router)

- [ ] **Step 5: Commit**

```bash
git add metria-metrics/Frontend/package.json \
        metria-metrics/Frontend/pnpm-lock.yaml \
        metria-metrics/Frontend/src/lib/socket.ts \
        metria-metrics/Frontend/src/hooks/useInbox.ts
git commit -m "feat: socket.io-client, socket singleton, useInbox hook with live WS updates"
```

---

## Task 7: Frontend — 3-Column Inbox Page

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/InboxClient.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/components/ConversationList.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/components/ChatWindow.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/components/ContactPanel.tsx`

### Context

Follow the existing dashboard page pattern: `page.tsx` is a Server Component that exports `metadata` and renders the Client Component shell. The Client Component imports `useInbox`.

Layout: fixed-height viewport (no page scroll), `h-screen` minus the sidebar height (`calc(100vh - 64px)` assuming 64px top nav). Three columns: left 280px, center flex-1, right 320px.

Channel platform colors: WHATSAPP=green-500, INSTAGRAM=pink-500, TELEGRAM=blue-500, TIKTOK=black.

Conversation status badge colors: OPEN=green, PENDING=yellow, CLOSED=gray.

Look at `metria-metrics/Frontend/src/app/dashboard/sales/page.tsx` for the metadata export pattern and `dashboard/layout.tsx` for the surrounding shell before writing this task.

- [ ] **Step 1: Check the sidebar and dashboard layout for correct height/padding**

Read `metria-metrics/Frontend/src/app/dashboard/layout.tsx` to understand the wrapper structure.

- [ ] **Step 2: Create page.tsx (Server Component)**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { InboxClient } from './InboxClient'

export const metadata: Metadata = {
  title: 'Inbox | Metria',
  description: 'Unified messaging inbox — WhatsApp, Instagram, Telegram'
}

export default function InboxPage() {
  return <InboxClient />
}
```

- [ ] **Step 3: Create InboxClient.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/InboxClient.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useInbox } from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ContactPanel } from './components/ContactPanel'

export function InboxClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { conversations, selectedId, messages, loadingConvs, loadingMsgs, selectConversation, sendMessage } = useInbox()

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  if (!mounted) {
    return (
      <div className="flex h-[calc(100vh-64px)] animate-pulse">
        <div className="w-[280px] bg-muted/30 border-r" />
        <div className="flex-1 bg-background" />
        <div className="w-[320px] bg-muted/30 border-l" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        loading={loadingConvs}
        onSelect={selectConversation}
      />
      <ChatWindow
        conversation={selectedConv}
        messages={messages}
        loading={loadingMsgs}
        onSend={sendMessage}
      />
      <ContactPanel contact={selectedConv?.contact ?? null} />
    </div>
  )
}
```

- [ ] **Step 4: Create ConversationList.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/components/ConversationList.tsx`:

```tsx
'use client'
import { Conversation } from '@/hooks/useInbox'

const PLATFORM_COLOR: Record<string, string> = {
  WHATSAPP: 'bg-green-500',
  INSTAGRAM: 'bg-pink-500',
  TELEGRAM: 'bg-blue-500',
  TIKTOK: 'bg-neutral-900'
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-green-400',
  PENDING: 'bg-yellow-400',
  CLOSED: 'bg-neutral-400'
}

interface Props {
  conversations: Conversation[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, selectedId, loading, onSelect }: Props) {
  return (
    <aside className="w-[280px] border-r flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b font-semibold text-sm">Conversaciones</div>
      {loading ? (
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Sin conversaciones
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <li
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 border-b transition-colors ${
                selectedId === conv.id ? 'bg-muted/60' : ''
              }`}
            >
              <div className="relative mt-1 shrink-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
                  {conv.contact.name.charAt(0)}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${PLATFORM_COLOR[conv.channel.platform] ?? 'bg-gray-400'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate">{conv.contact.name}</span>
                  <span className={`shrink-0 w-2 h-2 rounded-full ${STATUS_COLOR[conv.status] ?? 'bg-neutral-400'}`} title={conv.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{conv.channel.name}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
```

- [ ] **Step 5: Create ChatWindow.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/components/ChatWindow.tsx`:

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { Conversation, Message } from '@/hooks/useInbox'

interface Props {
  conversation: Conversation | null
  messages: Message[]
  loading: boolean
  onSend: (content: string) => Promise<void>
}

export function ChatWindow({ conversation, messages, loading, onSend }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await onSend(input)
      setInput('')
    } catch {
      // error handling — toast would go here in Phase 3
    } finally {
      setSending(false)
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border-r">
        Selecciona una conversación
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
          {conversation.contact.name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold">{conversation.contact.name}</p>
          <p className="text-xs text-muted-foreground">{conversation.channel.platform} · {conversation.status}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-8 w-48 rounded-xl bg-muted/40 animate-pulse ${i % 2 === 0 ? '' : 'ml-auto'}`} />
            ))}
          </div>
        ) : messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
              msg.direction === 'OUTBOUND'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted rounded-bl-sm'
            }`}>
              {msg.content ?? '[media]'}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-3 py-2 border-t flex gap-2 shrink-0">
        <input
          className="flex-1 rounded-full border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Escribe un mensaje..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="shrink-0 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {sending ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create ContactPanel.tsx**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/components/ContactPanel.tsx`:

```tsx
'use client'
import { Conversation } from '@/hooks/useInbox'

const CONTACT_STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead',
  PROSPECT: 'Prospecto',
  CUSTOMER: 'Cliente',
  VIP: 'VIP',
  CHURNED: 'Inactivo'
}

const CONTACT_STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700',
  PROSPECT: 'bg-purple-100 text-purple-700',
  CUSTOMER: 'bg-green-100 text-green-700',
  VIP: 'bg-yellow-100 text-yellow-700',
  CHURNED: 'bg-red-100 text-red-700'
}

type Props = { contact: Conversation['contact'] | null }

export function ContactPanel({ contact }: Props) {
  if (!contact) {
    return <aside className="w-[320px] border-l flex items-center justify-center text-muted-foreground text-sm" />
  }

  return (
    <aside className="w-[320px] border-l flex flex-col overflow-y-auto shrink-0">
      <div className="px-4 py-3 border-b font-semibold text-sm">Perfil del contacto</div>
      <div className="px-4 py-4 flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-bold uppercase">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt={contact.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            contact.name.charAt(0)
          )}
        </div>
        <p className="font-semibold text-sm">{contact.name}</p>
        {contact.phone && (
          <p className="text-xs text-muted-foreground">{contact.phone}</p>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTACT_STATUS_COLOR[contact.status] ?? 'bg-muted'}`}>
          {CONTACT_STATUS_LABEL[contact.status] ?? contact.status}
        </span>
      </div>
      <div className="px-4 py-2 border-t">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Integración CRM</p>
        <p className="text-xs text-muted-foreground">Disponible en Fase 3</p>
      </div>
    </aside>
  )
}
```

- [ ] **Step 7: Build frontend to check for TypeScript errors**

```bash
cd metria-metrics/Frontend && pnpm build 2>&1 | tail -20
```
Expected: build succeeds with no type errors

- [ ] **Step 8: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/inbox/
git commit -m "feat: 3-column inbox page with live WebSocket updates — WhatsApp, Instagram, Telegram"
```

---

## Phase 2 Complete ✓

What's working after Phase 2:
- WhatsApp inbound (HMAC-verified webhook) + outbound send
- Instagram inbound (HMAC-verified webhook) + outbound send
- Telegram outbound send (added to existing service)
- `POST /api/messaging/conversations/:id/messages` — unified send endpoint (PRO/SCALE)
- `GET /api/messaging/conversations` + `GET .../messages` — now using inbox.service
- Frontend 3-column inbox at `/dashboard/inbox` with live WebSocket updates
- Conversation list with platform badge + status indicator
- Chat window with message history and composer
- Contact panel with status chip

**Next:** `2026-05-09-messaging-crm-phase3-crm.md`
— Contact 360° profile, deal pipeline Kanban, tickets/helpdesk, Shopify enrichment on first contact.
