# Appointment Created/Rescheduled WhatsApp Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an appointment is created or rescheduled (via the WhatsApp AI agent or the public `/book/:slug` page), send a WhatsApp confirmation to the lead and an alert to an internal number configured per workspace.

**Architecture:** A new `rescheduleAppointment()` in `scheduling.service.ts` gives the system a real "move this appointment's time" operation (today only create/status-change exist). A new `appointment-notifications.service.ts` module resolves the workspace's WhatsApp channel and sends two best-effort, non-blocking messages — one to the lead (via the existing conversation when there is one, otherwise a raw message), one to `Workspace.notifyPhone`. Three call sites wire it in: the AI agent's `schedule_appointment` tool, a new `reschedule_appointment` tool, and the public booking route.

**Tech Stack:** Express, Prisma, Vitest, Next.js/React (frontend field only), WhatsApp Cloud API (existing `sendPlatformMessage`/`sendWhatsAppMessage`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-appointment-notifications-design.md` — follow it exactly; this plan implements it task by task.
- No new WhatsApp credentials/channel — reuse the workspace's existing connected `Channel` (platform `WHATSAPP`).
- Every notification send is best-effort: a WhatsApp send failure must never fail the booking/reschedule request itself (mirrors the existing `syncAppointmentToCalendar` pattern already in this codebase).
- `Appointment` rows are never duplicated for a reschedule — `rescheduleAppointment()` updates the existing row's `scheduledAt`/`durationMin` in place.
- Local dev DB must be running before any `db:push`: from `Backend/`, run `docker compose up -d` first if Postgres isn't already up.
- Run `npm test` (Vitest) from `Backend/` after each backend task; run the frontend's `pnpm test` after the frontend task.

---

### Task 1: Add `Workspace.notifyPhone` to the schema

**Files:**
- Modify: `Backend/prisma/schema.prisma:29-31`

**Interfaces:**
- Produces: `Workspace.notifyPhone: string | null` — consumed by Task 5 (`appointment-notifications.service.ts`) and Task 8 (`scheduling.routes.ts`).

- [ ] **Step 1: Add the field**

In `Backend/prisma/schema.prisma`, the `Workspace` model currently reads (lines 29-31):

```prisma
  bookingSlug              String?                   @unique @map("booking_slug")
  bookingTitle             String?                   @map("booking_title")
  bookingDurationMin       Int                       @default(30) @map("booking_duration_min")
```

Change it to:

```prisma
  bookingSlug              String?                   @unique @map("booking_slug")
  bookingTitle             String?                   @map("booking_title")
  bookingDurationMin       Int                       @default(30) @map("booking_duration_min")
  notifyPhone              String?                   @map("notify_phone")
```

- [ ] **Step 2: Make sure the local dev database is running**

Run: `cd Backend && docker compose ps`
Expected: a postgres service listed as `running`/`Up`. If not, run `docker compose up -d` first and wait for it to report healthy.

- [ ] **Step 3: Push the schema change and regenerate the Prisma client**

Run: `cd Backend && npm run db:push`
Expected: output ending in `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

- [ ] **Step 4: Verify the client picked up the new field**

Run: `cd Backend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: no new errors mentioning `notifyPhone` (pre-existing unrelated errors, if any, are fine — the design doc notes 4 preexisting ones).

- [ ] **Step 5: Commit**

```bash
git add Backend/prisma/schema.prisma
git commit -m "feat(scheduling): add Workspace.notifyPhone for appointment alerts"
```

---

### Task 2: `rescheduleAppointment()` in `scheduling.service.ts`

**Files:**
- Modify: `Backend/src/modules/scheduling/scheduling.service.ts:131-174`
- Test: `Backend/src/modules/scheduling/__tests__/scheduling.service.test.ts`

**Interfaces:**
- Consumes: existing `prisma.appointment`, `prisma.availabilityRule`, `getWorkspaceTimezone`, `toWallClock`, `findRuleForTime` (all already in this file).
- Produces: `rescheduleAppointment(workspaceId: string, appointmentId: string, newScheduledAt: Date): Promise<Appointment & { oldScheduledAt: Date }>` — consumed by Task 6 (`ai.service.ts`).

This task also extracts two helpers (`resolveSlotDuration`, `assertNoCollision`) out of the existing `scheduleAppointment()` so `rescheduleAppointment()` doesn't duplicate the same validation logic. Behavior of `scheduleAppointment()` does not change — only its internals are reorganized.

- [ ] **Step 1: Write the failing tests**

Add this import change at the top of `Backend/src/modules/scheduling/__tests__/scheduling.service.test.ts` (currently line 23):

```ts
import { getAvailableSlots, scheduleAppointment, filterSlotsByCalendarBusy, rescheduleAppointment } from '../scheduling.service'
```

Append this new `describe` block at the end of the file (after the closing `})` of `describe('filterSlotsByCalendarBusy', ...)`, i.e. after line 203):

```ts

describe('rescheduleAppointment', () => {
  beforeEach(() => {
    vi.mocked(prisma.availabilityRule.findMany).mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', slotMinutes: 60, apptType: 'SITE_VISIT' }
    ] as any)
  })

  it('updates scheduledAt/durationMin and returns the old time', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([])
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      id: 'a1', scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60
    } as any)

    const result = await rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00'))

    expect(result.oldScheduledAt).toEqual(new Date('2026-06-15T10:00:00'))
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60 }
    })
  })

  it('rejects rescheduling a CANCELLED appointment', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'CANCELLED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('Cannot reschedule appointment with status CANCELLED')
  })

  it('rejects a new time outside availability', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T22:00:00')))
      .rejects.toThrow('outside availability')
  })

  it('rejects a new time colliding with another appointment, ignoring the appointment being moved', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'a1', workspaceId: WS, type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-15T10:00:00')
    } as any)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: new Date('2026-06-15T14:00:00'), durationMin: 60 }
    ] as any)

    await expect(rescheduleAppointment(WS, 'a1', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('already taken')
  })

  it('throws when the appointment does not exist in this workspace', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)

    await expect(rescheduleAppointment(WS, 'ghost', new Date('2026-06-15T14:00:00')))
      .rejects.toThrow('Appointment not found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/scheduling.service.test.ts`
Expected: FAIL — `rescheduleAppointment is not a function` (or similar import error).

- [ ] **Step 3: Refactor `scheduleAppointment` and add `rescheduleAppointment`**

In `Backend/src/modules/scheduling/scheduling.service.ts`, replace the existing `scheduleAppointment` function (current lines 131-174) with the following — this extracts the shared validation into two helpers and adds the new function right after:

```ts
/** Resolves the AvailabilityRule matching `scheduledAt` and returns its slot duration in ms. Throws if outside availability. */
async function resolveSlotDuration(workspaceId: string, type: string, scheduledAt: Date): Promise<number> {
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } })
  const tz = await getWorkspaceTimezone(workspaceId)
  const wall = toWallClock(scheduledAt, tz)
  const day = wall.getDay()
  const minutes = wall.getHours() * 60 + wall.getMinutes()
  const matchedRule = findRuleForTime(rules, day, minutes)
  if (!matchedRule) throw new Error('Requested time is outside availability')
  return matchedRule.slotMinutes * 60_000
}

/** Throws 'Slot already taken' if [scheduledAt, scheduledAt+duration) collides with another SCHEDULED/CONFIRMED appointment that day. */
async function assertNoCollision(
  workspaceId: string,
  scheduledAt: Date,
  duration: number,
  excludeAppointmentId?: string
): Promise<void> {
  const dayStart = new Date(scheduledAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  const sameDay = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: { gte: dayStart, lt: dayEnd },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
    },
    select: { scheduledAt: true, durationMin: true }
  })
  const requested = scheduledAt.getTime()
  const collision = sameDay.some(a => {
    const start = a.scheduledAt.getTime()
    return requested < start + a.durationMin * 60_000 && start < requested + duration
  })
  if (collision) throw new Error('Slot already taken')
}

export async function scheduleAppointment(
  workspaceId: string,
  input: { contactId: string; type: string; scheduledAt: Date; dealId?: string; createdBy: string; notes?: string }
) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const duration = await resolveSlotDuration(workspaceId, input.type, input.scheduledAt)
  await assertNoCollision(workspaceId, input.scheduledAt, duration)

  return prisma.appointment.create({
    data: {
      workspaceId,
      contactId: contact.id,
      dealId: input.dealId ?? null,
      type: input.type,
      scheduledAt: input.scheduledAt,
      durationMin: duration / 60_000,
      createdBy: input.createdBy,
      notes: input.notes ?? null
    }
  })
}

/**
 * Moves an existing appointment to a new time (in place — same row, no history kept).
 * Only SCHEDULED/CONFIRMED appointments can be moved. Reuses the same availability
 * and collision rules as scheduleAppointment, excluding the appointment itself from
 * the collision check.
 */
export async function rescheduleAppointment(
  workspaceId: string,
  appointmentId: string,
  newScheduledAt: Date
) {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, workspaceId } })
  if (!appt) throw new Error('Appointment not found')
  if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
    throw new Error(`Cannot reschedule appointment with status ${appt.status}`)
  }

  const duration = await resolveSlotDuration(workspaceId, appt.type, newScheduledAt)
  await assertNoCollision(workspaceId, newScheduledAt, duration, appointmentId)

  const oldScheduledAt = appt.scheduledAt
  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { scheduledAt: newScheduledAt, durationMin: duration / 60_000 }
  })
  return { ...updated, oldScheduledAt }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/scheduling.service.test.ts`
Expected: PASS — all tests including the pre-existing `getAvailableSlots`/`scheduleAppointment`/`filterSlotsByCalendarBusy` ones (behavior unchanged) plus the 5 new `rescheduleAppointment` tests.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/scheduling/scheduling.service.ts Backend/src/modules/scheduling/__tests__/scheduling.service.test.ts
git commit -m "feat(scheduling): add rescheduleAppointment, extract shared slot validation"
```

---

### Task 3: `updateCalendarEvent()` in `google-calendar.service.ts`

**Files:**
- Modify: `Backend/src/modules/scheduling/google-calendar.service.ts` (add after `cancelCalendarEvent`, currently ending line 200)
- Test (new): `Backend/src/modules/scheduling/__tests__/google-calendar.service.test.ts`

**Interfaces:**
- Consumes: existing private `getAccessToken(workspaceId)` in the same file.
- Produces: `updateCalendarEvent(workspaceId: string, googleEventId: string, opts: { startAt: Date; durationMin: number }): Promise<void>` — never throws. Consumed by Task 6 (`ai.service.ts`, reschedule path).

- [ ] **Step 1: Write the failing tests**

Create `Backend/src/modules/scheduling/__tests__/google-calendar.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn(), update: vi.fn() } }
}))
vi.mock('../../../lib/oauth/providers/google-calendar', () => ({
  GoogleCalendarProvider: vi.fn().mockImplementation(() => ({ refreshToken: vi.fn() }))
}))

import { updateCalendarEvent } from '../google-calendar.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

function connectedWorkspace() {
  return {
    googleCalendarId: null,
    googleCalAccessToken: 'tok-1',
    googleCalRefreshToken: 'refresh-1',
    googleCalTokenExpiry: new Date(Date.now() + 3600_000)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({}) })) as any
})

describe('updateCalendarEvent', () => {
  it('PATCHes the Calendar event with the new start/end time', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(connectedWorkspace() as any)

    await updateCalendarEvent(WS, 'evt-1', { startAt: new Date('2026-07-20T14:00:00Z'), durationMin: 60 })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/calendars/primary/events/evt-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"dateTime":"2026-07-20T14:00:00.000Z"')
      })
    )
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0][1] as any).body)
    expect(body.end.dateTime).toBe('2026-07-20T15:00:00.000Z')
  })

  it('never throws when the Calendar API call fails', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(connectedWorkspace() as any)
    global.fetch = vi.fn(async () => { throw new Error('network down') }) as any

    await expect(updateCalendarEvent(WS, 'evt-1', { startAt: new Date(), durationMin: 30 })).resolves.toBeUndefined()
  })

  it('never throws when Calendar is not connected', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalRefreshToken: null } as any)

    await expect(updateCalendarEvent(WS, 'evt-1', { startAt: new Date(), durationMin: 30 })).resolves.toBeUndefined()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/google-calendar.service.test.ts`
Expected: FAIL — `updateCalendarEvent is not a function`.

- [ ] **Step 3: Implement `updateCalendarEvent`**

In `Backend/src/modules/scheduling/google-calendar.service.ts`, add this function after `cancelCalendarEvent` (after its closing `}` on line 200, before `/** Lists all calendars... */` on line 202):

```ts
/** Updates an existing Google Calendar event's time (e.g. on appointment reschedule). Never throws. */
export async function updateCalendarEvent(
  workspaceId: string,
  googleEventId: string,
  opts: { startAt: Date; durationMin: number }
): Promise<void> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarId: true }
    })
    const calId = ws?.googleCalendarId ?? 'primary'
    const accessToken = await getAccessToken(workspaceId)

    const endAt = new Date(opts.startAt.getTime() + opts.durationMin * 60_000)

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${googleEventId}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start: { dateTime: opts.startAt.toISOString() },
          end: { dateTime: endAt.toISOString() }
        })
      }
    )
    if (!res.ok) {
      console.error('[gcal] updateEvent error', await res.text())
    }
  } catch (err) {
    console.error('[gcal] updateCalendarEvent failed (non-blocking):', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/google-calendar.service.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/scheduling/google-calendar.service.ts Backend/src/modules/scheduling/__tests__/google-calendar.service.test.ts
git commit -m "feat(scheduling): add updateCalendarEvent for rescheduled appointments"
```

---

### Task 4: Export `sendPlatformMessage` from `message.service.ts`

**Files:**
- Modify: `Backend/src/modules/messaging/message.service.ts:20`

**Interfaces:**
- Produces: `sendPlatformMessage(platform: string, config: any, to: string, text: string, workspaceId?: string): Promise<void>` — now importable. Consumed by Task 5 (`appointment-notifications.service.ts`).

This is a one-line visibility change — the function body is untouched, so no new test is needed here (its behavior is already covered indirectly by `message.service.ts`'s existing callers; direct coverage comes from Task 5's tests, which call it through the public export).

- [ ] **Step 1: Export the function**

In `Backend/src/modules/messaging/message.service.ts`, line 20 currently reads:

```ts
async function sendPlatformMessage(
```

Change to:

```ts
export async function sendPlatformMessage(
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd Backend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: no new errors (exporting a previously-private function cannot break existing callers in the same file).

- [ ] **Step 3: Commit**

```bash
git add Backend/src/modules/messaging/message.service.ts
git commit -m "refactor(messaging): export sendPlatformMessage for reuse outside the module"
```

---

### Task 5: `appointment-notifications.service.ts` (new module)

**Files:**
- Create: `Backend/src/modules/scheduling/appointment-notifications.service.ts`
- Test (new): `Backend/src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`

**Interfaces:**
- Consumes: `sendPlatformMessage` and `sendOutboundPlatformMessage` from `../messaging/message.service` (Task 4 export + existing export); `prisma.channel`, `prisma.workspace`, `prisma.businessHours`.
- Produces: `notifyAppointmentEvent(workspaceId: string, params: { contact: { id: string; name: string; phone: string | null }; appointment: { type: string; scheduledAt: Date; durationMin: number }; kind: 'created' | 'rescheduled'; oldScheduledAt?: Date; conversationId?: string }): Promise<void>` — never throws. Consumed by Task 6 (`ai.service.ts`) and Task 7 (`public-booking.routes.ts`).

- [ ] **Step 1: Write the failing tests**

Create `Backend/src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    businessHours: { findUnique: vi.fn() }
  }
}))

const sendPlatformMessageMock = vi.fn(async () => {})
const sendOutboundPlatformMessageMock = vi.fn(async () => {})
vi.mock('../../messaging/message.service', () => ({
  sendPlatformMessage: sendPlatformMessageMock,
  sendOutboundPlatformMessage: sendOutboundPlatformMessageMock
}))

import { notifyAppointmentEvent } from '../appointment-notifications.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
const CHANNEL = { id: 'ch-1', platform: 'WHATSAPP', config: { phoneNumberId: 'pn-1', accessToken: 'tok' } }
const CONTACT = { id: 'c1', name: 'Ana', phone: '56911112222' }
const APPT = { type: 'SITE_VISIT', scheduledAt: new Date('2026-07-20T14:00:00Z'), durationMin: 60 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.channel.findFirst).mockResolvedValue(CHANNEL as any)
  vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'America/Santiago' } as any)
})

describe('notifyAppointmentEvent', () => {
  it('sends both the internal alert and the lead confirmation when notifyPhone is set and a conversation exists', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, '56999998888', expect.stringContaining('Nueva cita'), WS)
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalledWith(WS, 'conv-1', expect.stringContaining('quedó agendada'))
  })

  it('sends a raw WhatsApp message to the lead when there is no conversation (public booking path)', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, CONTACT.phone, expect.stringContaining('quedó agendada'), WS)
  })

  it('skips the internal alert when notifyPhone is not configured', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalled()
  })

  it('includes the old time in the rescheduled message text', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)
    const oldScheduledAt = new Date('2026-07-19T14:00:00Z')

    await notifyAppointmentEvent(WS, {
      contact: CONTACT, appointment: APPT, kind: 'rescheduled', oldScheduledAt, conversationId: 'conv-1'
    })

    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, '56999998888', expect.stringContaining('Cita reagendada'), WS)
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalledWith(WS, 'conv-1', expect.stringContaining('reagendada'))
  })

  it('does nothing when the workspace has no WhatsApp channel connected', async () => {
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
  })

  it('never throws when the lead confirmation send fails', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)
    sendOutboundPlatformMessageMock.mockRejectedValueOnce(new Error('WhatsApp API down'))

    await expect(
      notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })
    ).resolves.toBeUndefined()
  })

  it('skips silently when kind is rescheduled but oldScheduledAt is missing', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'rescheduled', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`
Expected: FAIL — cannot find module `../appointment-notifications.service`.

- [ ] **Step 3: Implement the module**

Create `Backend/src/modules/scheduling/appointment-notifications.service.ts`:

```ts
import { prisma } from '../../lib/prisma'
import { sendPlatformMessage, sendOutboundPlatformMessage } from '../messaging/message.service'

type AppointmentEventKind = 'created' | 'rescheduled'

const TYPE_LABELS: Record<string, string> = {
  SITE_VISIT: 'Visita técnica',
  CALL: 'Llamada'
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'Cita'
}

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || 'America/Santiago'
  } catch {
    return 'America/Santiago'
  }
}

function formatApptDateTime(d: Date, tz: string): string {
  const datePart = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', timeZone: tz }).format(d)
  const timePart = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d)
  return `${datePart} a las ${timePart}`
}

/**
 * Sends the WhatsApp notifications for an appointment being created or rescheduled:
 * a confirmation to the lead, and an alert to the workspace's internal notifyPhone
 * (if configured). No-op if the workspace has no WhatsApp channel connected. Never
 * throws — a notification failure must never fail the booking/reschedule request.
 */
export async function notifyAppointmentEvent(
  workspaceId: string,
  params: {
    contact: { id: string; name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date; durationMin: number }
    kind: AppointmentEventKind
    oldScheduledAt?: Date
    conversationId?: string
  }
): Promise<void> {
  try {
    const { contact, appointment, kind, oldScheduledAt, conversationId } = params
    if (kind === 'rescheduled' && !oldScheduledAt) {
      console.error('[appointment-notifications] rescheduled event missing oldScheduledAt, skipping')
      return
    }

    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP' } })
    if (!channel) return

    const tz = await getWorkspaceTimezone(workspaceId)
    const when = formatApptDateTime(appointment.scheduledAt, tz)
    const type = typeLabel(appointment.type)

    try {
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { notifyPhone: true } })
      if (ws?.notifyPhone) {
        const internalText = kind === 'created'
          ? `Nueva cita — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}, ${when}.`
          : `Cita reagendada — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}: de ${formatApptDateTime(oldScheduledAt!, tz)} a ${when}.`
        await sendPlatformMessage('WHATSAPP', channel.config, ws.notifyPhone, internalText, workspaceId)
      }
    } catch (err) {
      console.error('[appointment-notifications] internal alert failed (non-blocking):', err)
    }

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
  } catch (err) {
    console.error('[appointment-notifications] notifyAppointmentEvent failed (non-blocking):', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/appointment-notifications.service.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/scheduling/appointment-notifications.service.ts Backend/src/modules/scheduling/__tests__/appointment-notifications.service.test.ts
git commit -m "feat(scheduling): add appointment-notifications.service for created/rescheduled WhatsApp alerts"
```

---

### Task 6: Wire into the AI agent (`ai.service.ts` + `promptCompiler.ts`)

**Files:**
- Modify: `Backend/src/modules/ai-agent/ai.service.ts` (imports, tool declarations, `RESPONDER_TOOL_NAMES`, `handleToolCall`)
- Modify: `Backend/src/modules/ai-agent/promptCompiler.ts:73-77`
- Test: `Backend/src/modules/ai-agent/__tests__/ai.service.test.ts`

**Interfaces:**
- Consumes: `rescheduleAppointment` (Task 2), `notifyAppointmentEvent` (Task 5), `updateCalendarEvent` (Task 3).
- Produces: new agent tool `reschedule_appointment(newIsoDateTime: string)`.

- [ ] **Step 1: Write the failing tests**

In `Backend/src/modules/ai-agent/__tests__/ai.service.test.ts`:

1. Extend the `prisma` mock (currently lines 3-15) to add `appointment`:

```ts
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    botAgent: { findFirst: vi.fn() },
    product: { findMany: vi.fn(async () => []) },
    deal: { findFirst: vi.fn(async () => null), update: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    pipelineStage: { findMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    contact: { findUnique: vi.fn(async () => ({ name: 'Ana', email: null })) },
    appointment: { findFirst: vi.fn() }
  }
}))
```

2. Extend the `google-calendar.service` mock (currently lines 16-19) to add `updateCalendarEvent`:

```ts
const syncAppointmentToCalendarMock = vi.fn(async () => {})
const updateCalendarEventMock = vi.fn(async () => {})
vi.mock('../../scheduling/google-calendar.service', () => ({
  syncAppointmentToCalendar: syncAppointmentToCalendarMock,
  updateCalendarEvent: updateCalendarEventMock
}))
```

3. Add a new mock for the notifications module, right after the `google-calendar.service` mock:

```ts
const notifyAppointmentEventMock = vi.fn(async () => {})
vi.mock('../../scheduling/appointment-notifications.service', () => ({
  notifyAppointmentEvent: notifyAppointmentEventMock
}))
```

4. Extend the `scheduling.service` mock (currently lines 33-37) to add `rescheduleAppointment`:

```ts
vi.mock('../../scheduling/scheduling.service', () => ({
  getAvailableSlots: vi.fn(async () => [new Date('2026-06-15T10:00:00')]),
  filterSlotsByCalendarBusy: vi.fn(async (_ws, _type, slots) => slots),
  scheduleAppointment: vi.fn(async () => ({ id: 'a1', scheduledAt: new Date('2026-06-15T10:00:00') })),
  rescheduleAppointment: vi.fn(async () => ({
    id: 'a1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-16T10:00:00'),
    durationMin: 60, googleEventId: null, oldScheduledAt: new Date('2026-06-15T10:00:00')
  }))
}))
```

5. Extend the import line (currently line 43) to add `rescheduleAppointment`:

```ts
import { scheduleAppointment, filterSlotsByCalendarBusy, rescheduleAppointment } from '../../scheduling/scheduling.service'
```

6. Add these tests after the existing `'executes get_available_slots and filters out slots busy...'` test (after its closing `})`, currently ending at line 137):

```ts

  it('notifies on schedule_appointment (new booking)', async () => {
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })

    await processAiResponse(WS, CONV, 'el lunes a las 10')

    expect(notifyAppointmentEventMock).toHaveBeenCalledWith(WS, expect.objectContaining({ kind: 'created', conversationId: CONV }))
  })

  it('executes reschedule_appointment: updates the active appointment and notifies both sides', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: 'a1' } as any)
    const submit = vi.fn(async () => ({ text: 'Reagendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'reschedule_appointment', args: { newIsoDateTime: '2026-06-16T10:00:00' } }],
      submitToolResults: submit
    })

    const result = await processAiResponse(WS, CONV, 'mejor el martes a las 10')

    expect(rescheduleAppointment).toHaveBeenCalledWith(WS, 'a1', new Date('2026-06-16T10:00:00'))
    expect(notifyAppointmentEventMock).toHaveBeenCalledWith(WS, expect.objectContaining({ kind: 'rescheduled', conversationId: CONV }))
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'reschedule_appointment', response: expect.objectContaining({ success: true }) })
    ])
    expect(result).toBe('Reagendado')
  })

  it('reschedule_appointment returns an error when the contact has no active appointment', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)
    const submit = vi.fn(async () => ({ text: 'No encontré tu cita', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'reschedule_appointment', args: { newIsoDateTime: '2026-06-16T10:00:00' } }],
      submitToolResults: submit
    })

    await processAiResponse(WS, CONV, 'quiero cambiar mi hora')

    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'reschedule_appointment', response: { success: false, error: 'No hay cita activa para reagendar' } })
    ])
  })
```

7. Update the existing split-path tool-list assertion (currently line 225):

```ts
    expect(chatMock.mock.calls[0][0].tools.map((t: any) => t.name)).toEqual(['search_catalog', 'get_available_slots', 'schedule_appointment'])
```

Change to:

```ts
    expect(chatMock.mock.calls[0][0].tools.map((t: any) => t.name)).toEqual(['search_catalog', 'get_available_slots', 'schedule_appointment', 'reschedule_appointment'])
```

And update the comment above it (currently `// responder only ever sees the 3 scoped tools, not the full 9`) to:

```ts
    // responder only ever sees the 4 scoped tools, not the full 10
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx vitest run src/modules/ai-agent/__tests__/ai.service.test.ts`
Expected: FAIL — unknown tool `reschedule_appointment`, tool-list length mismatch, and missing `notifyAppointmentEventMock` calls.

- [ ] **Step 3: Add the import and the tool declaration**

In `Backend/src/modules/ai-agent/ai.service.ts`, line 8 currently reads:

```ts
import { getAvailableSlots, filterSlotsByCalendarBusy, scheduleAppointment } from '../scheduling/scheduling.service'
```

Change to:

```ts
import { getAvailableSlots, filterSlotsByCalendarBusy, scheduleAppointment, rescheduleAppointment } from '../scheduling/scheduling.service'
```

Then, in the `toolDeclarations` array, the `schedule_appointment` entry currently ends at line 127 (`},` closing it) right before the array's closing `]` on line 128:

```ts
  {
    name: 'schedule_appointment',
    description: 'Books an appointment at a confirmed time. Only use times returned by get_available_slots.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        contactId: { type: SchemaType.STRING },
        isoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime' },
        type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' }
      },
      required: ['contactId', 'isoDateTime', 'type']
    }
  }
]
```

Add a new entry after it, before the closing `]`:

```ts
  {
    name: 'schedule_appointment',
    description: 'Books an appointment at a confirmed time. Only use times returned by get_available_slots.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        contactId: { type: SchemaType.STRING },
        isoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime' },
        type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' }
      },
      required: ['contactId', 'isoDateTime', 'type']
    }
  },
  {
    name: 'reschedule_appointment',
    description: "Reschedules the customer's existing appointment to a new confirmed time. Only use times returned by get_available_slots.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        newIsoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime for the new time' }
      },
      required: ['newIsoDateTime']
    }
  }
]
```

Then update `RESPONDER_TOOL_NAMES` (line 130):

```ts
const RESPONDER_TOOL_NAMES = new Set(['search_catalog', 'get_available_slots', 'schedule_appointment'])
```

Change to:

```ts
const RESPONDER_TOOL_NAMES = new Set(['search_catalog', 'get_available_slots', 'schedule_appointment', 'reschedule_appointment'])
```

- [ ] **Step 4: Wire notification into `schedule_appointment` and add the `reschedule_appointment` case**

The current `schedule_appointment` case (lines 575-605) reads:

```ts
      case 'schedule_appointment': {
        const type = args.type ?? 'SITE_VISIT'
        const appt = await scheduleAppointment(workspaceId, {
          contactId,
          type,
          scheduledAt: new Date(args.isoDateTime),
          createdBy: 'BOT'
        })

        // Best-effort: a Calendar sync problem must never make the agent report
        // the booking itself as failed — the Appointment row above already exists.
        try {
          const bookerContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { name: true, email: true }
          })
          const { syncAppointmentToCalendar } = await import('../scheduling/google-calendar.service')
          await syncAppointmentToCalendar(workspaceId, appt.id, {
            title: type === 'SITE_VISIT' ? `Visita técnica — ${bookerContact?.name ?? 'lead'}` : `Llamada — ${bookerContact?.name ?? 'lead'}`,
            startAt: appt.scheduledAt,
            durationMin: appt.durationMin,
            bookerName: bookerContact?.name ?? 'lead',
            bookerEmail: bookerContact?.email ?? null
          })
        } catch (err) {
          console.error('[AI Agent] Calendar sync after schedule_appointment failed (non-blocking):', err)
        }

        await logAiAction(workspaceId, conversationId, `Agendó cita ${args.type} para ${args.isoDateTime}`)
        return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt }
      }

      default:
        return { error: 'Unknown tool' }
```

Replace it with (adds `phone` to the `bookerContact` select, adds the `notifyAppointmentEvent` call, and adds the new `reschedule_appointment` case before `default`):

```ts
      case 'schedule_appointment': {
        const type = args.type ?? 'SITE_VISIT'
        const appt = await scheduleAppointment(workspaceId, {
          contactId,
          type,
          scheduledAt: new Date(args.isoDateTime),
          createdBy: 'BOT'
        })

        // Best-effort: a Calendar sync / notification problem must never make the
        // agent report the booking itself as failed — the Appointment row above
        // already exists.
        try {
          const bookerContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { name: true, email: true, phone: true }
          })
          const { syncAppointmentToCalendar } = await import('../scheduling/google-calendar.service')
          await syncAppointmentToCalendar(workspaceId, appt.id, {
            title: type === 'SITE_VISIT' ? `Visita técnica — ${bookerContact?.name ?? 'lead'}` : `Llamada — ${bookerContact?.name ?? 'lead'}`,
            startAt: appt.scheduledAt,
            durationMin: appt.durationMin,
            bookerName: bookerContact?.name ?? 'lead',
            bookerEmail: bookerContact?.email ?? null
          })

          const { notifyAppointmentEvent } = await import('../scheduling/appointment-notifications.service')
          await notifyAppointmentEvent(workspaceId, {
            contact: { id: contactId, name: bookerContact?.name ?? 'lead', phone: bookerContact?.phone ?? null },
            appointment: { type, scheduledAt: appt.scheduledAt, durationMin: appt.durationMin },
            kind: 'created',
            conversationId
          })
        } catch (err) {
          console.error('[AI Agent] Calendar sync / notify after schedule_appointment failed (non-blocking):', err)
        }

        await logAiAction(workspaceId, conversationId, `Agendó cita ${args.type} para ${args.isoDateTime}`)
        return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt }
      }

      case 'reschedule_appointment': {
        const active = await prisma.appointment.findFirst({
          where: { workspaceId, contactId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          orderBy: { scheduledAt: 'asc' }
        })
        if (!active) return { success: false, error: 'No hay cita activa para reagendar' }

        const rescheduled = await rescheduleAppointment(workspaceId, active.id, new Date(args.newIsoDateTime))

        // Best-effort: a Calendar sync / notification problem must never make the
        // agent report the reschedule itself as failed — the update above already happened.
        try {
          const bookerContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { name: true, phone: true }
          })
          if (rescheduled.googleEventId) {
            const { updateCalendarEvent } = await import('../scheduling/google-calendar.service')
            await updateCalendarEvent(workspaceId, rescheduled.googleEventId, {
              startAt: rescheduled.scheduledAt,
              durationMin: rescheduled.durationMin
            })
          }

          const { notifyAppointmentEvent } = await import('../scheduling/appointment-notifications.service')
          await notifyAppointmentEvent(workspaceId, {
            contact: { id: contactId, name: bookerContact?.name ?? 'lead', phone: bookerContact?.phone ?? null },
            appointment: { type: rescheduled.type, scheduledAt: rescheduled.scheduledAt, durationMin: rescheduled.durationMin },
            kind: 'rescheduled',
            oldScheduledAt: rescheduled.oldScheduledAt,
            conversationId
          })
        } catch (err) {
          console.error('[AI Agent] Calendar sync / notify after reschedule_appointment failed (non-blocking):', err)
        }

        await logAiAction(workspaceId, conversationId, `Reagendó cita ${rescheduled.type} para ${args.newIsoDateTime}`)
        return { success: true, appointmentId: rescheduled.id, scheduledAt: rescheduled.scheduledAt }
      }

      default:
        return { error: 'Unknown tool' }
```

- [ ] **Step 5: Tell the agent the new tool exists (`promptCompiler.ts`)**

In `Backend/src/modules/ai-agent/promptCompiler.ts`, lines 73-77 currently read:

```ts
  const closingAction = profile?.scheduling?.enabled
    ? 'agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots)'
    : includeQualifierRules
      ? 'crea o avanza el deal'
      : 'sigue avanzando la conversación hacia el cierre'
```

Change to:

```ts
  const closingAction = profile?.scheduling?.enabled
    ? 'agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots); si el cliente ya tiene una cita y quiere cambiar la hora, usa reschedule_appointment'
    : includeQualifierRules
      ? 'crea o avanza el deal'
      : 'sigue avanzando la conversación hacia el cierre'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd Backend && npx vitest run src/modules/ai-agent/__tests__/ai.service.test.ts`
Expected: PASS — all tests, including the 3 new ones and the updated tool-list assertion.

- [ ] **Step 7: Run the full backend suite**

Run: `cd Backend && npm test`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 8: Commit**

```bash
git add Backend/src/modules/ai-agent/ai.service.ts Backend/src/modules/ai-agent/promptCompiler.ts Backend/src/modules/ai-agent/__tests__/ai.service.test.ts
git commit -m "feat(ai-agent): add reschedule_appointment tool, notify on booking/reschedule"
```

---

### Task 7: Wire into the public booking route

**Files:**
- Modify: `Backend/src/modules/scheduling/public-booking.routes.ts`
- Test (new): `Backend/src/modules/scheduling/__tests__/public-booking.routes.test.ts`

**Interfaces:**
- Consumes: `notifyAppointmentEvent` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `Backend/src/modules/scheduling/__tests__/public-booking.routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: vi.fn(), create: vi.fn() },
    businessHours: { findUnique: vi.fn(async () => null) }
  }
}))
vi.mock('../../../lib/rateLimit', () => ({
  simpleRateLimit: () => (_req: any, _res: any, next: any) => next()
}))
vi.mock('../scheduling.service', () => ({
  scheduleAppointment: vi.fn(async () => ({
    id: 'a1', type: 'SITE_VISIT', scheduledAt: new Date('2026-07-20T14:00:00Z'), durationMin: 30
  }))
}))
vi.mock('../booking.service', () => ({
  PUBLIC_BOOKING_TYPE: 'SITE_VISIT',
  findWorkspaceBySlug: vi.fn(async () => ({
    id: 'ws-1', name: 'DrillChile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30
  })),
  getPublicSlotsForDate: vi.fn(async () => ['14:00']),
  wallClockToInstant: vi.fn(async () => new Date('2026-07-20T14:00:00Z'))
}))
const syncAppointmentToCalendarMock = vi.fn(async () => {})
vi.mock('../google-calendar.service', () => ({ syncAppointmentToCalendar: syncAppointmentToCalendarMock }))
const notifyAppointmentEventMock = vi.fn(async () => {})
vi.mock('../appointment-notifications.service', () => ({ notifyAppointmentEvent: notifyAppointmentEventMock }))
vi.mock('../../../lib/socket', () => ({ getIO: () => ({ to: () => ({ emit: vi.fn() }) }) }))

import publicBookingRouter from '../public-booking.routes'
import { prisma } from '../../../lib/prisma'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/public', publicBookingRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/booking/:slug/book', () => {
  it('notifies the created appointment after a successful public booking', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1' } as any)

    const res = await request(buildApp())
      .post('/api/public/booking/drillchile/book')
      .send({ name: 'Roberto Test', phone: '+56911112222', date: '2026-07-20', time: '14:00' })

    expect(res.status).toBe(201)
    expect(notifyAppointmentEventMock).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      kind: 'created',
      contact: expect.objectContaining({ id: 'c1', name: 'Roberto Test', phone: '+56911112222' })
    }))
  })

  it('still returns 201 when the notification call throws', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c2' } as any)
    notifyAppointmentEventMock.mockRejectedValueOnce(new Error('whatsapp down'))

    const res = await request(buildApp())
      .post('/api/public/booking/drillchile/book')
      .send({ name: 'Otro Lead', phone: '+56922223333', date: '2026-07-20', time: '14:00' })

    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/public-booking.routes.test.ts`
Expected: FAIL — `notifyAppointmentEventMock` not called (route doesn't call it yet).

- [ ] **Step 3: Wire the call**

In `Backend/src/modules/scheduling/public-booking.routes.ts`, the post-booking section currently reads (lines 180-206):

```ts
  // Google Calendar event creation
  {
    const { syncAppointmentToCalendar } = await import('./google-calendar.service')
    await syncAppointmentToCalendar(ws.id, appt.id, {
      title: ws.bookingTitle ?? 'Cita agendada',
      startAt: appt.scheduledAt,
      durationMin: appt.durationMin,
      bookerName: name,
      bookerEmail: email
    })
  }

  // Invitations are handled automatically by Google Calendar (sendUpdates: 'all')
  // when the workspace has a connected Google account. No separate email needed.

  // Socket notification so dashboard and AI agent react in real time
  try {
    const { getIO } = await import('../../lib/socket')
    getIO().to(`workspace:${ws.id}`).emit('appointment:created', {
      appointmentId: appt.id,
      contactId: contact.id,
      name,
      phone: phoneRaw,
      scheduledAt: appt.scheduledAt
    })
  } catch (_) { /* socket may not be initialized in test environments */ }
})
```

Replace it with (adds the notification call between the Calendar sync block and the socket block):

```ts
  // Google Calendar event creation
  {
    const { syncAppointmentToCalendar } = await import('./google-calendar.service')
    await syncAppointmentToCalendar(ws.id, appt.id, {
      title: ws.bookingTitle ?? 'Cita agendada',
      startAt: appt.scheduledAt,
      durationMin: appt.durationMin,
      bookerName: name,
      bookerEmail: email
    })
  }

  // Invitations are handled automatically by Google Calendar (sendUpdates: 'all')
  // when the workspace has a connected Google account. No separate email needed.

  // WhatsApp confirmation to the lead + internal alert (best-effort, never throws)
  {
    const { notifyAppointmentEvent } = await import('./appointment-notifications.service')
    await notifyAppointmentEvent(ws.id, {
      contact: { id: contact.id, name, phone: phoneRaw },
      appointment: { type: appt.type, scheduledAt: appt.scheduledAt, durationMin: appt.durationMin },
      kind: 'created'
    })
  }

  // Socket notification so dashboard and AI agent react in real time
  try {
    const { getIO } = await import('../../lib/socket')
    getIO().to(`workspace:${ws.id}`).emit('appointment:created', {
      appointmentId: appt.id,
      contactId: contact.id,
      name,
      phone: phoneRaw,
      scheduledAt: appt.scheduledAt
    })
  } catch (_) { /* socket may not be initialized in test environments */ }
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/public-booking.routes.test.ts`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/scheduling/public-booking.routes.ts Backend/src/modules/scheduling/__tests__/public-booking.routes.test.ts
git commit -m "feat(scheduling): notify lead + internal number after a public booking"
```

---

### Task 8: `notifyPhone` in the booking-config API

**Files:**
- Modify: `Backend/src/modules/scheduling/scheduling.routes.ts:112-174`
- Test (new): `Backend/src/modules/scheduling/__tests__/scheduling.routes.test.ts`

**Interfaces:**
- Produces: `GET /scheduling/booking-config` and `PATCH /scheduling/booking-config` now include `notifyPhone` in their request/response bodies. Consumed by Task 9 (`BookingConfigCard.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `Backend/src/modules/scheduling/__tests__/scheduling.routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), update: vi.fn() }
  }
}))
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))

import schedulingRouter from '../scheduling.routes'
import { prisma } from '../../../lib/prisma'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', schedulingRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/scheduling/booking-config', () => {
  it('includes notifyPhone in the response', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56912345678'
    } as any)

    const res = await request(buildApp()).get('/api/scheduling/booking-config')

    expect(res.status).toBe(200)
    expect(res.body.notifyPhone).toBe('+56912345678')
  })
})

describe('PATCH /api/scheduling/booking-config', () => {
  it('saves a trimmed notifyPhone', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30, notifyPhone: '+56912345678'
    } as any)

    const res = await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: '  +56912345678  ' })

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyPhone: '+56912345678' }) })
    )
    expect(res.body.notifyPhone).toBe('+56912345678')
  })

  it('clears notifyPhone when sent as an empty string', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      bookingSlug: 'drillchile', bookingTitle: null, bookingDurationMin: 30, notifyPhone: null
    } as any)

    await request(buildApp())
      .patch('/api/scheduling/booking-config')
      .send({ notifyPhone: '' })

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyPhone: null }) })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/scheduling.routes.test.ts`
Expected: FAIL — `res.body.notifyPhone` is `undefined`, and `prisma.workspace.update` not called with `notifyPhone`.

- [ ] **Step 3: Update the routes**

In `Backend/src/modules/scheduling/scheduling.routes.ts`, the `GET /scheduling/booking-config` handler (lines 112-129) currently reads:

```ts
router.get('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
    })
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    res.json({
      bookingSlug: ws.bookingSlug,
      bookingTitle: ws.bookingTitle,
      bookingDurationMin: ws.bookingDurationMin
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

Replace with:

```ts
router.get('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })
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
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

The `PATCH /scheduling/booking-config` handler (lines 131-174) currently reads:

```ts
router.patch('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })

    const { bookingSlug, bookingTitle, bookingDurationMin } = req.body ?? {}
    const data: { bookingSlug?: string; bookingTitle?: string | null; bookingDurationMin?: number } = {}

    if (bookingSlug !== undefined) {
      const slug = slugify(String(bookingSlug))
      if (!slug) return res.status(400).json({ error: 'El enlace no puede estar vacío' })
      data.bookingSlug = slug
    }
    if (bookingTitle !== undefined) {
      data.bookingTitle = bookingTitle === null ? null : String(bookingTitle).trim().slice(0, 120)
    }
    if (bookingDurationMin !== undefined) {
      const dur = Number(bookingDurationMin)
      if (!Number.isFinite(dur) || dur < 5 || dur > 480) {
        return res.status(400).json({ error: 'La duración debe estar entre 5 y 480 minutos' })
      }
      data.bookingDurationMin = Math.round(dur)
    }

    try {
      const ws = await prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
      })
      res.json({
        bookingSlug: ws.bookingSlug,
        bookingTitle: ws.bookingTitle,
        bookingDurationMin: ws.bookingDurationMin
      })
    } catch (e: any) {
      // Prisma unique-constraint violation on bookingSlug
      if (e?.code === 'P2002') return res.status(409).json({ error: 'slug en uso' })
      throw e
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

Replace with:

```ts
router.patch('/scheduling/booking-config', ...auth, async (req: any, res) => {
  try {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized: missing workspace' })

    const { bookingSlug, bookingTitle, bookingDurationMin, notifyPhone } = req.body ?? {}
    const data: { bookingSlug?: string; bookingTitle?: string | null; bookingDurationMin?: number; notifyPhone?: string | null } = {}

    if (bookingSlug !== undefined) {
      const slug = slugify(String(bookingSlug))
      if (!slug) return res.status(400).json({ error: 'El enlace no puede estar vacío' })
      data.bookingSlug = slug
    }
    if (bookingTitle !== undefined) {
      data.bookingTitle = bookingTitle === null ? null : String(bookingTitle).trim().slice(0, 120)
    }
    if (bookingDurationMin !== undefined) {
      const dur = Number(bookingDurationMin)
      if (!Number.isFinite(dur) || dur < 5 || dur > 480) {
        return res.status(400).json({ error: 'La duración debe estar entre 5 y 480 minutos' })
      }
      data.bookingDurationMin = Math.round(dur)
    }
    if (notifyPhone !== undefined) {
      const trimmed = notifyPhone === null ? '' : String(notifyPhone).trim().slice(0, 40)
      data.notifyPhone = trimmed || null
    }

    try {
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
    } catch (e: any) {
      // Prisma unique-constraint violation on bookingSlug
      if (e?.code === 'P2002') return res.status(409).json({ error: 'slug en uso' })
      throw e
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Backend && npx vitest run src/modules/scheduling/__tests__/scheduling.routes.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd Backend && npm test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/scheduling/scheduling.routes.ts Backend/src/modules/scheduling/__tests__/scheduling.routes.test.ts
git commit -m "feat(scheduling): expose notifyPhone in the booking-config API"
```

---

### Task 9: `notifyPhone` field in the frontend

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/appointments/BookingConfigCard.tsx`
- Test (new): `metria-metrics/Frontend/src/app/dashboard/crm/appointments/__tests__/BookingConfigCard.test.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /scheduling/booking-config` now returning/accepting `notifyPhone` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `metria-metrics/Frontend/src/app/dashboard/crm/appointments/__tests__/BookingConfigCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import { BookingConfigCard } from '../BookingConfigCard'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockResolvedValue({
    bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: null
  })
})

describe('BookingConfigCard — notifyPhone', () => {
  it('shows the placeholder and loads an existing notifyPhone value', async () => {
    mockFetchAPI.mockResolvedValueOnce({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56912345678'
    })
    render(<BookingConfigCard />)

    const input = await screen.findByPlaceholderText('+56 9 1234 5678')
    expect(input).toHaveValue('+56912345678')
  })

  it('sends the trimmed notifyPhone on save', async () => {
    const user = userEvent.setup()
    render(<BookingConfigCard />)

    const input = await screen.findByPlaceholderText('+56 9 1234 5678')
    fireEvent.change(input, { target: { value: '+56 9 8888 7777' } })

    mockFetchAPI.mockResolvedValueOnce({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56 9 8888 7777'
    })
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockFetchAPI).toHaveBeenCalledWith('/scheduling/booking-config', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"notifyPhone":"+56 9 8888 7777"')
      }))
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/crm/appointments/__tests__/BookingConfigCard.test.tsx`
Expected: FAIL — placeholder `+56 9 1234 5678` not found.

- [ ] **Step 3: Add the field**

In `metria-metrics/Frontend/src/app/dashboard/crm/appointments/BookingConfigCard.tsx`:

1. Extend the `BookingConfig` interface (currently lines 14-18):

```tsx
interface BookingConfig {
  bookingSlug: string | null
  bookingTitle: string | null
  bookingDurationMin: number
  notifyPhone: string | null
}
```

2. Add state, right after the existing `duration` state (currently line 40):

```tsx
  const [duration, setDuration] = useState(30)
  const [notifyPhone, setNotifyPhone] = useState('')
```

3. Load it in the existing `useEffect` (currently lines 46-60) — the `.then` callback currently reads:

```tsx
      .then((data: BookingConfig) => {
        if (!active) return
        setSlug(data.bookingSlug ?? '')
        setSavedSlug(data.bookingSlug ?? null)
        setTitle(data.bookingTitle ?? '')
        setDuration(data.bookingDurationMin ?? 30)
      })
```

Change to:

```tsx
      .then((data: BookingConfig) => {
        if (!active) return
        setSlug(data.bookingSlug ?? '')
        setSavedSlug(data.bookingSlug ?? null)
        setTitle(data.bookingTitle ?? '')
        setDuration(data.bookingDurationMin ?? 30)
        setNotifyPhone(data.notifyPhone ?? '')
      })
```

4. Include it in the save payload — `handleSave` (currently lines 68-98) currently sends:

```tsx
      const saved: BookingConfig = await fetchAPI('/scheduling/booking-config', {
        method: 'PATCH',
        body: JSON.stringify({
          bookingSlug: slug,
          bookingTitle: title.trim() || null,
          bookingDurationMin: duration,
        }),
      })
      setSlug(saved.bookingSlug ?? '')
      setSavedSlug(saved.bookingSlug ?? null)
      setTitle(saved.bookingTitle ?? '')
      setDuration(saved.bookingDurationMin ?? 30)
```

Change to:

```tsx
      const saved: BookingConfig = await fetchAPI('/scheduling/booking-config', {
        method: 'PATCH',
        body: JSON.stringify({
          bookingSlug: slug,
          bookingTitle: title.trim() || null,
          bookingDurationMin: duration,
          notifyPhone: notifyPhone.trim() || null,
        }),
      })
      setSlug(saved.bookingSlug ?? '')
      setSavedSlug(saved.bookingSlug ?? null)
      setTitle(saved.bookingTitle ?? '')
      setDuration(saved.bookingDurationMin ?? 30)
      setNotifyPhone(saved.notifyPhone ?? '')
```

And update the `handleSave` `useCallback` dependency array (same function, last line) from:

```tsx
  }, [slug, title, duration, previewSlug])
```

to:

```tsx
  }, [slug, title, duration, notifyPhone, previewSlug])
```

5. Add the input to the JSX — right after the "Título de la página" block (currently lines 198-210, ending `</div>` right before the `{/* Public URL + copy */}` comment on line 212):

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="booking-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Título de la página
          </Label>
          <Input
            id="booking-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Agenda una visita técnica"
            className="rounded-xl"
            maxLength={120}
          />
        </div>
```

Add this new block right after it, still before the `{/* Public URL + copy */}` comment:

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="booking-notify-phone" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Número interno a notificar
          </Label>
          <Input
            id="booking-notify-phone"
            value={notifyPhone}
            onChange={e => setNotifyPhone(e.target.value)}
            placeholder="+56 9 1234 5678"
            className="rounded-xl"
            maxLength={40}
          />
          <p className="text-[11px] text-muted-foreground">
            Recibe un WhatsApp cada vez que se agenda o reagenda una cita.
          </p>
        </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/crm/appointments/__tests__/BookingConfigCard.test.tsx`
Expected: PASS — both tests.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd metria-metrics/Frontend && pnpm test`
Expected: PASS — no regressions.

- [ ] **Step 6: Manually verify in the browser**

Run: `cd metria-metrics/Frontend && pnpm dev`, open `/dashboard/crm/appointments`, confirm the new "Número interno a notificar" field renders with the placeholder, accepts input, and "Guardar cambios" persists it (reload the page and confirm the value comes back).

- [ ] **Step 7: Commit**

```bash
git add "metria-metrics/Frontend/src/app/dashboard/crm/appointments/BookingConfigCard.tsx" "metria-metrics/Frontend/src/app/dashboard/crm/appointments/__tests__/BookingConfigCard.test.tsx"
git commit -m "feat(appointments): add notifyPhone field to booking config UI"
```

---

## Post-plan validation (manual, production)

Once all 9 tasks are merged and deployed, per the design doc's "Validación end-to-end":

1. `db:push` (or the normal migration path) against the **production** DB — `notifyPhone` must exist there too.
2. Set a `notifyPhone` for the DrillChile workspace in Configuración de reservas.
3. Reschedule a test appointment via the WhatsApp agent (or its preview) → confirm the same `Appointment.id` updates its `scheduledAt`, the lead gets a WhatsApp confirmation, and `notifyPhone` gets the internal alert.
4. Book via `/book/drillchile` → confirm the same two notifications fire.
5. Watch server logs for `[appointment-notifications]` errors — if the 24h WhatsApp session window blocks the `notifyPhone` alert (see spec's "Riesgos conocidos"), that's expected until `notifyPhone` has messaged the bot number at least once.
