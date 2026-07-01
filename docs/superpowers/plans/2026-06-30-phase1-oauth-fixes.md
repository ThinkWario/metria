# Phase 1 — Google OAuth Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Google Calendar connect failure and the "Sign in with Google" login failure reported in the 2026-06-29 feedback session, and add the missing welcome email on account registration.

**Architecture:** Task 1 reverts a redirect_uri regression in the Calendar OAuth provider. Task 2 adds a reusable transactional-email helper on top of the existing Resend campaign driver (`Backend/src/modules/campaigns/drivers/resend.driver.ts`). Task 3 wires that helper into both registration paths (`POST /api/auth/register` and the new-user branch of `POST /api/auth/google`). Task 4 makes the Google login audience-mismatch failure mode (frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` vs backend `GOOGLE_ADS_CLIENT_ID`) loud and diagnosable instead of a generic 500, since the actual prod env values can't be verified from this repo.

**Tech Stack:** Express 4, Prisma 5, Vitest 4 (`vi.mock`, `globals: true`), Resend REST API, google-auth-library.

## Global Constraints

- New/changed backend code lives under `Backend/src/`; tests under matching `__tests__/` dirs per existing convention (see `Backend/src/modules/crm/__tests__/contact.service.test.ts`).
- Run tests with `npm run test` from `Backend/` (vitest, configured `include: ['src/**/__tests__/**/*.test.ts']`).
- Never hardcode secrets; reuse `process.env.RESEND_API_KEY` / `RESEND_FROM_EMAIL` already used by the campaigns module.
- Multi-tenancy and existing route registration patterns in `Backend/src/app.ts` are not touched by this plan — no new routes are added.
- Mock drivers must never throw (matches `MessageDriver` contract in `Backend/src/modules/campaigns/drivers/types.ts:19`) — always resolve a `SendResult`.

---

### Task 1: Fix Google Calendar redirect_uri regression

**Files:**
- Modify: `Backend/src/lib/oauth/providers/google-calendar.ts:19-21`
- Test: `Backend/src/lib/oauth/providers/__tests__/google-calendar.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GoogleCalendarProvider.getAuthUrl(state: string): string` — unchanged signature, fixed `redirect_uri` query param value. No other task depends on this.

**Context:** `Backend/src/routes/integrations/google-calendar.routes.ts:9-10` defines `REDIRECT_URI = () => \`${BACKEND_URL}/api/integrations/google-calendar/callback\`` and registers the callback route at that exact path (`Backend/src/app.ts:149`: `app.use('/api/integrations/google-calendar', googleCalendarRoutes)`). But `GoogleCalendarProvider.redirectUri` (the getter used inside `getAuthUrl`) currently returns `\`${BACKEND_URL}/api/oauth/google_calendar/callback\`` — a path that is never registered anywhere in `app.ts`. Commit `4812ccee` introduced this mismatch on 2026-06-27. Google sends the user back to a 404 after consent, so the calendar connection never completes. The fix is reverting that getter back to match the registered route.

- [ ] **Step 1: Write the failing test**

```typescript
// Backend/src/lib/oauth/providers/__tests__/google-calendar.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GoogleCalendarProvider } from '../google-calendar'

describe('GoogleCalendarProvider.getAuthUrl', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, BACKEND_URL: 'https://api.metria.test' }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('uses the redirect_uri that matches the registered callback route', () => {
    const provider = new GoogleCalendarProvider()
    const url = new URL(provider.getAuthUrl('workspace-123'))

    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.metria.test/api/integrations/google-calendar/callback'
    )
  })

  it('passes the workspaceId through as the OAuth state param', () => {
    const provider = new GoogleCalendarProvider()
    const url = new URL(provider.getAuthUrl('workspace-123'))

    expect(url.searchParams.get('state')).toBe('workspace-123')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npm run test -- google-calendar.test.ts`
Expected: FAIL — `redirect_uri` is `https://api.metria.test/api/oauth/google_calendar/callback`, not `.../api/integrations/google-calendar/callback`.

- [ ] **Step 3: Fix the redirect_uri getter**

```typescript
// Backend/src/lib/oauth/providers/google-calendar.ts:19-21
  private get redirectUri() {
    return `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/integrations/google-calendar/callback`
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npm run test -- google-calendar.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/lib/oauth/providers/google-calendar.ts Backend/src/lib/oauth/providers/__tests__/google-calendar.test.ts
git commit -m "fix(google-calendar): revert redirect_uri regression from 4812ccee"
```

---

### Task 2: Add a transactional mailer helper

**Files:**
- Create: `Backend/src/lib/mailer.ts`
- Test: `Backend/src/lib/__tests__/mailer.test.ts`

**Interfaces:**
- Consumes: `createResendDriver` from `Backend/src/modules/campaigns/drivers/resend.driver.ts` (signature: `(): MessageDriver`, `MessageDriver.sendEmail(to: string, subject: string, body: string): Promise<SendResult>`), `logDriver` from `Backend/src/modules/campaigns/drivers/log.driver.ts`.
- Produces: `sendWelcomeEmail(to: string, name: string): Promise<void>` — used by Task 3. Never throws (logs and swallows failures, matching the existing driver contract of "one bad send never aborts the caller").

**Context:** The campaigns module already has a working Resend integration (`Backend/src/modules/campaigns/drivers/resend.driver.ts`), gated on `RESEND_API_KEY` being set, falling back to `logDriver` (console-only) otherwise — exactly the same fallback behavior we want for transactional email so the registration flow never breaks in dev/test environments without Resend configured. Reuse it instead of writing a second email client.

- [ ] **Step 1: Write the failing test**

```typescript
// Backend/src/lib/__tests__/mailer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendEmail = vi.fn()

vi.mock('../../modules/campaigns/drivers', () => ({
  getDriver: vi.fn(() => ({ name: 'mock', sendEmail: mockSendEmail, sendSms: vi.fn(), sendWhatsapp: vi.fn() }))
}))

import { sendWelcomeEmail } from '../mailer'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendWelcomeEmail', () => {
  it('sends a welcome email with the recipient name in the body', async () => {
    mockSendEmail.mockResolvedValue({ ok: true, provider: 'resend' })

    await sendWelcomeEmail('ana@example.com', 'Ana')

    expect(mockSendEmail).toHaveBeenCalledWith(
      'ana@example.com',
      expect.stringContaining('Metria'),
      expect.stringContaining('Ana')
    )
  })

  it('does not throw when the driver reports a failed send', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, provider: 'resend', error: 'bad recipient' })

    await expect(sendWelcomeEmail('ana@example.com', 'Ana')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npm run test -- mailer.test.ts`
Expected: FAIL with "Cannot find module '../mailer'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// Backend/src/lib/mailer.ts
import { getDriver } from '../modules/campaigns/drivers'

/**
 * Transactional email helper. Reuses the campaigns module's EMAIL driver
 * (Resend if RESEND_API_KEY is set, otherwise a log-only fallback) so
 * registration never breaks in environments without email configured.
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const driver = getDriver('EMAIL')
  const subject = 'Bienvenido a Metria Metrics'
  const body = `Hola ${name},\n\nTu cuenta en Metria Metrics fue creada correctamente. Ya puedes iniciar sesión y comenzar a configurar tu workspace.\n\n— El equipo de Metria`

  const result = await driver.sendEmail(to, subject, body)
  if (!result.ok) {
    console.error(`[mailer] welcome email to ${to} failed: ${result.error}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npm run test -- mailer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/lib/mailer.ts Backend/src/lib/__tests__/mailer.test.ts
git commit -m "feat(mailer): add transactional welcome-email helper"
```

---

### Task 3: Send welcome email on registration (both signup paths)

**Files:**
- Modify: `Backend/src/routes/auth.ts:267-300` (`POST /register`)
- Modify: `Backend/src/routes/auth.ts:118-141` (new-user branch of `POST /google`)
- Test: `Backend/src/routes/__tests__/auth.test.ts` (new)

**Interfaces:**
- Consumes: `sendWelcomeEmail(to: string, name: string): Promise<void>` from Task 2 (`Backend/src/lib/mailer.ts`).
- Produces: nothing new consumed by later tasks.

**Context:** Insert the welcome-email call right after the user record is created in each path and before the success response is sent. Do not change existing response shapes or status codes.

- [ ] **Step 1: Write the failing test**

```typescript
// Backend/src/routes/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockSendWelcomeEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/mailer', () => ({ sendWelcomeEmail: mockSendWelcomeEmail }))

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'u1', email: 'new@example.com', name: 'New User', role: 'ADMIN',
        workspaceId: 'ws1', workspace: { id: 'ws1', status: 'ACTIVE' }
      })
    },
    workspace: { create: vi.fn().mockResolvedValue({ id: 'ws1' }) }
  }
}))

import authRouter from '../auth'
import { prisma } from '../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

describe('POST /api/auth/register', () => {
  it('sends a welcome email after creating the user', async () => {
    const app = buildApp()

    await request(app)
      .post('/api/auth/register')
      .send({ workspaceName: 'Acme', name: 'New User', email: 'new@example.com', password: 'longenough1' })
      .expect(201)

    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('new@example.com', 'New User')
  })
})
```

(`supertest` and `@types/supertest` are already in `Backend/package.json` devDependencies — no install needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npm run test -- auth.test.ts`
Expected: FAIL — `mockSendWelcomeEmail` was not called (welcome email not wired up yet).

- [ ] **Step 3: Wire the welcome email into both signup paths**

In `Backend/src/routes/auth.ts`, add the import after the existing imports (after line 7, `import { OAuth2Client } from 'google-auth-library'`):

```typescript
import { sendWelcomeEmail } from '../lib/mailer'
```

In the `POST /register` handler (`Backend/src/routes/auth.ts:285-287`), the user-creation line currently reads:

```typescript
        const user = await prisma.user.create({
            data: { email, name, passwordHash, role: 'ADMIN', workspaceId: workspace.id }
        })
```

Add the welcome-email call directly after it, still before the `const token = jwt.sign(...)` block:

```typescript
        const user = await prisma.user.create({
            data: { email, name, passwordHash, role: 'ADMIN', workspaceId: workspace.id }
        })

        sendWelcomeEmail(email, name).catch(() => {})
```

In the `POST /google` handler (`Backend/src/routes/auth.ts:118-141`), inside the `if (!user) { ... }` new-user branch, the user-creation line currently reads:

```typescript
            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    googleId,
                    avatarUrl: picture,
                    role: 'ADMIN',
                    workspaceId: workspace.id,
                },
                include: { workspace: true }
            })
            onboardingRequired = true
```

Add the welcome-email call directly after `onboardingRequired = true`:

```typescript
            onboardingRequired = true
            sendWelcomeEmail(email, name ?? email).catch(() => {})
```

Use `.catch(() => {})` (fire-and-forget) in both spots — `sendWelcomeEmail` already never throws per Task 2, but this keeps the registration response from ever waiting on email delivery.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npm run test -- auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Backend/src/routes/auth.ts Backend/src/routes/__tests__/auth.test.ts Backend/package.json Backend/package-lock.json
git commit -m "feat(auth): send welcome email on registration and first Google sign-in"
```

---

### Task 4: Surface a diagnosable error for Google login audience mismatch

**Files:**
- Modify: `Backend/src/routes/auth.ts:84-207` (`POST /google` catch block)
- Test: `Backend/src/routes/__tests__/auth.test.ts` (extend file from Task 3)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks. This is the last task in this plan.

**Context:** `google-auth-library`'s `OAuth2Client.verifyIdToken` throws an `Error` whose `.message` contains the literal substring `"Wrong recipient"` when the ID token's audience doesn't match the `audience` option passed in (`Backend/src/routes/auth.ts:11,94`: `audience: process.env.GOOGLE_ADS_CLIENT_ID`). This is the most likely cause of the reported "Google login fails, email/password works" bug — the frontend's `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (`Frontend/src/components/providers.tsx:19`) and the backend's `GOOGLE_ADS_CLIENT_ID` must be the *same* OAuth client ID in Google Cloud Console, and that can't be verified from this repo (local `Backend/.env` has a placeholder value). Today the catch block returns a generic `{ error: 'Failed to authenticate with Google', details: error.message }` with no log signal that distinguishes "wrong client ID configured" from any other failure. Make that specific failure mode loud in the server logs so it's a 30-second diagnosis next time instead of a repeat investigation.

- [ ] **Step 1: Write the failing test**

Append to `Backend/src/routes/__tests__/auth.test.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library'

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockRejectedValue(
      new Error('Wrong recipient, payload audience != requiredAudience')
    )
  }))
}))

describe('POST /api/auth/google — audience mismatch', () => {
  it('logs a clear client-id-mismatch diagnostic and returns a distinct error code', async () => {
    const app = buildApp()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-token' })
      .expect(401)

    expect(res.body.error).toBe('google_client_id_mismatch')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_GOOGLE_CLIENT_ID')
    )
  })
})
```

Vitest hoists every `vi.mock(...)` call to the top of the file regardless of where it's written, so this new `vi.mock('google-auth-library', ...)` applies to the whole test file alongside the `vi.mock('../../lib/mailer', ...)` and `vi.mock('../../lib/prisma', ...)` calls from Task 3 — no conflict, since Task 3's tests never touch `OAuth2Client`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npm run test -- auth.test.ts`
Expected: FAIL — current handler returns `500` with `error: 'Failed to authenticate with Google'`, not `401` with `error: 'google_client_id_mismatch'`.

- [ ] **Step 3: Update the catch block**

```typescript
// Backend/src/routes/auth.ts — inside POST /google, replace the existing catch block
    } catch (error: any) {
        const message: string = error?.message || String(error)

        if (message.includes('Wrong recipient') || message.includes('audience')) {
            console.error(
                `[GoogleAuth] Client ID mismatch — frontend NEXT_PUBLIC_GOOGLE_CLIENT_ID and backend GOOGLE_ADS_CLIENT_ID must be the same Google Cloud OAuth client. Verify both env values. Detail: ${message}`
            )
            return res.status(401).json({ error: 'google_client_id_mismatch' })
        }

        console.error('Google login error detail:', message)
        res.status(500).json({ error: 'Failed to authenticate with Google', details: message })
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npm run test -- auth.test.ts`
Expected: PASS (all tests in the file, including Task 3's)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/routes/auth.ts Backend/src/routes/__tests__/auth.test.ts
git commit -m "fix(auth): surface diagnosable error for Google client-id mismatch"
```

---

## Manual verification (not automatable from this repo)

After all 4 tasks ship:

- [ ] Deploy and click "Conectar Google Calendar" end-to-end in a real workspace; confirm it lands back on `/dashboard/settings?cal_connected=1`, not `?cal_error=1`.
- [ ] In Easypanel (backend) and Vercel (frontend) env dashboards, confirm `GOOGLE_ADS_CLIENT_ID` (backend) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend) are the exact same Google Cloud OAuth client ID. If they differ, that alone was the login bug — fix the env value (no further code change needed) and redeploy.
- [ ] Register a new test account with email/password; confirm a welcome email arrives (or check Resend dashboard / server logs if `RESEND_API_KEY` isn't set in that environment).
