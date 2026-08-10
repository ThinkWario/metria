# Visit-Scheduled Email Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an email as `drillchilecl@gmail.com` (via Gmail API, reusing the existing Google Calendar OAuth connection) whenever a SITE_VISIT appointment is created or rescheduled, to a configurable internal recipient list, with a properly structured corporate-style HTML body.

**Architecture:** Extends the existing non-blocking `notifyAppointmentEvent()` in `appointment-notifications.service.ts` with a third, independent branch (alongside the existing WhatsApp technician alert and lead confirmation) that never depends on a WhatsApp channel being connected. New `gmail.service.ts` (generic Gmail-send helper) and `visitEmailNotification.service.ts` (SITE_VISIT-specific content + orchestration) keep the concerns separated, following the module's existing one-file-per-concern pattern (`booking.service.ts`, `scheduling.service.ts`, `appointment-notifications.service.ts`, `google-calendar.service.ts`).

**Tech Stack:** Express + Prisma (Backend), Next.js/React (Frontend), Vitest, existing Google OAuth provider pattern (`src/lib/oauth/providers/google-calendar.ts`).

## Global Constraints

- Full spec at `docs/superpowers/specs/2026-08-10-visit-email-notification-design.md` — read it before implementing.
- Non-blocking: an email failure must never fail the booking/reschedule, never block the WhatsApp branches, and vice versa.
- SITE_VISIT appointments only — CALL type is out of scope.
- Fires for both `kind: 'created'` and `kind: 'rescheduled'`.
- Recipients: `Workspace.visitNotifyEmails`, comma-separated, empty/unset = feature off.
- Email content order: Visita (fecha/hora, + anterior si es reagendamiento) → Cliente (nombre, teléfono) → Ubicación (dirección + Maps links) → Cotización (link) — see spec for the full approved layout.
- Backend working directory for all commands below: `C:\Proyectos\Metria\Backend`. Frontend: `C:\Proyectos\Metria\metria-metrics\Frontend`.

---

### Task 1: Add `Workspace.visitNotifyEmails` to the schema

**Files:**
- Modify: `Backend/prisma/schema.prisma:32` (Workspace model, right after `notifyPhone`)

**Interfaces:**
- Produces: `Workspace.visitNotifyEmails: String | null` — comma-separated email list, consumed by Task 4 (route) and Task 5 (email service).

- [ ] **Step 1: Add the field**

In `Backend/prisma/schema.prisma`, change:

```prisma
  notifyPhone              String?                   @map("notify_phone")
```

to:

```prisma
  notifyPhone              String?                   @map("notify_phone")
  visitNotifyEmails        String?                   @map("visit_notify_emails")
```

- [ ] **Step 2: Push the schema change to the dev database**

Run: `npx prisma generate && npm run db:push`
Expected: completes without errors; Prisma Client types now include `visitNotifyEmails` on `Workspace`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(scheduling): add Workspace.visitNotifyEmails field"
```

---

### Task 2: Add `gmail.send` OAuth scope and export the access-token helper

**Files:**
- Modify: `Backend/src/lib/oauth/providers/google-calendar.ts:23-40` (`getAuthUrl`)
- Modify: `Backend/src/modules/scheduling/google-calendar.service.ts:12` (export `getAccessToken`)
- Test: `Backend/src/lib/oauth/providers/__tests__/google-calendar.test.ts` (existing file — extend)

**Interfaces:**
- Produces: `getAccessToken(workspaceId: string): Promise<string>` exported from `google-calendar.service.ts`, consumed by Task 3's `gmail.service.ts`.

- [ ] **Step 1: Write the failing test for the scope list**

Open `Backend/src/lib/oauth/providers/__tests__/google-calendar.test.ts`, find the test that asserts on `getAuthUrl()`'s scope list (search for `'calendar'` in that file), and add a new assertion to it (or a new `it` block next to it) matching the file's existing style:

```typescript
it('requests gmail.send alongside the calendar scopes', () => {
  const provider = new GoogleCalendarProvider()
  const url = provider.getAuthUrl('state-123')
  const scope = new URL(url).searchParams.get('scope') ?? ''
  expect(scope).toContain('https://www.googleapis.com/auth/gmail.send')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/oauth/providers/__tests__/google-calendar.test.ts`
Expected: FAIL — scope string does not contain `gmail.send`.

- [ ] **Step 3: Add the scope**

In `Backend/src/lib/oauth/providers/google-calendar.ts`, change:

```typescript
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'email',
        'profile'
      ].join(' '),
```

to:

```typescript
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'email',
        'profile'
      ].join(' '),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/oauth/providers/__tests__/google-calendar.test.ts`
Expected: PASS

- [ ] **Step 5: Export `getAccessToken` for reuse by the Gmail sender**

In `Backend/src/modules/scheduling/google-calendar.service.ts:12`, change:

```typescript
async function getAccessToken(workspaceId: string): Promise<string> {
```

to:

```typescript
export async function getAccessToken(workspaceId: string): Promise<string> {
```

- [ ] **Step 6: Run the full scheduling test suite to confirm nothing broke**

Run: `npx vitest run src/modules/scheduling src/lib/oauth`
Expected: all pass (this is a pure export addition, no behavior change).

- [ ] **Step 7: Commit**

```bash
git add src/lib/oauth/providers/google-calendar.ts src/lib/oauth/providers/__tests__/google-calendar.test.ts src/modules/scheduling/google-calendar.service.ts
git commit -m "feat(oauth): request gmail.send scope, export getAccessToken for reuse"
```

---

### Task 3: `gmail.service.ts` — generic Gmail API send helper

**Files:**
- Create: `Backend/src/modules/scheduling/gmail.service.ts`
- Test: `Backend/src/modules/scheduling/__tests__/gmail.service.test.ts`

**Interfaces:**
- Consumes: `getAccessToken(workspaceId: string): Promise<string>` from Task 2.
- Produces: `sendGmailEmail(workspaceId: string, params: { to: string[]; subject: string; html: string }): Promise<void>` — throws on any failure (no Google connection, token refresh failure, Gmail API error). Consumed by Task 4's `visitEmailNotification.service.ts`.

- [ ] **Step 1: Write the failing tests**

Create `Backend/src/modules/scheduling/__tests__/gmail.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn() } }
}))
vi.mock('../google-calendar.service', () => ({
  getAccessToken: vi.fn(async () => 'access-token-123')
}))

import { sendGmailEmail } from '../gmail.service'
import { prisma } from '../../../lib/prisma'
import { getAccessToken } from '../google-calendar.service'

const WS = 'ws-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalEmail: 'drillchilecl@gmail.com' } as any)
  global.fetch = vi.fn(async () => ({ ok: true, text: async () => '' })) as any
})

describe('sendGmailEmail', () => {
  it('sends via the Gmail API with the refreshed access token', async () => {
    await sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })

    expect(getAccessToken).toHaveBeenCalledWith(WS)
    expect(fetch).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token-123' })
      })
    )
  })

  it('encodes the raw MIME message as base64url in the request body', async () => {
    await sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })

    const call = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.raw).not.toMatch(/[+/=]/) // base64url has no +, /, or padding =
    const decoded = Buffer.from(body.raw, 'base64url').toString('utf-8')
    expect(decoded).toContain('From: drillchilecl@gmail.com')
    expect(decoded).toContain('To: a@drillchile.cl')
    expect(decoded).toContain('<p>hola</p>')
  })

  it('throws when the workspace has no connected Google account', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalEmail: null } as any)

    await expect(
      sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })
    ).rejects.toThrow('google_calendar_not_connected')
  })

  it('throws with the Gmail API error body when the send fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, text: async () => 'insufficient scope' })) as any

    await expect(
      sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })
    ).rejects.toThrow('insufficient scope')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/scheduling/__tests__/gmail.service.test.ts`
Expected: FAIL — `Cannot find module '../gmail.service'`.

- [ ] **Step 3: Implement `gmail.service.ts`**

Create `Backend/src/modules/scheduling/gmail.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'
import { getAccessToken } from './google-calendar.service'

/**
 * Sends an email via the Gmail API, authenticated as the workspace's
 * connected Google account (the same OAuth grant used for Calendar sync).
 * Throws on any failure — no Google connection, token refresh failure, or
 * a Gmail API error. Callers that must not fail on a notification error
 * (e.g. appointment-notifications.service.ts) are responsible for catching.
 */
export async function sendGmailEmail(
  workspaceId: string,
  params: { to: string[]; subject: string; html: string }
): Promise<void> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalEmail: true }
  })
  if (!ws?.googleCalEmail) throw new Error('google_calendar_not_connected')

  const accessToken = await getAccessToken(workspaceId)
  const { to, subject, html } = params

  // RFC 2047 encoded-word so a subject containing emoji/non-ASCII survives as a mail header.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`

  const message = [
    `From: ${ws.googleCalEmail}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html
  ].join('\r\n')

  const raw = Buffer.from(message, 'utf-8').toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[gmail] send failed: ${err}`)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/scheduling/__tests__/gmail.service.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/modules/scheduling/gmail.service.ts src/modules/scheduling/__tests__/gmail.service.test.ts
git commit -m "feat(scheduling): add sendGmailEmail() Gmail API helper"
```

---

### Task 4: `visitEmailNotification.service.ts` — content builder + orchestration

**Files:**
- Create: `Backend/src/modules/scheduling/visitEmailNotification.service.ts`
- Test: `Backend/src/modules/scheduling/__tests__/visitEmailNotification.service.test.ts`

**Interfaces:**
- Consumes: `sendGmailEmail()` from Task 3; `formatApptDateTime(d: Date, tz: string): string` (exported, `appointment-notifications.service.ts:24`).
- Produces: `sendVisitEmailNotification(workspaceId: string, params: { contact: { id: string; name: string; phone: string | null }; appointment: { type: string; scheduledAt: Date }; kind: 'created' | 'rescheduled'; oldScheduledAt?: Date }): Promise<void>` — no-ops (returns without throwing) when `appointment.type !== 'SITE_VISIT'` or `visitNotifyEmails` is unset; throws on any real send failure. Consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `Backend/src/modules/scheduling/__tests__/visitEmailNotification.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() },
    businessHours: { findUnique: vi.fn() }
  }
}))
vi.mock('../gmail.service', () => ({ sendGmailEmail: vi.fn(async () => {}) }))

import { sendVisitEmailNotification } from '../visitEmailNotification.service'
import { prisma } from '../../../lib/prisma'
import { sendGmailEmail } from '../gmail.service'

const WS = 'ws-1'
const CONTACT = { id: 'c1', name: 'Alexis Carvajal', phone: '56942597739' }
const APPT = { type: 'SITE_VISIT', scheduledAt: new Date('2026-08-10T19:00:00Z') }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'America/Santiago' } as any)
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: 'ops@drillchile.cl, ventas@drillchile.cl' } as any)
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({
    sessionId: 'sess-123',
    qualificationData: { rawFields: { direccion: 'Inés de Suárez 283, Quilpué', houseMapUrl: 'https://maps.google.com/house', meterMapUrl: 'https://maps.google.com/meter' } }
  } as any)
})

describe('sendVisitEmailNotification', () => {
  it('sends to every configured recipient with the built subject and HTML body', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendGmailEmail).toHaveBeenCalledWith(WS, expect.objectContaining({
      to: ['ops@drillchile.cl', 'ventas@drillchile.cl'],
      subject: expect.stringContaining('Alexis Carvajal'),
      html: expect.stringContaining('Alexis Carvajal')
    }))
  })

  it('includes the quote link, address, and both map links in the body', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).toContain('https://solar.drillchile.cl/cotizaciones?sessionId=sess-123')
    expect(html).toContain('Inés de Suárez 283, Quilpué')
    expect(html).toContain('https://maps.google.com/house')
    expect(html).toContain('https://maps.google.com/meter')
  })

  it('includes the previous date/time for a reschedule', async () => {
    const oldScheduledAt = new Date('2026-08-09T19:00:00Z')
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'rescheduled', oldScheduledAt })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).toContain('Anteriormente')
  })

  it('omits the quote section when the contact has no sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ sessionId: null, qualificationData: null } as any)

    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).not.toContain('cotizaciones?sessionId')
  })

  it('does nothing for a CALL appointment', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: { type: 'CALL', scheduledAt: APPT.scheduledAt }, kind: 'created' })

    expect(sendGmailEmail).not.toHaveBeenCalled()
  })

  it('does nothing when visitNotifyEmails is not configured', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: null } as any)

    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendGmailEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/scheduling/__tests__/visitEmailNotification.service.test.ts`
Expected: FAIL — `Cannot find module '../visitEmailNotification.service'`.

- [ ] **Step 3: Implement `visitEmailNotification.service.ts`**

Create `Backend/src/modules/scheduling/visitEmailNotification.service.ts`:

```typescript
import { prisma } from '../../lib/prisma'
import { sendGmailEmail } from './gmail.service'
import { formatApptDateTime } from './appointment-notifications.service'

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || 'America/Santiago'
  } catch {
    return 'America/Santiago'
  }
}

function row(label: string, value?: string | null): string {
  if (!value) return ''
  return `<tr><td style="padding:2px 12px 2px 0;color:#666;white-space:nowrap;">${label}</td><td style="padding:2px 0;font-weight:600;">${value}</td></tr>`
}

function mapLink(url?: string, label?: string): string {
  if (!url) return ''
  return `<div style="margin-top:4px;"><a href="${url}" style="color:#7c3aed;text-decoration:none;">→ ${label}</a></div>`
}

function buildVisitEmailHtml(data: {
  name: string
  phone: string | null
  when: string
  oldWhen?: string
  direccion?: string
  houseMapUrl?: string
  meterMapUrl?: string
  quoteUrl?: string
}): string {
  const quoteSection = data.quoteUrl
    ? `<h3 style="margin:20px 0 6px;">💰 Cotización</h3>${mapLink(data.quoteUrl, 'Ver cotización')}`
    : ''

  return `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;max-width:520px;">
  <p>Equipo DrillChile,</p>
  <p>Se agendó una nueva visita técnica. Detalle para coordinar la salida:</p>

  <h3 style="margin:20px 0 6px;">🗓️ Visita</h3>
  <table>
    ${row('Fecha y hora:', data.when)}
    ${data.oldWhen ? row('Anteriormente:', data.oldWhen) : ''}
  </table>

  <h3 style="margin:20px 0 6px;">👤 Cliente</h3>
  <table>
    ${row('Nombre:', data.name)}
    ${row('Teléfono:', data.phone)}
  </table>

  <h3 style="margin:20px 0 6px;">📍 Ubicación</h3>
  <table>
    ${row('Dirección:', data.direccion)}
  </table>
  ${mapLink(data.houseMapUrl, 'Ver ubicación de la casa')}
  ${mapLink(data.meterMapUrl, 'Ver ubicación del medidor')}

  ${quoteSection}

  <p style="margin-top:24px;">Revisa el CRM para más detalles.</p>
  <p style="color:#999;font-size:12px;margin-top:24px;">— Metria · Aviso automático</p>
</div>
  `.trim()
}

/**
 * Sends the SITE_VISIT email notification to the workspace's configured
 * visitNotifyEmails recipients. No-ops (does not throw) for non-SITE_VISIT
 * appointments or when no recipients are configured — same on/off
 * philosophy as the WhatsApp technician alert's notifyPhone gate. Throws
 * on a real Gmail send failure; the caller (appointment-notifications
 * .service.ts) is responsible for treating that as non-blocking.
 */
export async function sendVisitEmailNotification(
  workspaceId: string,
  params: {
    contact: { id: string; name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date }
    kind: 'created' | 'rescheduled'
    oldScheduledAt?: Date
  }
): Promise<void> {
  const { contact, appointment, kind, oldScheduledAt } = params
  if (appointment.type !== 'SITE_VISIT') return

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { visitNotifyEmails: true } })
  const recipients = (ws?.visitNotifyEmails ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (recipients.length === 0) return

  const full = await prisma.contact.findUnique({
    where: { id: contact.id },
    select: { qualificationData: true, sessionId: true }
  })
  const rawFields = ((full?.qualificationData as any)?.rawFields ?? {}) as Record<string, string>
  const quoteUrl = full?.sessionId ? `https://solar.drillchile.cl/cotizaciones?sessionId=${full.sessionId}` : undefined

  const tz = await getWorkspaceTimezone(workspaceId)
  const when = formatApptDateTime(appointment.scheduledAt, tz)
  const oldWhen = oldScheduledAt ? formatApptDateTime(oldScheduledAt, tz) : undefined

  const subject = kind === 'created'
    ? `📅 Nueva visita técnica agendada — ${contact.name}`
    : `📅 Visita técnica reagendada — ${contact.name}`

  const html = buildVisitEmailHtml({
    name: contact.name,
    phone: contact.phone,
    when,
    oldWhen,
    direccion: rawFields.direccion,
    houseMapUrl: rawFields.houseMapUrl,
    meterMapUrl: rawFields.meterMapUrl,
    quoteUrl
  })

  await sendGmailEmail(workspaceId, { to: recipients, subject, html })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/scheduling/__tests__/visitEmailNotification.service.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/modules/scheduling/visitEmailNotification.service.ts src/modules/scheduling/__tests__/visitEmailNotification.service.test.ts
git commit -m "feat(scheduling): add sendVisitEmailNotification() with corporate HTML layout"
```

---

### Task 5: Wire the email branch into `notifyAppointmentEvent`

**Files:**
- Modify: `Backend/src/modules/scheduling/appointment-notifications.service.ts:83-129` (`notifyAppointmentEvent`)
- Test: `Backend/src/modules/scheduling/__tests__/appointment-notifications.service.test.ts` (existing file — extend)

**Interfaces:**
- Consumes: `sendVisitEmailNotification()` from Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `Backend/src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`. First, add the mock (near the top, alongside the existing `vi.mock('../../messaging/message.service', ...)`):

```typescript
vi.mock('../visitEmailNotification.service', () => ({
  sendVisitEmailNotification: vi.fn(async () => {})
}))
```

And the import (near the existing imports):

```typescript
import { sendVisitEmailNotification } from '../visitEmailNotification.service'
const sendVisitEmailNotificationMock = sendVisitEmailNotification as any
```

Then add these tests inside the existing `describe('notifyAppointmentEvent', ...)` block:

```typescript
  it('sends the email notification alongside the WhatsApp alert', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendVisitEmailNotificationMock).toHaveBeenCalledWith(WS, {
      contact: CONTACT, appointment: APPT, kind: 'created', oldScheduledAt: undefined
    })
  })

  it('still sends the email notification when the workspace has no WhatsApp channel connected', async () => {
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendVisitEmailNotificationMock).toHaveBeenCalled()
  })

  it('never throws when the email notification fails, and still sends the WhatsApp alert', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)
    sendVisitEmailNotificationMock.mockRejectedValueOnce(new Error('gmail down'))

    await expect(
      notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })
    ).resolves.toBeUndefined()
    expect(sendPlatformMessageMock).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`
Expected: FAIL — `sendVisitEmailNotificationMock` never called (3 new failures); all pre-existing tests still pass.

- [ ] **Step 3: Restructure `notifyAppointmentEvent`**

In `Backend/src/modules/scheduling/appointment-notifications.service.ts`, replace the full `notifyAppointmentEvent` function body (lines 92-128) with:

```typescript
  try {
    const { contact, appointment, kind, oldScheduledAt, conversationId } = params
    if (kind === 'rescheduled' && !oldScheduledAt) {
      console.error('[appointment-notifications] rescheduled event missing oldScheduledAt, skipping')
      return
    }

    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' } })
    if (channel) {
      try {
        await sendTechnicianAlert(workspaceId, channel, { contact, appointment, kind, oldScheduledAt })
      } catch (err) {
        console.error('[appointment-notifications] internal alert failed (non-blocking):', err)
      }

      const tz = await getWorkspaceTimezone(workspaceId)
      const when = formatApptDateTime(appointment.scheduledAt, tz)
      const type = typeLabel(appointment.type)

      try {
        const leadText = kind === 'created'
          ? `Tu ${type.toLowerCase()} quedó agendada para el ${when}. Cualquier cambio, escríbenos por aquí.`
          : `Tu ${type.toLowerCase()} fue reagendada: ahora es el ${when} (antes: ${formatApptDateTime(oldScheduledAt!, tz)}).`

        if (conversationId) {
          await sendOutboundPlatformMessage(workspaceId, conversationId, leadText)
        } else if (contact.phone) {
          await sendPlatformMessage('WHATSAPP', channel.config, contact.phone, leadText, workspaceId)
        }
      } catch (err) {
        console.error('[appointment-notifications] lead confirmation failed (non-blocking):', err)
      }
    }

    // Independent of the WhatsApp channel above — email must still be
    // attempted even if the workspace has no WhatsApp connected at all.
    try {
      const { sendVisitEmailNotification } = await import('./visitEmailNotification.service')
      await sendVisitEmailNotification(workspaceId, { contact, appointment, kind, oldScheduledAt })
    } catch (err) {
      console.error('[appointment-notifications] email notification failed (non-blocking):', err)
    }
  } catch (err) {
    console.error('[appointment-notifications] notifyAppointmentEvent failed (non-blocking):', err)
  }
```

(This wraps the existing WhatsApp logic in `if (channel) { ... }` — unchanged internally — and adds the new email branch after it, outside that condition.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`
Expected: PASS, all tests including the pre-existing ones (the "does nothing when the workspace has no WhatsApp channel connected" test still passes — it only asserts on the WhatsApp mocks, which the restructure doesn't change).

- [ ] **Step 5: Run the full scheduling and ai-agent suites**

Run: `npx vitest run src/modules/scheduling src/modules/ai-agent`
Expected: all pass — this confirms `ai.service.ts`'s two `notifyAppointmentEvent` call sites (`schedule_appointment`, `reschedule_appointment`) are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/modules/scheduling/appointment-notifications.service.ts src/modules/scheduling/__tests__/appointment-notifications.service.test.ts
git commit -m "feat(scheduling): wire email notification into notifyAppointmentEvent, independent of WhatsApp channel"
```

---

### Task 6: Backend — `visitNotifyEmails` in the booking-config route

**Files:**
- Modify: `Backend/src/modules/scheduling/scheduling.routes.ts:113-157` (GET `/scheduling/booking-config`)
- Modify: `Backend/src/modules/scheduling/scheduling.routes.ts:159-210` (PATCH `/scheduling/booking-config`)
- Test: `Backend/src/modules/scheduling/__tests__/scheduling.routes.test.ts` (existing file — extend)

**Interfaces:**
- Produces: `GET /scheduling/booking-config` response includes `visitNotifyEmails: string | null`; `PATCH /scheduling/booking-config` accepts `visitNotifyEmails` in the body. Consumed by Task 7 (frontend).

- [ ] **Step 1: Write the failing tests**

Add to `Backend/src/modules/scheduling/__tests__/scheduling.routes.test.ts`:

```typescript
describe('GET /api/scheduling/booking-config — visitNotifyEmails', () => {
  it('includes visitNotifyEmails in the response', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30,
      notifyPhone: '+56912345678', visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl'
    } as any)

    const res = await request(buildApp()).get('/api/scheduling/booking-config')

    expect(res.status).toBe(200)
    expect(res.body.visitNotifyEmails).toBe('ops@drillchile.cl,ventas@drillchile.cl')
  })
})

describe('PATCH /api/scheduling/booking-config — visitNotifyEmails', () => {
  it('normalizes the list — trims each address and drops empty entries', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30,
      notifyPhone: null, visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl'
    } as any)

    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: '  ops@drillchile.cl , ventas@drillchile.cl ,, ' })

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitNotifyEmails: 'ops@drillchile.cl,ventas@drillchile.cl' }) })
    )
  })

  it('rejects the list when any address is invalid', async () => {
    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: 'ops@drillchile.cl, not-an-email' })

    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('clears visitNotifyEmails when sent as an empty string', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30,
      notifyPhone: null, visitNotifyEmails: null
    } as any)

    await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ visitNotifyEmails: '' })

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitNotifyEmails: null }) })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/scheduling/__tests__/scheduling.routes.test.ts`
Expected: FAIL — `visitNotifyEmails` missing from responses, invalid list not rejected.

- [ ] **Step 3: Update the GET handler**

In `Backend/src/modules/scheduling/scheduling.routes.ts`, in the GET `/scheduling/booking-config` handler, change:

```typescript
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true, notifyPhone: true }
    })
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    res.json({
      bookingSlug: ws.bookingSlug,
      bookingTitle: ws.bookingTitle,
      bookingDurationMin: ws.bookingDurationMin,
      notifyPhone: ws.notifyPhone
    })
```

to:

```typescript
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true, notifyPhone: true, visitNotifyEmails: true }
    })
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    res.json({
      bookingSlug: ws.bookingSlug,
      bookingTitle: ws.bookingTitle,
      bookingDurationMin: ws.bookingDurationMin,
      notifyPhone: ws.notifyPhone,
      visitNotifyEmails: ws.visitNotifyEmails
    })
```

- [ ] **Step 4: Update the PATCH handler**

In the same file, in the PATCH `/scheduling/booking-config` handler, change:

```typescript
    const { bookingSlug, bookingTitle, bookingDurationMin, notifyPhone } = req.body ?? {}
    const data: { bookingSlug?: string; bookingTitle?: string | null; bookingDurationMin?: number; notifyPhone?: string | null } = {}
```

to:

```typescript
    const { bookingSlug, bookingTitle, bookingDurationMin, notifyPhone, visitNotifyEmails } = req.body ?? {}
    const data: { bookingSlug?: string; bookingTitle?: string | null; bookingDurationMin?: number; notifyPhone?: string | null; visitNotifyEmails?: string | null } = {}
```

Then, right after the existing `if (notifyPhone !== undefined) { ... }` block, add:

```typescript
    if (visitNotifyEmails !== undefined) {
      const trimmed = visitNotifyEmails === null ? '' : String(visitNotifyEmails).trim()
      if (!trimmed) {
        data.visitNotifyEmails = null
      } else {
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const addresses = trimmed.split(',').map(e => e.trim()).filter(Boolean)
        if (addresses.length === 0 || addresses.some(a => !EMAIL_RE.test(a))) {
          return res.status(400).json({ error: 'Uno o más correos no son válidos' })
        }
        data.visitNotifyEmails = addresses.join(',')
      }
    }
```

Then update the two `select`/response blocks in that same handler — change:

```typescript
      const ws = await prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true, notifyPhone: true }
      })
      res.json({
        bookingSlug: ws.bookingSlug,
        bookingTitle: ws.bookingTitle,
        bookingDurationMin: ws.bookingDurationMin,
        notifyPhone: ws.notifyPhone
      })
```

to:

```typescript
      const ws = await prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true, notifyPhone: true, visitNotifyEmails: true }
      })
      res.json({
        bookingSlug: ws.bookingSlug,
        bookingTitle: ws.bookingTitle,
        bookingDurationMin: ws.bookingDurationMin,
        notifyPhone: ws.notifyPhone,
        visitNotifyEmails: ws.visitNotifyEmails
      })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/scheduling/__tests__/scheduling.routes.test.ts`
Expected: PASS, all tests including the pre-existing `notifyPhone` ones.

- [ ] **Step 6: Commit**

```bash
git add src/modules/scheduling/scheduling.routes.ts src/modules/scheduling/__tests__/scheduling.routes.test.ts
git commit -m "feat(scheduling): expose visitNotifyEmails on the booking-config route"
```

---

### Task 7: Frontend — `visitNotifyEmails` field in `BookingConfigCard`

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/appointments/BookingConfigCard.tsx`

**Interfaces:**
- Consumes: `GET /scheduling/booking-config` → `{ ..., visitNotifyEmails: string | null }`, `PATCH /scheduling/booking-config` accepting `visitNotifyEmails` from Task 6.

This task has no separate unit-test step — `BookingConfigCard` has no existing test file, and the pattern being extended (`notifyPhone`) doesn't have one either. Verify by running the dev server and checking the field in the browser (Step 5).

- [ ] **Step 1: Add the field to the `BookingConfig` interface and state**

In `metria-metrics/Frontend/src/app/dashboard/crm/appointments/BookingConfigCard.tsx`, change:

```typescript
interface BookingConfig {
  bookingSlug: string | null
  bookingTitle: string | null
  bookingDurationMin: number
  notifyPhone: string | null
}
```

to:

```typescript
interface BookingConfig {
  bookingSlug: string | null
  bookingTitle: string | null
  bookingDurationMin: number
  notifyPhone: string | null
  visitNotifyEmails: string | null
}
```

And change:

```typescript
  const [notifyPhone, setNotifyPhone] = useState('')
```

to:

```typescript
  const [notifyPhone, setNotifyPhone] = useState('')
  const [visitNotifyEmails, setVisitNotifyEmails] = useState('')
```

- [ ] **Step 2: Load and save the new field**

In the `useEffect` load block, change:

```typescript
        setNotifyPhone(data.notifyPhone ?? '')
```

to:

```typescript
        setNotifyPhone(data.notifyPhone ?? '')
        setVisitNotifyEmails(data.visitNotifyEmails ?? '')
```

In `handleSave`, change:

```typescript
        body: JSON.stringify({
          bookingSlug: slug,
          bookingTitle: title.trim() || null,
          bookingDurationMin: duration,
          notifyPhone: notifyPhone.trim() || null,
        }),
```

to:

```typescript
        body: JSON.stringify({
          bookingSlug: slug,
          bookingTitle: title.trim() || null,
          bookingDurationMin: duration,
          notifyPhone: notifyPhone.trim() || null,
          visitNotifyEmails: visitNotifyEmails.trim() || null,
        }),
```

And right after `setNotifyPhone(saved.notifyPhone ?? '')` in the same function, add:

```typescript
      setVisitNotifyEmails(saved.visitNotifyEmails ?? '')
```

Finally, add `visitNotifyEmails` to the `useCallback` dependency array — change:

```typescript
  }, [slug, title, duration, notifyPhone, previewSlug])
```

to:

```typescript
  }, [slug, title, duration, notifyPhone, visitNotifyEmails, previewSlug])
```

- [ ] **Step 3: Add the input field to the UI**

Right after the existing "Número interno a notificar" block (the `<div className="space-y-1.5">` containing `booking-notify-phone`), add:

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="booking-notify-emails" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Correos a notificar
          </Label>
          <Input
            id="booking-notify-emails"
            value={visitNotifyEmails}
            onChange={e => setVisitNotifyEmails(e.target.value)}
            placeholder="ops@drillchile.cl, ventas@drillchile.cl"
            className="rounded-xl"
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground">
            Recibe un correo (separa varios con coma) cada vez que se agenda o reagenda una visita técnica.
          </p>
        </div>
```

- [ ] **Step 4: Type-check**

Run (from `metria-metrics/Frontend`): `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `BookingConfigCard.tsx`.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev` (from `metria-metrics/Frontend`), open `http://localhost:3000/dashboard/crm/appointments`, confirm the new "Correos a notificar" field appears under "Número interno a notificar", loads/saves correctly, and shows a toast on save (existing `handleSave` toast behavior, unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/crm/appointments/BookingConfigCard.tsx
git commit -m "feat(appointments): add visitNotifyEmails field to booking config UI"
```

---

## Manual rollout (after all 7 tasks are merged and deployed)

1. Push to `main`, redeploy the Easypanel backend (Vercel frontend auto-deploys).
2. Reconnect Google Calendar: Dashboard → Configuración Técnica → tarjeta "Google Calendar" → "Conectar Ahora" → accept the one-time "app no verificada" warning.
3. Dashboard → CRM → Citas → fill in "Correos a notificar" → Guardar cambios.
4. Schedule or reschedule a real SITE_VISIT appointment and confirm the email arrives with the correct layout.
