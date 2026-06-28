import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { authenticate, AuthRequest } from '../../middleware/auth'
import { GoogleCalendarProvider } from '../../lib/oauth/providers/google-calendar'
import { listWorkspaceCalendars } from '../../modules/scheduling/google-calendar.service'

const router = Router()
const provider = new GoogleCalendarProvider()
const REDIRECT_URI = () =>
  `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/integrations/google-calendar/callback`
const FRONTEND_URL = () => (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim()

// GET /api/integrations/google-calendar/auth
// Returns the Google OAuth consent URL for the logged-in workspace.
router.get('/auth', authenticate, (req: AuthRequest, res: Response) => {
  const workspaceId = req.user!.workspaceId
  if (!workspaceId) return res.status(400).json({ error: 'No workspace' })
  const url = provider.getAuthUrl(workspaceId)
  res.json({ url })
})

// GET /api/integrations/google-calendar/callback
// Browser redirect from Google — no auth header available here.
router.get('/callback', async (req, res) => {
  const { code, state: workspaceId, error } = req.query as Record<string, string>

  if (error || !code || !workspaceId) {
    return res.redirect(`${FRONTEND_URL()}/dashboard/settings?cal_error=1`)
  }

  try {
    const tokens = await provider.exchangeCode(code, REDIRECT_URI())

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
    const userInfo = (await userRes.json()) as { email?: string }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        googleCalAccessToken: tokens.accessToken,
        googleCalRefreshToken: tokens.refreshToken ?? null,
        googleCalEmail: userInfo.email ?? null,
        googleCalendarId: 'primary',
        googleCalTokenExpiry: tokens.expiresAt ?? null
      }
    })

    res.redirect(`${FRONTEND_URL()}/dashboard/settings?cal_connected=1`)
  } catch (err) {
    console.error('[gcal-oauth] callback error:', err)
    res.redirect(`${FRONTEND_URL()}/dashboard/settings?cal_error=1`)
  }
})

// GET /api/integrations/google-calendar/status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  const workspaceId = req.user!.workspaceId!
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalEmail: true,
      googleCalendarId: true,
      googleCalRefreshToken: true
    }
  })
  res.json({
    connected: !!workspace?.googleCalRefreshToken,
    email: workspace?.googleCalEmail ?? null,
    calendarId: workspace?.googleCalendarId ?? null
  })
})

// GET /api/integrations/google-calendar/calendars
// Lists all calendars in the connected Google account (for picker).
router.get('/calendars', authenticate, async (req: AuthRequest, res: Response) => {
  const workspaceId = req.user!.workspaceId!
  try {
    const calendars = await listWorkspaceCalendars(workspaceId)
    res.json({ calendars })
  } catch (err) {
    console.error('[gcal] listCalendars error:', err)
    res.status(502).json({ error: 'Failed to fetch calendars from Google' })
  }
})

// PATCH /api/integrations/google-calendar/calendar
// Choose which calendar to use for free/busy + event creation.
router.patch('/calendar', authenticate, async (req: AuthRequest, res: Response) => {
  const workspaceId = req.user!.workspaceId!
  const { calendarId } = req.body as { calendarId?: string }
  if (!calendarId) return res.status(400).json({ error: 'calendarId required' })
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { googleCalendarId: calendarId }
  })
  res.json({ ok: true })
})

// DELETE /api/integrations/google-calendar
// Revokes the token and clears calendar credentials.
router.delete('/', authenticate, async (req: AuthRequest, res: Response) => {
  const workspaceId = req.user!.workspaceId!
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalAccessToken: true }
  })
  if (ws?.googleCalAccessToken) {
    fetch(
      `https://oauth2.googleapis.com/revoke?token=${ws.googleCalAccessToken}`,
      { method: 'POST' }
    ).catch(() => {})
  }
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      googleCalAccessToken: null,
      googleCalRefreshToken: null,
      googleCalEmail: null,
      googleCalendarId: null,
      googleCalTokenExpiry: null
    }
  })
  res.json({ ok: true })
})

export default router
