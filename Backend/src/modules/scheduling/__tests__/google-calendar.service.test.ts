import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn(), update: vi.fn() } }
}))
vi.mock('../../../lib/oauth/providers/google-calendar', () => {
  const mockRefreshToken = vi.fn()
  return {
    GoogleCalendarProvider: class {
      refreshToken = mockRefreshToken
    }
  }
})

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
