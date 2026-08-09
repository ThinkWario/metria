# CRM → Inbox Quick Access — Design Spec

**Date:** 2026-08-09
**Status:** Approved, pending implementation plan

## Problem

Finding a contact's chat inside the Inbox chatbox is slow — the agent has to search by name/phone manually. Two CRM screens already show that a contact has active communication (message-count badge in the contacts list, "Conversaciones" tab in the contact detail page), but neither links directly to the Inbox conversation. This adds friction every time an agent wants to jump from CRM context into the chat.

## Goals

- One click from the CRM contacts list → the right conversation open in Inbox.
- One click from the contact detail page → the right conversation open in Inbox, with visibility into which channels (WhatsApp/Instagram/Telegram) have ever been used with this contact — not just which channels have replies.
- Fix a related data bug: the WhatsApp template send path doesn't increment `conversation.messageCount`, undercounting activity for template-only contacts.

## Non-goals

- No new "merged multi-channel view" inside a single chat window — Inbox continues to show one conversation (one channel) at a time.
- No change to Inbox's existing filter/search UX beyond accepting the two new query params below.

## Design

### 1. Contacts list (`CrmContactsClient.tsx`)

The existing `ActivityBadge` (MessageSquare icon + count, `CrmContactsClient.tsx:607`) in the **ACTIVIDAD** column already reflects `_count.conversations` — a relation count, not a message count, so it's accurate even for template-only contacts (confirmed: Herbert Orrego shows `1` in the list despite `0 mensajes` in his conversation detail).

- When `count > 0`, wrap the badge in a `<button>` (keep existing visual) wrapped with the project's `Tooltip` (`@/components/ui/tooltip`), text "Abrir chat".
- `onClick` → `router.push('/dashboard/inbox?contactId=' + contact.id)`.
- When `count === 0`, keep current non-interactive rendering (dimmed icon, no link) — unchanged.

### 2. Contact detail header (`ContactProfileClient.tsx`)

Insert a row of channel icons in the header (`ContactProfileClient.tsx:753-767`), between the name block and the status `Select` dropdowns — there's visibly more room here per the screenshots.

- Derive the distinct set of channels from `contact.conversations` (already fetched: `{ id, status, messageCount, lastMessageAt, channel: { platform, name } }`).
- One icon per distinct `channel.platform` that has ≥1 conversation for this contact (WhatsApp/Instagram/Telegram — reuse `PLATFORM_LABEL` map at line 63 for tooltip text/icon choice).
- No "inactive" placeholder icons — a channel with zero conversations for this contact simply doesn't render an icon (avoids clutter, matches "active channels" framing from the brainstorm).
- Each icon `onClick` → `router.push('/dashboard/inbox?conversationId=' + conv.id)` where `conv` is the conversation with the latest `lastMessageAt` for that platform (handles the edge case of two conversations on the same channel, e.g. re-opened after being closed).
- Tooltip per icon: platform label, e.g. "WhatsApp".

### 3. Inbox routing (`InboxClient.tsx`, `useInbox.ts`)

`InboxClient` currently has no query-param awareness — `selectedId` is local state only.

- Add `useSearchParams()` (next/navigation) in `InboxClient`.
- On mount, once `conversations` has loaded (`loadingConvs === false`):
  - If `conversationId` param present:
    - If found in `conversations` → `setSelectedId` + `markAsRead`, as `handleSelectConversation` already does.
    - If not found under the current `statusFilter` → set `setStatusFilter('ALL')` once and retry on the next load; if still not found after that → `toast.error('Conversación no encontrada')` and fall back to normal inbox view (no selection).
  - Else if `contactId` param present:
    - Filter loaded conversations by `conversation.contact.id === contactId`, pick the one with the latest `lastMessageAt`.
    - Same "not found under current filter → widen to ALL → still not found → toast + fallback" behavior.
  - After a successful selection (or a confirmed not-found), strip the query param via `router.replace('/dashboard/inbox')` so filter changes/re-renders don't re-trigger the lookup.
- This logic lives in `InboxClient` (a `useEffect` keyed on the search params + `loadingConvs`), not inside `useInbox` — `useInbox` stays a plain conversations/messages data hook, unaware of routing.

### 4. Bug fix: `messageCount` not incremented on template send

`Backend/src/modules/messaging/message.service.ts:120-123` — `sendOutboundWhatsAppTemplate` creates the `Message` row but its `conversation.update` only sets `lastMessageAt`, unlike the two other outbound paths (lines ~198-203, ~373-408) which also do `messageCount: { increment: 1 }`. Add the same increment here. One-line fix, same file, included in this work since it's what surfaced the "0 mensajes" confusion during design.

## Data flow summary

```
Contacts list row  → /dashboard/inbox?contactId=<id>        → InboxClient resolves latest conversation
Contact detail icon → /dashboard/inbox?conversationId=<id>   → InboxClient selects exact conversation
```

## Error handling

- Conversation/contact not found in loaded set (even after widening filter to ALL) → toast error, Inbox renders its normal empty/default state. No hard crash, no blank screen.
- No conversations at all for a contact → list badge and detail channel-icon row simply don't render an interactive element (existing dimmed-icon behavior for the list; no icons for the detail header).

## Testing

- Unit: `InboxClient` query-param resolution (found under current filter, found only after widening to ALL, not found → toast), covering both `conversationId` and `contactId` paths.
- Unit: `message.service.test.ts` — `sendOutboundWhatsAppTemplate` increments `messageCount`.
- Manual: click from list badge and from detail channel icon, verify correct conversation opens in Inbox for single- and multi-channel contacts.
