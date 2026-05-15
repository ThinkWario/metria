import { prisma } from '../../lib/prisma'

interface DaySchedule {
  open: string
  close: string
  enabled: boolean
}

type BusinessHoursRecord = {
  workspaceId: string
  timezone: string
  monday: DaySchedule | unknown
  tuesday: DaySchedule | unknown
  wednesday: DaySchedule | unknown
  thursday: DaySchedule | unknown
  friday: DaySchedule | unknown
  saturday: DaySchedule | unknown
  sunday: DaySchedule | unknown
  outsideMessage: string | null
}

export async function getBusinessHours(workspaceId: string) {
  return prisma.businessHours.findUnique({ where: { workspaceId } })
}

export async function upsertBusinessHours(
  workspaceId: string,
  data: {
    timezone?: string
    monday?: DaySchedule
    tuesday?: DaySchedule
    wednesday?: DaySchedule
    thursday?: DaySchedule
    friday?: DaySchedule
    saturday?: DaySchedule
    sunday?: DaySchedule
    outsideMessage?: string
  }
) {
  return prisma.businessHours.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data } as any,
    update: data as any
  })
}

export function isOutsideBusinessHours(bh: BusinessHoursRecord): boolean {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: bh.timezone }))
  const dayName = days[localDate.getDay()]
  const schedule = bh[dayName as keyof BusinessHoursRecord] as DaySchedule
  if (!schedule || !schedule.enabled) return true
  const hh = localDate.getHours().toString().padStart(2, '0')
  const mm = localDate.getMinutes().toString().padStart(2, '0')
  const timeStr = `${hh}:${mm}`
  return timeStr < schedule.open || timeStr >= schedule.close
}
