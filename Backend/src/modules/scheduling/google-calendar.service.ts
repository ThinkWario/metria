import { prisma } from '../../lib/prisma'
import { GoogleCalendarProvider } from '../../lib/oauth/providers/google-calendar'

const provider = new GoogleCalendarProvider()

interface FreeBusyBlock {
  start: string
  end: string
}

/** Returns a valid access token for the workspace, refreshing if expired. */
async function getAccessToken(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalAccessToken: true,
      googleCalRefreshToken: true,
      googleCalTokenExpiry: true
    }
  })
  if (!ws?.googleCalRefreshToken) throw new Error('Google Calendar not connected')

  const expiry = ws.googleCalTokenExpiry ? new Date(ws.googleCalTokenExpiry) : null
  const isExpired = !expiry || expiry <= new Date(Date.now() + 60_000)

  if (isExpired) {
    const tokens = await provider.refreshToken(ws.googleCalRefreshToken)
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        googleCalAccessToken: tokens.accessToken,
        googleCalTokenExpiry: tokens.expiresAt ?? null
      }
    })
    return tokens.accessToken
  }

  return ws.googleCalAccessToken!
}

/** Returns busy blocks from Google Calendar for a date range. */
export async function getFreeBusy(
  workspaceId: string,
  dateMin: Date,
  dateMax: Date
): Promise<FreeBusyBlock[]> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalendarId: true }
  })
  const calId = ws?.googleCalendarId ?? 'primary'

  const accessToken = await getAccessToken(workspaceId)

  const body = {
    timeMin: dateMin.toISOString(),
    timeMax: dateMax.toISOString(),
    items: [{ id: calId }]
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    console.error('[gcal] freeBusy error', await res.text())
    return []
  }

  const data = await res.json() as {
    calendars: Record<string, { busy: { start: string; end: string }[] }>
  }
  return data.calendars[calId]?.busy ?? []
}

/** Creates a Google Calendar event for a booking. Returns the Google event ID. */
export async function createCalendarEvent(
  workspaceId: string,
  opts: {
    title: string
    startAt: Date
    durationMin: number
    bookerName: string
    bookerEmail?: string | null
    workspaceEmail?: string | null
    notes?: string | null
  }
): Promise<string | null> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarId: true }
    })
    const calId = ws?.googleCalendarId ?? 'primary'
    const accessToken = await getAccessToken(workspaceId)

    const endAt = new Date(opts.startAt.getTime() + opts.durationMin * 60_000)

    const attendees: { email: string; displayName?: string }[] = []
    if (opts.bookerEmail) attendees.push({ email: opts.bookerEmail, displayName: opts.bookerName })
    if (opts.workspaceEmail) attendees.push({ email: opts.workspaceEmail })

    const event = {
      summary: opts.title,
      description: opts.notes ?? undefined,
      start: { dateTime: opts.startAt.toISOString() },
      end: { dateTime: endAt.toISOString() },
      attendees,
      reminders: { useDefault: true }
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    )

    if (!res.ok) {
      console.error('[gcal] createEvent error', await res.text())
      return null
    }

    const data = await res.json() as { id: string }
    return data.id
  } catch (err) {
    console.error('[gcal] createCalendarEvent failed (non-blocking):', err)
    return null
  }
}

/** Deletes a Google Calendar event (e.g. on appointment cancellation). */
export async function cancelCalendarEvent(
  workspaceId: string,
  googleEventId: string
): Promise<void> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarId: true }
    })
    const calId = ws?.googleCalendarId ?? 'primary'
    const accessToken = await getAccessToken(workspaceId)

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${googleEventId}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
  } catch (err) {
    console.error('[gcal] cancelCalendarEvent failed (non-blocking):', err)
  }
}

/** Lists all calendars in the connected Google account (for the picker UI). */
export async function listWorkspaceCalendars(
  workspaceId: string
): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const accessToken = await getAccessToken(workspaceId)

  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!res.ok) throw new Error(`[gcal] calendarList failed: ${await res.text()}`)

  const data = await res.json() as {
    items: { id: string; summary: string; primary?: boolean }[]
  }
  return (data.items ?? []).map(c => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary
  }))
}
