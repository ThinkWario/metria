# Channel Config & Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect/disconnect WhatsApp, Instagram, Telegram, and Messenger via a dedicated settings page.

**Architecture:** 
- **Backend:** New `channel.service.ts` for managing `Channel` model config. Integration of `messenger.service.ts` for Meta Messenger. Centralized webhook handler.
- **Frontend:** New `/dashboard/settings/channels` page with connection cards and config forms.

**Tech Stack:** Next.js 16, Express, Prisma, Meta Graph API.

---

### Task 1: Backend Foundation & Messenger Integration

**Files:**
- Modify: `Backend/src/modules/messaging/types.ts` (add MESSENGER to Platform enum)
- Create: `Backend/src/modules/messaging/channel.service.ts` (CRUD for Channel config)
- Create: `Backend/src/modules/messaging/channels/messenger.service.ts` (Meta Messenger API logic)
- Modify: `Backend/src/modules/messaging/messaging.routes.ts` (add `/channels` endpoints)
- Modify: `Backend/src/modules/messaging/messaging.controller.ts` (add handlers for channel config)

- [ ] **Step 1: Define MESSENGER platform in types.**
- [ ] **Step 2: Implement `upsertChannelConfig` and `getChannels` in `channel.service.ts`.**
- [ ] **Step 3: Implement `messenger.service.ts` (send message, verify webhook).**
- [ ] **Step 4: Wire up routes: `GET /channels`, `POST /channels/:platform/config`.**
- [ ] **Step 5: Implement controllers to call `channel.service.ts`.**

### Task 2: Webhook Handling for Messenger

**Files:**
- Modify: `Backend/src/modules/messaging/messaging.controller.ts` (add `/webhooks/messenger` handler)
- Modify: `Backend/src/modules/messaging/message.service.ts` (route messenger events to `tryRunBotFlows`)

- [ ] **Step 1: Implement Messenger webhook verification (hub.mode, hub.verify_token).**
- [ ] **Step 2: Implement event processing (message, postback).**
- [ ] **Step 3: Ensure Messenger messages trigger Bot Engine.**

### Task 3: Frontend Channel Settings UI

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelsClient.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelCard.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelConfigForm.tsx`

- [ ] **Step 1: Build `ChannelsClient` to fetch current channel statuses.**
- [ ] **Step 2: Build `ChannelCard` for each platform (WhatsApp, IG, Telegram, Messenger).**
- [ ] **Step 3: Build `ChannelConfigForm` to collect tokens/IDs per platform.**
- [ ] **Step 4: Implement `saveConfig` action calling Backend API.**

### Task 4: Validation & Integration Test

**Files:**
- Create: `Backend/src/modules/messaging/__tests__/channel.service.test.ts`
- Create: `Backend/src/modules/messaging/__tests__/messenger.service.test.ts`

- [ ] **Step 1: Test channel config persistence.**
- [ ] **Step 2: Mock Meta API calls for Messenger service.**
- [ ] **Step 3: Verify end-to-end flow: Config -> Webhook -> Bot Engine -> Reply.**
