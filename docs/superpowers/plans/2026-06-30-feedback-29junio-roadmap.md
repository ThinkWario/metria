# Feedback 29 Junio — Roadmap

> **For agentic workers:** This is an INDEX/ROADMAP, not a bite-sized execution plan. It covers 13 independent subsystems. Before executing any phase, generate a dedicated bite-sized TDD plan for that phase using superpowers:writing-plans, grounded in fresh investigation of the relevant files. Do not improvise code from this doc's notes alone.

**Goal:** Track and sequence the 13 feedback items from the user's 2026-06-29 Metria feedback session plus 3 clarifications added 2026-06-30 about DrillChile (first paying client) and WhatsApp connect behavior.

**Source:** User message "Resumen Feedback Metria 29 Junio" + follow-up clarification on item 9.

## Global Constraints

- DrillChile (drillchilecl@gmail.com) is the **first paying client** — do not delete their TikTok/Shopify config, hide it instead (superadmin-controlled visibility).
- Multi-tenancy: every new model/query must scope by `workspaceId` (see CLAUDE.md).
- New routes registered in `Backend/src/app.ts`; test with `curl` before wiring frontend.
- Each phase below = one independent subsystem = one separate bite-sized plan when executed.

---

## Phase 0 — Quick wins (no plan needed, just do it) — ✅ DONE 2026-06-30 (uncommitted — sidebar changes sit in the working tree, not yet committed/pushed)

- [x] **Item 1:** Renamed sidebar label "Configuración IA" → "Agente IA".
  File: `metria-metrics/Frontend/src/components/layout/app-sidebar.tsx:91`
- [x] **Item 8:** Restructured "Marketing & Ads" into a "Marketing" collapsible parent with Meta Ads / Google Ads / TikTok Ads as sub-items, mirroring the CRM submenu pattern.
  File: `app-sidebar.tsx` — new `MARKETING_SUB_ITEMS`, `marketingOpen` collapsible state, render block mirrors CRM's.

## Phase 1 — Auth/OAuth bugs (debug-first, not pure greenfield) — ✅ SHIPPED 2026-06-30

Full plan + TDD execution: `docs/superpowers/plans/2026-06-30-phase1-oauth-fixes.md`. 4 commits, pushed to origin/main (`289fbba8`..`7e989912`). Whole-branch review: ready to merge, 0 Critical/Important.

- [x] **Item 3 (Calendar connect):** Root cause found — commit `4812ccee` had broken the redirect_uri to point at an unregistered route. Reverted + regression test.
- [x] **Item 4 (Google login + welcome email):** Login fix could only go partway from this repo — added a `401 google_client_id_mismatch` diagnostic (was a silent generic 500) so the real fix (verifying `NEXT_PUBLIC_GOOGLE_CLIENT_ID` == `GOOGLE_ADS_CLIENT_ID` in Easypanel/Vercel) is a 30-second check next time instead of a re-investigation. **Still needs manual verification in prod env dashboards** — see plan's "Manual verification" section.
- [x] Welcome email added on both signup paths (register + first Google sign-in), reusing the existing Resend campaigns driver.

## Phase 2 — Email verification (net-new security flow)

- [ ] **Item 5:** Require email verification (code or link) before a freshly-registered email/password account can reach the dashboard.
  No `emailVerified` field exists anywhere in the schema today — fully new: Prisma field, token model, send-verification endpoint, verify endpoint, registration flow gate in `auth.ts:267` (`POST /register`), frontend gate after signup.
  Depends on Item 4's welcome-email infra (share the email-sending utility).

## Phase 3 — CRM Deal/Trato UX

- [ ] **Item 2:** "Falta Deal/Trato en el CRM."
  Note: `Deal` model already exists (`schema.prisma:486`, has `title` + `value` + `currency`) and `pipelines/PipelinesClient.tsx` already renders deals. This is likely a **discoverability/UX gap**, not a missing feature — confirm with user/screenshot what's actually missing (e.g. no "+ Nuevo trato" button visible, or it's buried) before planning code changes.

## Phase 4 — DrillChile operational setup (no plan needed — config, not code)

- [ ] **Item 6:** Configure drillchilecl@gmail.com: run onboarding, connect the Google Sheets integration (shipped in commit `b445ec30`). Meta ad account already connected.

## Phase 5 — Pixel & Conversions API settings

- [ ] **Item 7:** Add a Meta Pixel + Conversions API connection section to Configuración Técnica (`/dashboard/settings`), so the platform owns pixel install + server-side event forwarding (CAPI) end to end.
  New subsystem: needs a settings UI section + backend pixel-id storage + CAPI event-forwarding service. Check `Backend/src/controllers/settingsController.ts` and `meta.ts` oauth provider for the existing Meta token to reuse for CAPI auth.

## Phase 6 — Superadmin per-workspace menu/feature visibility (NEW, replaces destructive delete)

- [ ] **Item 9a (clarification):** From superadmin, allow hiding specific sidebar menu items per workspace (e.g. hide TikTok Ads + Shopify for DrillChile) instead of deleting the integration.
  `Workspace` model (`schema.prisma:10`) has no feature-visibility field today — needs one (e.g. `hiddenMenuItems String[]` or a JSON column), a superadmin UI control (`Backend/src/routes/admin.ts`, `Frontend/src/app/admin/workspaces/page.tsx`), and `app-sidebar.tsx` filtering logic reading it from workspace config.
  Also covers former item 9's "remove Logística & Operaciones if Dropi isn't connected" — make that conditional on Dropi connection status instead of a hard per-tenant delete, OR also hideable via this same toggle.

## Phase 7 — WhatsApp connect: only respond to new messages (NEW, clarification)

- [ ] **Item 9b (clarification):** When a WhatsApp account is connected, the agent should not auto-respond to the entire existing lead backlog — only messages received after connection time.
  Investigate channel-connect flow in `Backend/src/modules/messaging/` (no backfill/sync-history logic was found in this dir on a first grep — confirm the actual backlog-processing path before planning, it may live in the WhatsApp provider client wrapper, not this module).

## Phase 8 — IG/FB comments → leads

- [ ] **Item 9c:** Agent should respond to Instagram/Facebook comments and convert them into messages/leads/customers (comment-to-DM-to-CRM pipeline).
  `Backend/src/modules/messaging/channels/instagram.service.ts` handles inbound *messaging* webhooks today; comment-field webhooks (`feed`/`comments` change field) are a separate Meta webhook subscription and were not found in this file — net-new ingestion path feeding into the same `message.service.ts` / `inbox.service.ts` pipeline.

## Phase 9 — Cross-channel lead dedup

- [ ] **Item 10:** Same lead messaging via different channels (WhatsApp, IG, FB) should resolve to one Contact, not duplicate.
  Investigate `Contact` model uniqueness constraints (`schema.prisma:350`) and how `inbox.service.ts` currently resolves/creates a Contact per inbound conversation — likely needs a cross-channel identity match (phone/email/name heuristic or manual merge UI) since channels don't share a common external ID today.

---

## Suggested execution order

1. Phase 0 (today, trivial)
2. Phase 1 (blocks real users signing in — highest user-pain)
3. Phase 6 (DrillChile needs this now, they're live)
4. Phase 4 (DrillChile operational, can run in parallel with anything)
5. Phase 3 (clarify scope first, may already be ~done)
6. Phase 2, 5, 7, 8, 9 (genuinely new subsystems, sequence per priority once Phase 1/6 ship)
