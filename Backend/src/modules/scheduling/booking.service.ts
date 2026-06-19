import { prisma } from '../../lib/prisma'
import { getAvailableSlots } from './scheduling.service'
import { getFreeBusy } from './google-calendar.service'

/**
 * Booking helpers shared by the authenticated config routes and the PUBLIC
 * self-service booking routes. The public booking page reuses the existing
 * availability engine (getAvailableSlots) — it does NOT reimplement availability.
 *
 * The appointment type used for public bookings. Public visitors only ever see
 * one booking type per workspace; we standardise on SITE_VISIT so the existing
 * AvailabilityRule rows (which default to SITE_VISIT) drive availability.
 */
export const PUBLIC_BOOKING_TYPE = 'SITE_VISIT'

const DEFAULT_TIMEZONE = 'America/Santiago'

/** lowercase, collapse to a-z 0-9 and single hyphens, trim leading/trailing hyphens. */
export function slugify(input: string): string {
  return String(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/** Formats an absolute instant as "HH:mm" on the wall clock of `tz`. */
function formatHHmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz
  }).format(d)
}

/** "YYYY-MM-DD" of an absolute instant on the wall clock of `tz`. */
function formatDateKey(d: Date, tz: string): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz
  }).format(d)
}

/** Resolve a workspace by its public booking slug. Returns null if not found. */
export function findWorkspaceBySlug(slug: string) {
  return prisma.workspace.findUnique({
    where: { bookingSlug: slug },
    select: {
      id: true,
      name: true,
      bookingTitle: true,
      bookingDurationMin: true,
      googleCalRefreshToken: true,
      googleCalEmail: true,
      googleCalendarId: true
    }
  })
}

/**
 * Available "HH:mm" slots for a single calendar date (in the workspace timezone),
 * derived from the existing availability engine. `dateStr` is "YYYY-MM-DD".
 * If the workspace has Google Calendar connected, busy intervals are filtered out.
 */
export async function getPublicSlotsForDate(workspaceId: string, dateStr: string): Promise<string[]> {
  const tz = await getWorkspaceTimezone(workspaceId)

  // Build a window that safely covers the requested local date regardless of the
  // server timezone: start at the previous midnight (UTC) and look two days ahead,
  // then filter to slots whose wall-clock date in `tz` matches dateStr.
  const from = new Date(`${dateStr}T00:00:00.000Z`)
  from.setUTCDate(from.getUTCDate() - 1)

  const slots = await getAvailableSlots(workspaceId, PUBLIC_BOOKING_TYPE, from, 3)

  // Filter to slots on the requested date in the workspace timezone
  let daySlots = slots.filter(s => formatDateKey(s, tz) === dateStr)

  // Filter out Google Calendar busy intervals if workspace is connected
  const wsData = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { bookingDurationMin: true, googleCalRefreshToken: true }
  })

  if (wsData?.googleCalRefreshToken) {
    try {
      const durationMs = (wsData.bookingDurationMin ?? 30) * 60_000
      // Wide window to cover timezone edge cases
      const busyFrom = new Date(`${dateStr}T00:00:00.000Z`)
      busyFrom.setUTCDate(busyFrom.getUTCDate() - 1)
      const busyTo = new Date(busyFrom)
      busyTo.setDate(busyTo.getDate() + 3)

      const busyRaw = await getFreeBusy(workspaceId, busyFrom, busyTo)
      if (busyRaw.length > 0) {
        const busyIntervals = busyRaw.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
        daySlots = daySlots.filter(slot => {
          const slotEnd = new Date(slot.getTime() + durationMs)
          return !busyIntervals.some(b => slot < b.end && slotEnd > b.start)
        })
      }
    } catch (err) {
      // Non-blocking: if Google Calendar fails, show all rule-based slots
      console.error('[booking] FreeBusy filter error (non-blocking):', err)
    }
  }

  const times = daySlots.map(s => formatHHmm(s, tz))

  // De-dupe + sort defensively (multiple rules could overlap)
  return Array.from(new Set(times)).sort()
}

/**
 * Combine a "YYYY-MM-DD" date and "HH:mm" time on the workspace wall clock into an
 * absolute Date. We derive the timezone offset by comparing the same instant
 * rendered in UTC vs the target tz.
 */
export async function wallClockToInstant(workspaceId: string, dateStr: string, timeStr: string): Promise<Date> {
  const tz = await getWorkspaceTimezone(workspaceId)
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)

  // Treat the wall-clock components as if they were UTC, then correct by the tz offset.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  const guess = new Date(asUtc)
  // What wall-clock time does `guess` represent in tz? The delta is the offset.
  const tzWall = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const utcWall = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = tzWall.getTime() - utcWall.getTime()
  return new Date(asUtc - offsetMs)
}
