import { prisma } from '../../lib/prisma'
import { getFreeBusy } from './google-calendar.service'
import { emitMetaScheduleEvent, emitMetaTechnicalReviewCompletedEvent } from '../meta-events/metaEvents.service'
import type { ActionSource } from '../meta-events/metaEvents.capi'

/**
 * Timezone handling: BusinessHours stores the workspace timezone. When configured,
 * day-of-week and HH:mm math is done on the wall clock of that timezone using the
 * same `toLocaleString` technique as businessHours.service. When no timezone is
 * configured we fall back to server-local time (previous behavior).
 */
async function getWorkspaceTimezone(workspaceId: string): Promise<string | undefined> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || undefined
  } catch {
    return undefined
  }
}

/** Returns a Date whose local fields represent the wall clock of `d` in `tz`. */
function toWallClock(d: Date, tz?: string): Date {
  if (!tz) return d
  return new Date(d.toLocaleString('en-US', { timeZone: tz }))
}

function parseHHmm(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Finds the availability rule whose window contains [minutes, minutes + slot] on `day`. */
function findRuleForTime(rules: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number }[], day: number, minutes: number) {
  return rules.find(r => {
    if (r.dayOfWeek !== day) return false
    return minutes >= parseHHmm(r.startTime) && minutes + r.slotMinutes <= parseHHmm(r.endTime)
  })
}

export async function getAvailableSlots(
  workspaceId: string,
  type: string,
  fromDate: Date,
  daysAhead = 7
): Promise<Date[]> {
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } })
  if (rules.length === 0) return []

  const tz = await getWorkspaceTimezone(workspaceId)

  const until = new Date(fromDate)
  until.setDate(until.getDate() + daysAhead)

  const existing = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: { gte: fromDate, lt: until }
    },
    select: { scheduledAt: true, durationMin: true }
  })
  // interval-overlap: longer or off-grid appointments must block every slot they touch
  const busy = existing.map(a => ({
    start: a.scheduledAt.getTime(),
    end: a.scheduledAt.getTime() + a.durationMin * 60_000
  }))
  const overlapsBusy = (start: number, end: number) => busy.some(b => start < b.end && b.start < end)

  const slots: Date[] = []
  const now = new Date()
  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(fromDate)
    day.setDate(day.getDate() + d)
    const dayWall = toWallClock(day, tz)
    // instant = wall-clock date shifted back by the (server-local vs tz) offset at this moment
    const offset = day.getTime() - dayWall.getTime()
    for (const rule of rules.filter(r => r.dayOfWeek === dayWall.getDay())) {
      const [sh, sm] = rule.startTime.split(':').map(Number)
      const [eh, em] = rule.endTime.split(':').map(Number)
      const cursorWall = new Date(dayWall)
      cursorWall.setHours(sh, sm, 0, 0)
      const endWall = new Date(dayWall)
      endWall.setHours(eh, em, 0, 0)
      let cursorMs = cursorWall.getTime() + offset
      const endMs = endWall.getTime() + offset
      const stepMs = rule.slotMinutes * 60_000
      while (cursorMs + stepMs <= endMs) {
        if (cursorMs > now.getTime() && !overlapsBusy(cursorMs, cursorMs + stepMs)) {
          slots.push(new Date(cursorMs))
        }
        cursorMs += stepMs
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Removes slots that overlap a busy interval on the workspace's connected Google
 * Calendar (e.g. a personal event, or a meeting booked outside Metria). No-op when
 * no Calendar is connected, and never throws — a Calendar lookup failure must not
 * stop the agent from offering appointment times.
 */
export async function filterSlotsByCalendarBusy(workspaceId: string, type: string, slots: Date[]): Promise<Date[]> {
  if (slots.length === 0) return slots
  try {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { googleCalRefreshToken: true } })
    if (!ws?.googleCalRefreshToken) return slots

    const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } })
    const tz = await getWorkspaceTimezone(workspaceId)
    const from = slots[0]
    const to = new Date(slots[slots.length - 1].getTime() + 24 * 60 * 60_000) // generous upper bound
    const busy = await getFreeBusy(workspaceId, from, to)
    if (busy.length === 0) return slots
    const busyIntervals = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))

    return slots.filter(slot => {
      const wall = toWallClock(slot, tz)
      const day = wall.getDay()
      const minutes = wall.getHours() * 60 + wall.getMinutes()
      const rule = findRuleForTime(rules, day, minutes)
      const durationMs = (rule?.slotMinutes ?? 60) * 60_000
      const slotEnd = new Date(slot.getTime() + durationMs)
      return !busyIntervals.some(b => slot < b.end && slotEnd > b.start)
    })
  } catch (err) {
    console.error('[scheduling] filterSlotsByCalendarBusy failed (non-blocking):', err)
    return slots
  }
}

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
  input: { contactId: string; type: string; scheduledAt: Date; dealId?: string; createdBy: string; notes?: string },
  actionSource: ActionSource = 'system_generated'
) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const duration = await resolveSlotDuration(workspaceId, input.type, input.scheduledAt)
  await assertNoCollision(workspaceId, input.scheduledAt, duration)

  const appointment = await prisma.appointment.create({
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

  const qualificationStatus = (contact.qualificationData as any)?.qualificationStatus as string | undefined
  emitMetaScheduleEvent(
    workspaceId, contact, appointment.id, actionSource,
    qualificationStatus ? { qualification_status: qualificationStatus } : undefined
  ).catch(err => console.error('[Scheduling] Schedule event failed:', err))

  return appointment
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

export async function listAppointments(workspaceId: string, from?: Date, to?: Date) {
  return prisma.appointment.findMany({
    where: { workspaceId, ...(from || to ? { scheduledAt: { ...(from && { gte: from }), ...(to && { lt: to }) } } : {}) },
    include: { contact: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: 'asc' }
  })
}

export async function updateAppointmentStatus(workspaceId: string, id: string, status: string) {
  const valid = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
  if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`)
  const appt = await prisma.appointment.findFirst({ where: { id, workspaceId } })
  if (!appt) throw new Error('Appointment not found')
  const updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status } })

  if (status === 'COMPLETED' && appt.status !== 'COMPLETED') {
    const contact = await prisma.contact.findFirst({ where: { id: appt.contactId, workspaceId } })
    if (contact) {
      emitMetaTechnicalReviewCompletedEvent(workspaceId, contact, appt.id)
        .catch(err => console.error('[Scheduling] TechnicalReviewCompleted event failed:', err))
    }
  }

  return updated
}
