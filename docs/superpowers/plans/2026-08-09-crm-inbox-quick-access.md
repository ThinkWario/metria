# CRM → Inbox Quick Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an agent jump from a CRM contact (list row or detail page) straight into that contact's Inbox conversation, instead of searching for them manually in the chatbox.

**Architecture:** Two CRM screens gain "open chat" affordances that `router.push` to `/dashboard/inbox` with a `conversationId` (exact) or `contactId` (resolve to most-recent) query param. `InboxClient` reads that param via `useSearchParams`, resolves it against the already-loaded conversation list through a small pure helper, and selects it — widening the status filter to `ALL` first if the target isn't visible under the current one. A related backend bug (WhatsApp template sends not incrementing `messageCount`) is fixed alongside since it surfaced during design and touches the same code path.

**Tech Stack:** Next.js 16 App Router (client components), React 19, TypeScript, `@/components/ui/tooltip` (Radix), `sonner` toasts, Vitest + React Testing Library (frontend), Vitest (backend), Prisma.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-crm-inbox-quick-access-design.md`
- `contactId` deep link resolves to the conversation with the latest `lastMessageAt` for that contact (spec §1, confirmed with user).
- "Active channel" = contact has ≥1 `conversation` record for that platform — never gate on `messageCount` (spec: this is precisely the bug being fixed elsewhere).
- Not-found deep link (conversation deleted/no permission) → `toast.error('Conversación no encontrada')`, fall back to normal Inbox view. Never a blank screen or crash.
- All new user-facing copy in neutral/Chilean Spanish — no Argentine voseo ("tú" conjugation, not "vos").
- `useSearchParams()` requires a `<Suspense>` boundary in Next.js App Router — `InboxClient` must be split into an outer Suspense-wrapping component and an inner content component.
- Follow existing patterns exactly: Tooltip usage mirrors `QuickReplyPicker.tsx` (`TooltipProvider` > `Tooltip` > `TooltipTrigger asChild` > `TooltipContent`); test mocking mirrors `src/test/contact-merge.test.tsx` (`vi.mock('@/lib/api', ...)`, `vi.hoisted` for mock functions referenced inside `vi.mock` factories).

---

### Task 1: Backend — fix `messageCount` not incremented on WhatsApp template send

**Files:**
- Modify: `Backend/src/modules/messaging/message.service.ts:123`
- Test: `Backend/src/modules/messaging/__tests__/message.service.test.ts`

**Interfaces:**
- Consumes: nothing new — `sendOutboundWhatsAppTemplate(workspaceId, conversationId, templateId)` already exported (`message.service.ts:91`).
- Produces: no signature change. Downstream behavior only — `conversation.messageCount` now increments on template sends, matching the other two outbound paths.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `Backend/src/modules/messaging/__tests__/message.service.test.ts`. Insert it after the existing `describe('processInboundMessage', ...)` block closes and update the import list at the top of the file first:

```ts
// Change this existing import line:
import { processInboundMessage, sendOutboundPlatformMessage, sendInternalWhatsAppTemplate } from '../message.service'
// to:
import { processInboundMessage, sendOutboundPlatformMessage, sendInternalWhatsAppTemplate, sendOutboundWhatsAppTemplate } from '../message.service'
```

```ts
describe('sendOutboundWhatsAppTemplate', () => {
  it('increments conversation.messageCount when the template send succeeds', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: 'conv-1',
      channelId: CHANNEL_ID,
      externalId: '56912345678',
      channel: { platform: 'WHATSAPP', config: { phoneNumberId: 'pn-1', accessToken: 'token-1' } },
      contact: { name: 'Herbert Orrego' }
    } as any)
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', channelId: CHANNEL_ID, status: 'APPROVED',
      name: 'confirmacion_visita', language: 'es', bodyText: 'Hola {{1}}, gracias por tu interés.'
    } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: 'msg-1', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'BOT',
      content: 'Hola Herbert Orrego, gracias por tu interés.', status: 'SENT', sentAt: new Date('2026-08-09T12:00:00.000Z')
    } as any)

    await sendOutboundWhatsAppTemplate(WORKSPACE_ID, 'conv-1', 'tpl-1')

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: expect.objectContaining({ messageCount: { increment: 1 } })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/message.service.test.ts -t "increments conversation.messageCount"`
Expected: FAIL — `data` was called with `{ lastMessageAt: expect.any(Date) }`, missing `messageCount: { increment: 1 } }`.

- [ ] **Step 3: Fix the implementation**

In `Backend/src/modules/messaging/message.service.ts`, change line 123:

```ts
// Before:
await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })

// After (inside sendOutboundWhatsAppTemplate — the ONLY occurrence at line 123, not the other outbound paths which already increment):
await prisma.conversation.update({
  where: { id: conversationId },
  data: { lastMessageAt: new Date(), messageCount: { increment: 1 } }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/message.service.test.ts`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
cd Backend
git add src/modules/messaging/message.service.ts src/modules/messaging/__tests__/message.service.test.ts
git commit -m "fix(messaging): increment conversation.messageCount on WhatsApp template send"
```

---

### Task 2: Frontend — pure deep-link resolver

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/inbox/resolveDeepLinkConversation.ts`
- Test: `metria-metrics/Frontend/src/app/dashboard/inbox/__tests__/resolveDeepLinkConversation.test.ts`

**Interfaces:**
- Consumes: `Conversation` type from `@/hooks/useInbox` (already has `id`, `contact.id`, `lastMessageAt?: string`).
- Produces: `resolveDeepLinkConversation(conversations: Conversation[], params: { conversationId?: string | null; contactId?: string | null }): Conversation | null` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/__tests__/resolveDeepLinkConversation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveDeepLinkConversation } from '../resolveDeepLinkConversation'
import type { Conversation } from '@/hooks/useInbox'

const baseContact = { id: 'contact-1', name: 'Test Contact', phone: '+56900000000', status: 'LEAD', ltv: 0, source: 'WHATSAPP_DIRECT' }

function makeConversation(overrides: Partial<Conversation> & { contactId?: string } = {}): Conversation {
  const { contactId, ...rest } = overrides
  return {
    id: 'conv-1',
    status: 'OPEN',
    messageCount: 1,
    lastMessageAt: undefined,
    isHandledByBot: true,
    contact: { ...baseContact, id: contactId ?? baseContact.id },
    channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...rest
  }
}

describe('resolveDeepLinkConversation', () => {
  it('returns the exact conversation when conversationId matches', () => {
    const target = makeConversation({ id: 'conv-2' })
    const conversations = [makeConversation({ id: 'conv-1' }), target]

    expect(resolveDeepLinkConversation(conversations, { conversationId: 'conv-2' })).toBe(target)
  })

  it('returns null when conversationId has no match', () => {
    const conversations = [makeConversation({ id: 'conv-1' })]
    expect(resolveDeepLinkConversation(conversations, { conversationId: 'missing' })).toBeNull()
  })

  it('returns the only conversation for a contact when contactId matches one', () => {
    const target = makeConversation({ id: 'conv-1', contactId: 'contact-9' })
    const conversations = [target, makeConversation({ id: 'conv-2', contactId: 'contact-other' })]

    expect(resolveDeepLinkConversation(conversations, { contactId: 'contact-9' })).toBe(target)
  })

  it('returns the most recently active conversation when a contact has several', () => {
    const older = makeConversation({ id: 'conv-old', contactId: 'contact-9', lastMessageAt: '2026-01-01T00:00:00.000Z' })
    const newer = makeConversation({ id: 'conv-new', contactId: 'contact-9', lastMessageAt: '2026-02-01T00:00:00.000Z' })

    expect(resolveDeepLinkConversation([older, newer], { contactId: 'contact-9' })).toBe(newer)
  })

  it('treats a missing lastMessageAt as older than any dated conversation', () => {
    const undated = makeConversation({ id: 'conv-undated', contactId: 'contact-9', lastMessageAt: undefined })
    const dated = makeConversation({ id: 'conv-dated', contactId: 'contact-9', lastMessageAt: '2026-01-01T00:00:00.000Z' })

    expect(resolveDeepLinkConversation([undated, dated], { contactId: 'contact-9' })).toBe(dated)
  })

  it('returns null when the contact has no conversations', () => {
    const conversations = [makeConversation({ contactId: 'contact-other' })]
    expect(resolveDeepLinkConversation(conversations, { contactId: 'contact-9' })).toBeNull()
  })

  it('returns null when neither param is provided', () => {
    expect(resolveDeepLinkConversation([makeConversation()], {})).toBeNull()
  })

  it('conversationId takes priority when both params are provided', () => {
    const target = makeConversation({ id: 'conv-2', contactId: 'contact-9' })
    const conversations = [makeConversation({ id: 'conv-1', contactId: 'contact-1' }), target]

    expect(resolveDeepLinkConversation(conversations, { conversationId: 'conv-2', contactId: 'contact-1' })).toBe(target)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/inbox/__tests__/resolveDeepLinkConversation.test.ts`
Expected: FAIL — cannot find module `../resolveDeepLinkConversation`.

- [ ] **Step 3: Write the implementation**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/resolveDeepLinkConversation.ts`:

```ts
import type { Conversation } from '@/hooks/useInbox'

interface DeepLinkParams {
  conversationId?: string | null
  contactId?: string | null
}

/**
 * Resolves a CRM "open chat" deep link into the conversation it should select.
 * `conversationId` is exact and takes priority; `contactId` picks the contact's
 * most recently active conversation — used by the CRM contacts list, which only
 * knows the contact, not a specific conversation.
 */
export function resolveDeepLinkConversation(
  conversations: Conversation[],
  { conversationId, contactId }: DeepLinkParams
): Conversation | null {
  if (conversationId) {
    return conversations.find(c => c.id === conversationId) ?? null
  }
  if (contactId) {
    const matches = conversations.filter(c => c.contact.id === contactId)
    if (matches.length === 0) return null
    return matches.reduce((latest, current) => {
      const latestTime = latest.lastMessageAt ? new Date(latest.lastMessageAt).getTime() : -1
      const currentTime = current.lastMessageAt ? new Date(current.lastMessageAt).getTime() : -1
      return currentTime > latestTime ? current : latest
    })
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/inbox/__tests__/resolveDeepLinkConversation.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
cd metria-metrics/Frontend
git add src/app/dashboard/inbox/resolveDeepLinkConversation.ts src/app/dashboard/inbox/__tests__/resolveDeepLinkConversation.test.ts
git commit -m "feat(inbox): add pure resolver for CRM quick-access deep links"
```

---

### Task 3: Frontend — wire deep-link resolution into `InboxClient`

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/inbox/InboxClient.tsx` (full rewrite of the file's structure — split into `InboxContent` + Suspense-wrapped `InboxClient`)
- Test: `metria-metrics/Frontend/src/app/dashboard/inbox/__tests__/InboxClient.test.tsx`

**Interfaces:**
- Consumes: `resolveDeepLinkConversation` from Task 2 (`./resolveDeepLinkConversation`); `useInbox()` from `@/hooks/useInbox` (unchanged signature).
- Produces: `InboxClient` export unchanged in name/usage (`InboxPage` in `page.tsx` still does `<InboxClient />`) — no changes needed to `page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `metria-metrics/Frontend/src/app/dashboard/inbox/__tests__/InboxClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InboxClient } from '../InboxClient'

const { mockRouterReplace, mockUseSearchParams, mockUseInbox } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockUseInbox: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: mockUseSearchParams
}))
vi.mock('@/hooks/useInbox', () => ({ useInbox: mockUseInbox }))
vi.mock('../components/ConversationList', () => ({ ConversationList: () => <div data-testid="conversation-list" /> }))
vi.mock('../components/ChatWindow', () => ({ ChatWindow: () => <div data-testid="chat-window" /> }))
vi.mock('../components/ContactPanel', () => ({ ContactPanel: () => <div data-testid="contact-panel" /> }))
vi.mock('../components/PlatformFilterBar', () => ({ PlatformFilterBar: () => <div data-testid="platform-filter-bar" /> }))

const mockSetSelectedId = vi.fn()
const mockMarkAsRead = vi.fn()
const mockSetStatusFilter = vi.fn()

const conv1 = {
  id: 'conv-1', status: 'OPEN', messageCount: 1, lastMessageAt: '2026-01-01T00:00:00.000Z',
  isHandledByBot: true, contact: { id: 'contact-9', name: 'Herbert', phone: '+56900000001', status: 'LEAD', ltv: 0, source: 'SOLAR_DIRECT' },
  channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' }, createdAt: '2026-01-01T00:00:00.000Z'
}

function baseInboxState(overrides: Partial<ReturnType<typeof mockUseInbox>> = {}) {
  return {
    conversations: [conv1],
    selectedId: null,
    setSelectedId: mockSetSelectedId,
    messages: [],
    loadingConvs: false,
    loadingMsgs: false,
    sendMessage: vi.fn(), sendTemplate: vi.fn(), handoverToHuman: vi.fn(), handbackToBot: vi.fn(),
    markAsRead: mockMarkAsRead, markAsUnread: vi.fn(), changeStatus: vi.fn(), assignConversation: vi.fn(),
    statusFilter: 'OPEN', setStatusFilter: mockSetStatusFilter, platformFilter: 'ALL', setPlatformFilter: vi.fn(),
    search: '', setSearch: vi.fn(), assignedToMe: false, setAssignedToMe: vi.fn(), users: [],
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InboxClient — deep link resolution', () => {
  it('selects the conversation and clears the URL when conversationId matches under the current filter', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-1' }))
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)

    await waitFor(() => expect(mockSetSelectedId).toHaveBeenCalledWith('conv-1'))
    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1')
    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/inbox')
  })

  it('widens the status filter to ALL when the conversation is not visible under the current filter, then selects it once loaded', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-closed' }))
    const closedConv = { ...conv1, id: 'conv-closed', status: 'CLOSED' }
    mockUseInbox
      .mockReturnValueOnce(baseInboxState({ conversations: [conv1] })) // first render: not found under OPEN
      .mockReturnValue(baseInboxState({ conversations: [conv1, closedConv], statusFilter: 'ALL' }))

    render(<InboxClient />)

    await waitFor(() => expect(mockSetStatusFilter).toHaveBeenCalledWith('ALL'))
  })

  it('resolves contactId to the contact\'s conversation and selects it', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ contactId: 'contact-9' }))
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)

    await waitFor(() => expect(mockSetSelectedId).toHaveBeenCalledWith('conv-1'))
  })

  it('does nothing when there is no deep-link param', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)
    await screen.findByTestId('conversation-list')

    expect(mockSetSelectedId).not.toHaveBeenCalled()
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('shows a toast and clears the URL when the conversation is not found even under ALL', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-missing' }))
    mockUseInbox.mockReturnValue(baseInboxState({ statusFilter: 'ALL' }))

    render(<InboxClient />)

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/inbox'))
    expect(mockSetSelectedId).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/inbox/__tests__/InboxClient.test.tsx`
Expected: FAIL — `InboxClient` doesn't read `useSearchParams` yet, so `setSelectedId`/`setStatusFilter`/`replace` are never called.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `metria-metrics/Frontend/src/app/dashboard/inbox/InboxClient.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useInbox } from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ContactPanel } from './components/ContactPanel'
import { PlatformFilterBar } from './components/PlatformFilterBar'
import { resolveDeepLinkConversation } from './resolveDeepLinkConversation'

const WRAPPER_CLASS = '-mx-6 -my-6 md:-mx-8 md:-my-8 h-[calc(100vh-4rem)] flex flex-col overflow-hidden'

function InboxContent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const router = useRouter()
  const searchParams = useSearchParams()
  const [deepLinkResolved, setDeepLinkResolved] = useState(false)

  const {
    conversations,
    selectedId,
    setSelectedId,
    messages,
    loadingConvs,
    loadingMsgs,
    sendMessage,
    sendTemplate,
    handoverToHuman,
    handbackToBot,
    markAsRead,
    markAsUnread,
    changeStatus,
    assignConversation,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    search,
    setSearch,
    assignedToMe,
    setAssignedToMe,
    users,
  } = useInbox()

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // Select a conversation and immediately mark its inbound messages as read.
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id)
    markAsRead(id)
  }, [setSelectedId, markAsRead])

  // Resolve a CRM "open chat" deep link (?conversationId= or ?contactId=) into a
  // selected conversation. Widens the status filter to ALL once if the target
  // isn't visible under the current filter before giving up.
  useEffect(() => {
    if (deepLinkResolved || loadingConvs) return
    const conversationId = searchParams.get('conversationId')
    const contactId = searchParams.get('contactId')
    if (!conversationId && !contactId) return

    const match = resolveDeepLinkConversation(conversations, { conversationId, contactId })
    if (match) {
      handleSelectConversation(match.id)
      setDeepLinkResolved(true)
      router.replace('/dashboard/inbox')
      return
    }
    if (statusFilter !== 'ALL') {
      setStatusFilter('ALL')
      return
    }
    toast.error('Conversación no encontrada')
    setDeepLinkResolved(true)
    router.replace('/dashboard/inbox')
  }, [searchParams, conversations, loadingConvs, statusFilter, deepLinkResolved, handleSelectConversation, setStatusFilter, router])

  if (!mounted) {
    return (
      <div className={`${WRAPPER_CLASS} animate-pulse`}>
        <div className="h-11 bg-muted/30 border-b shrink-0" />
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[320px] bg-muted/30 border-r" />
          <div className="flex-1 bg-background" />
          <div className="w-[340px] bg-muted/30 border-l" />
        </div>
      </div>
    )
  }

  return (
    <div className={WRAPPER_CLASS}>
      <PlatformFilterBar platformFilter={platformFilter} onPlatformFilterChange={setPlatformFilter} />
      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={loadingConvs}
          onSelect={handleSelectConversation}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
          assignedToMe={assignedToMe}
          onAssignedToMeChange={setAssignedToMe}
          onMarkAsUnread={markAsUnread}
        />
        <ChatWindow
          conversation={selectedConv}
          messages={messages}
          loading={loadingMsgs}
          onSend={sendMessage}
          onSendTemplate={sendTemplate}
          onHandover={handoverToHuman}
          onHandback={handbackToBot}
          onChangeStatus={changeStatus}
          onAssign={assignConversation}
          users={users}
        />
        <ContactPanel conversation={selectedConv} />
      </div>
    </div>
  )
}

export function InboxClient() {
  return (
    <Suspense fallback={<div className={`${WRAPPER_CLASS} animate-pulse`} />}>
      <InboxContent />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/inbox/__tests__/InboxClient.test.tsx`
Expected: PASS — all 5 tests. Then run the full inbox test suite to check for regressions: `npx vitest run src/app/dashboard/inbox`

- [ ] **Step 5: Commit**

```bash
cd metria-metrics/Frontend
git add src/app/dashboard/inbox/InboxClient.tsx src/app/dashboard/inbox/__tests__/InboxClient.test.tsx
git commit -m "feat(inbox): resolve CRM quick-access deep links on load"
```

---

### Task 4: Frontend — clickable chat badge in the CRM contacts list

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/CrmContactsClient.tsx`
- Test: `metria-metrics/Frontend/src/app/dashboard/crm/__tests__/CrmContactsClient.test.tsx`

**Interfaces:**
- Consumes: `Contact.id` and `Contact._count.conversations` (both already on the `Contact` interface, `CrmContactsClient.tsx:34-47`).
- Produces: no new exports — this is a leaf UI change (`router.push('/dashboard/inbox?contactId=' + id)`), consumed by Inbox's Task 3 logic at runtime (not by other code at compile time).

- [ ] **Step 1: Write the failing test**

Create `metria-metrics/Frontend/src/app/dashboard/crm/__tests__/CrmContactsClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CrmContactsClient from '../CrmContactsClient'
import { fetchAPI } from '@/lib/api'

vi.mock('@/lib/api', () => ({ fetchAPI: vi.fn() }))
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const contacts = [
  {
    id: 'ct-1', name: 'Herbert Orrego', email: null, phone: '+56900000001', status: 'LEAD',
    ltv: 0, source: 'SOLAR_DIRECT', avatarUrl: null, leadScore: null, leadTemperature: 'HOT', leadType: null,
    _count: { conversations: 1, deals: 1, tickets: 0 }
  },
  {
    id: 'ct-2', name: 'Sin Chats', email: null, phone: '+56900000002', status: 'LEAD',
    ltv: 0, source: 'SOLAR_DIRECT', avatarUrl: null, leadScore: null, leadTemperature: null, leadType: null,
    _count: { conversations: 0, deals: 0, tickets: 0 }
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url.startsWith('/crm/contacts?')) return Promise.resolve(contacts)
    return Promise.resolve(null)
  })
})

describe('CrmContactsClient — quick access to chat', () => {
  it('opens the inbox for the contact when the conversations badge is clicked', async () => {
    const user = userEvent.setup()
    render(<CrmContactsClient />)

    const badge = await screen.findByRole('button', { name: /abrir chat/i })
    await user.click(badge)

    expect(mockPush).toHaveBeenCalledWith('/dashboard/inbox?contactId=ct-1')
  })

  it('does not also navigate to the contact detail page when the badge is clicked', async () => {
    const user = userEvent.setup()
    render(<CrmContactsClient />)

    const badge = await screen.findByRole('button', { name: /abrir chat/i })
    await user.click(badge)

    expect(mockPush).not.toHaveBeenCalledWith('/dashboard/crm/contacts/ct-1')
  })

  it('renders no chat button for a contact with zero conversations', async () => {
    render(<CrmContactsClient />)

    await screen.findByText('Sin Chats')
    expect(screen.getAllByRole('button', { name: /abrir chat/i })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/crm/__tests__/CrmContactsClient.test.tsx`
Expected: FAIL — no element with accessible name "Abrir chat" exists yet (the badge is a plain, non-interactive `div`).

- [ ] **Step 3: Write the implementation**

In `metria-metrics/Frontend/src/app/dashboard/crm/CrmContactsClient.tsx`:

Add the Tooltip import (after the existing `Skeleton` import, line 20):

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
```

Change the conversations badge usage (line 492) to pass an `onClick`:

```tsx
// Before:
<ActivityBadge icon={MessageSquare} count={contact._count?.conversations ?? 0} tooltip="Conversaciones" />

// After:
<ActivityBadge
  icon={MessageSquare}
  count={contact._count?.conversations ?? 0}
  tooltip="Abrir chat"
  onClick={() => router.push('/dashboard/inbox?contactId=' + contact.id)}
/>
```

Replace the `ActivityBadge` function (lines 607-615) with:

```tsx
function ActivityBadge({ icon: Icon, count, tooltip, onClick }: { icon: any; count: number; tooltip: string; onClick?: () => void }) {
  if (count === 0) return <div className="text-muted-foreground/30 opacity-40"><Icon className="w-4 h-4" /></div>
  if (!onClick) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground group/item" title={tooltip}>
        <Icon className="w-4 h-4 group-hover/item:text-primary transition-colors" />
        <span className="text-xs font-bold">{count}</span>
      </div>
    )
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={tooltip}
            onClick={e => { e.stopPropagation(); onClick() }}
            className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors group/item"
          >
            <Icon className="w-4 h-4" />
            <span className="text-xs font-bold">{count}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/crm/__tests__/CrmContactsClient.test.tsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
cd metria-metrics/Frontend
git add src/app/dashboard/crm/CrmContactsClient.tsx src/app/dashboard/crm/__tests__/CrmContactsClient.test.tsx
git commit -m "feat(crm): open inbox chat directly from the contacts list"
```

---

### Task 5: Frontend — active-channel quick-access icons on the contact detail header

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`
- Test: `metria-metrics/Frontend/src/test/contact-merge.test.tsx` (extend the existing `ContactProfileClient` test file)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `getActiveChannels(conversations: ContactConversationSummary[]): { platform: string; conversationId: string }[]` — named export, used only within this file's JSX but exported so it can be unit tested directly.

- [ ] **Step 1: Write the failing tests**

First, update the shared `mockFetch` helper in `metria-metrics/Frontend/src/test/contact-merge.test.tsx` to accept a `conversations` override (needed by the new tests, defaults preserve all existing test behavior):

```ts
// Before:
function mockFetch(duplicates: unknown[] = [mockDuplicate], customFieldDefs: unknown[] = mockCustomFieldDefs) {
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url === '/crm/contacts/ct-1') return Promise.resolve(mockContact)

// After:
function mockFetch(duplicates: unknown[] = [mockDuplicate], customFieldDefs: unknown[] = mockCustomFieldDefs, conversations: unknown[] = []) {
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url === '/crm/contacts/ct-1') return Promise.resolve({ ...mockContact, conversations })
```

Change the `next/navigation` mock at the top of the file to expose `push` for assertions (needs `vi.hoisted` since it's referenced inside the `vi.mock` factory):

```ts
// Before:
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))

// After:
const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: mockRouterPush }) }))
```

Then add this `describe` block at the end of the file, and change the import line to also pull in `getActiveChannels`:

```ts
// Before:
import ContactProfileClient from '../app/dashboard/crm/contacts/[contactId]/ContactProfileClient'
// After:
import ContactProfileClient, { getActiveChannels } from '../app/dashboard/crm/contacts/[contactId]/ContactProfileClient'
```

```tsx
describe('getActiveChannels', () => {
  it('returns one entry per distinct platform, using the most recent conversation for that platform', () => {
    const conversations = [
      { id: 'conv-wa-old', status: 'CLOSED', messageCount: 1, lastMessageAt: '2026-01-01T00:00:00.000Z', channel: { platform: 'WHATSAPP', name: 'WA' } },
      { id: 'conv-wa-new', status: 'OPEN', messageCount: 0, lastMessageAt: '2026-02-01T00:00:00.000Z', channel: { platform: 'WHATSAPP', name: 'WA' } },
      { id: 'conv-ig', status: 'OPEN', messageCount: 3, lastMessageAt: null, channel: { platform: 'INSTAGRAM', name: 'IG' } },
    ]

    expect(getActiveChannels(conversations)).toEqual([
      { platform: 'WHATSAPP', conversationId: 'conv-wa-new' },
      { platform: 'INSTAGRAM', conversationId: 'conv-ig' },
    ])
  })

  it('returns an empty array for a contact with no conversations', () => {
    expect(getActiveChannels([])).toEqual([])
  })
})

describe('ContactProfileClient — channel quick access', () => {
  it('renders a chat icon for a channel with a conversation, even when it has zero messages', async () => {
    mockFetch([mockDuplicate], mockCustomFieldDefs, [
      { id: 'conv-wa-1', status: 'OPEN', messageCount: 0, lastMessageAt: null, channel: { platform: 'WHATSAPP', name: 'WhatsApp Principal' } }
    ])

    render(<ContactProfileClient contactId="ct-1" />)

    expect(await screen.findByRole('button', { name: /abrir chat de whatsapp/i })).toBeInTheDocument()
  })

  it('navigates to the inbox with that exact conversation id when clicked', async () => {
    mockFetch([mockDuplicate], mockCustomFieldDefs, [
      { id: 'conv-wa-1', status: 'OPEN', messageCount: 0, lastMessageAt: null, channel: { platform: 'WHATSAPP', name: 'WhatsApp Principal' } }
    ])
    const user = userEvent.setup()
    render(<ContactProfileClient contactId="ct-1" />)

    await user.click(await screen.findByRole('button', { name: /abrir chat de whatsapp/i }))

    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/inbox?conversationId=conv-wa-1')
  })

  it('renders no channel icon when the contact has no conversations', async () => {
    mockFetch()
    render(<ContactProfileClient contactId="ct-1" />)

    await screen.findByText('Juan Perez')
    expect(screen.queryByRole('button', { name: /abrir chat de/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/test/contact-merge.test.tsx`
Expected: FAIL — `getActiveChannels` doesn't exist (import error), and no "Abrir chat de..." button is rendered.

- [ ] **Step 3: Write the implementation**

In `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`:

Add the Tooltip import next to the existing `Select` import (line 9):

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
```

Add a `PLATFORM_ICONS` constant next to the existing `PLATFORM_LABEL` (after line 65):

```tsx
const PLATFORM_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', TELEGRAM: 'Telegram'
}
const PLATFORM_ICONS: Record<string, string> = {
  WHATSAPP: 'https://cdn-icons-png.flaticon.com/512/733/733585.png',
  INSTAGRAM: 'https://cdn-icons-png.flaticon.com/512/174/174855.png',
  TELEGRAM: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
}
```

Extract the inline conversations type and add the pure helper — replace line 461 and add code right after the `Contact` interface closes (find the interface's closing `}` — it's a large interface starting at line 453; add the type + function immediately after it):

```tsx
// Change line 461 from:
  conversations: { id: string; status: string; messageCount: number; lastMessageAt: string | null; channel: { platform: string; name: string } }[]
// to:
  conversations: ContactConversationSummary[]
```

```tsx
// Add above the `interface Contact {` declaration (before line 453):
interface ContactConversationSummary {
  id: string
  status: string
  messageCount: number
  lastMessageAt: string | null
  channel: { platform: string; name: string }
}
```

```tsx
// Add immediately after the `Contact` interface's closing brace:
/**
 * One entry per distinct channel platform the contact has ever talked through,
 * pointing at that platform's most recently active conversation. Presence here
 * means "has a conversation record" — independent of messageCount, so a
 * WhatsApp template sent with no reply yet still counts as active.
 */
export function getActiveChannels(conversations: ContactConversationSummary[]): { platform: string; conversationId: string }[] {
  const byPlatform = new Map<string, { conversationId: string; lastMessageAt: string | null }>()
  for (const conv of conversations) {
    const platform = conv.channel.platform
    const existing = byPlatform.get(platform)
    const existingTime = existing?.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : -1
    const convTime = conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : -1
    if (!existing || convTime > existingTime) {
      byPlatform.set(platform, { conversationId: conv.id, lastMessageAt: conv.lastMessageAt })
    }
  }
  return [...byPlatform.entries()].map(([platform, v]) => ({ platform, conversationId: v.conversationId }))
}
```

Compute `activeChannels` right after the `TABS` definition (after line 730, `]` closing the `TABS` array):

```tsx
const activeChannels = getActiveChannels(contact.conversations ?? [])
```

Insert the channel icon row in the header, right after the name/phone block's closing `</div>` (line 767) and before the `<Select value={contact.status} ...>` (line 768):

```tsx
        {activeChannels.length > 0 && (
          <div className="flex items-center gap-1.5">
            {activeChannels.map(({ platform, conversationId }) => (
              <TooltipProvider key={platform}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/inbox?conversationId=${conversationId}`)}
                      aria-label={`Abrir chat de ${PLATFORM_LABEL[platform] ?? platform}`}
                      className="w-7 h-7 rounded-full border border-border/60 bg-muted/40 hover:bg-primary/10 hover:border-primary/40 flex items-center justify-center transition-colors"
                    >
                      {PLATFORM_ICONS[platform]
                        ? <img src={PLATFORM_ICONS[platform]} alt="" className="w-4 h-4" />
                        : <span className="text-[10px] font-bold">{platform.charAt(0)}</span>}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{PLATFORM_LABEL[platform] ?? platform}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/test/contact-merge.test.tsx`
Expected: PASS — all tests in the file (existing duplicate-detection/custom-fields tests plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
cd metria-metrics/Frontend
git add src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx src/test/contact-merge.test.tsx
git commit -m "feat(crm): show active-channel quick-access icons on contact detail header"
```

---

### Task 6: Manual verification

**Files:** none (manual QA pass — no code changes)

- [ ] **Step 1: Run both dev servers**

```bash
cd Backend && npm run dev
```
```bash
cd metria-metrics/Frontend && pnpm dev
```

- [ ] **Step 2: Verify the contacts list badge**

Open `http://localhost:3000/dashboard/crm/contacts`. For a contact with ≥1 conversation, hover the message icon in the Actividad column — confirm the "Abrir chat" tooltip appears and the cursor is a pointer. Click it — confirm it navigates to `/dashboard/inbox?contactId=<id>` and then to `/dashboard/inbox` with that contact's conversation selected and marked read. Confirm clicking it does **not** also navigate to the contact detail page.

- [ ] **Step 3: Verify the contact detail header**

Open a contact detail page for a contact with a WhatsApp conversation. Confirm a WhatsApp icon renders in the header. Click it — confirm it opens the Inbox with that exact conversation selected.

- [ ] **Step 4: Verify the messageCount fix end-to-end**

From a contact detail page, use "Enviar plantilla" (or the equivalent WhatsApp template send action) to send an approved template to a contact with no prior messages. Reload the contact detail page — confirm the Conversaciones tab now shows `1 mensaje` (not `0 mensajes`), and confirm the channel icon still appeared even before this reload (proving the icon doesn't depend on messageCount).

- [ ] **Step 5: Verify the not-found fallback**

Manually navigate to `http://localhost:3000/dashboard/inbox?conversationId=does-not-exist`. Confirm a "Conversación no encontrada" toast appears and the Inbox renders its normal default view (no blank screen, no crash).
