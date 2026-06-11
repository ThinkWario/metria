import { prisma } from '../../lib/prisma'

function slotKey(d: Date) { return d.getTime() }

export async function getAvailableSlots(
  workspaceId: string,
  type: string,
  fromDate: Date,
  daysAhead = 7
): Promise<Date[]> {
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } })
  if (rules.length === 0) return []

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
  const taken = new Set(existing.map(a => slotKey(a.scheduledAt)))

  const slots: Date[] = []
  const now = new Date()
  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(fromDate)
    day.setDate(day.getDate() + d)
    for (const rule of rules.filter(r => r.dayOfWeek === day.getDay())) {
      const [sh, sm] = rule.startTime.split(':').map(Number)
      const [eh, em] = rule.endTime.split(':').map(Number)
      const cursor = new Date(day)
      cursor.setHours(sh, sm, 0, 0)
      const end = new Date(day)
      end.setHours(eh, em, 0, 0)
      while (cursor.getTime() + rule.slotMinutes * 60_000 <= end.getTime()) {
        if (cursor > now && !taken.has(slotKey(cursor))) slots.push(new Date(cursor))
        cursor.setMinutes(cursor.getMinutes() + rule.slotMinutes)
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime())
}

export async function scheduleAppointment(
  workspaceId: string,
  input: { contactId: string; type: string; scheduledAt: Date; dealId?: string; createdBy: string; notes?: string }
) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: input.type } })
  const day = input.scheduledAt.getDay()
  const minutes = input.scheduledAt.getHours() * 60 + input.scheduledAt.getMinutes()
  const inWindow = rules.some(r => {
    if (r.dayOfWeek !== day) return false
    const [sh, sm] = r.startTime.split(':').map(Number)
    const [eh, em] = r.endTime.split(':').map(Number)
    return minutes >= sh * 60 + sm && minutes + r.slotMinutes <= eh * 60 + em
  })
  if (!inWindow) throw new Error('Requested time is outside availability')

  const dayStart = new Date(input.scheduledAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  const sameDay = await prisma.appointment.findMany({
    where: { workspaceId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, scheduledAt: { gte: dayStart, lt: dayEnd } },
    select: { scheduledAt: true, durationMin: true }
  })
  const requested = input.scheduledAt.getTime()
  const duration = (rules.find(r => r.dayOfWeek === day)?.slotMinutes ?? 60) * 60_000
  const collision = sameDay.some(a => {
    const start = a.scheduledAt.getTime()
    return requested < start + a.durationMin * 60_000 && start < requested + duration
  })
  if (collision) throw new Error('Slot already taken')

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
  return prisma.appointment.update({ where: { id: appt.id }, data: { status } })
}
