import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { initiateConnection } from '../lib/composio'

const router = Router()

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

const VALID_TOOLKITS: Record<string, string> = {
  INSTAGRAM: 'instagram',
  METAADS: 'metaads',
  FACEBOOK: 'facebook',
  MESSENGER: 'messenger'
}

// POST /api/composio/connect  { toolkit: "INSTAGRAM" }
// Returns { redirectUrl } — frontend does window.location.href = redirectUrl
router.post('/connect', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { toolkit } = req.body as { toolkit: string }
  const workspaceId = (req as any).user?.workspaceId as string

  const toolkitKey = toolkit?.toUpperCase()
  if (!VALID_TOOLKITS[toolkitKey]) {
    res.status(400).json({ error: `toolkit must be one of: ${Object.keys(VALID_TOOLKITS).join(', ')}` })
    return
  }

  if (!process.env.COMPOSIO_API_KEY) {
    res.status(503).json({ error: 'COMPOSIO_API_KEY not configured on server' })
    return
  }

  try {
    const callbackUrl = `${BACKEND_URL}/api/composio/callback?workspaceId=${workspaceId}&toolkit=${toolkitKey}`
    const connectionRequest = await initiateConnection(workspaceId, VALID_TOOLKITS[toolkitKey], callbackUrl)
    res.json({ redirectUrl: connectionRequest.redirectUrl })
  } catch (err: any) {
    console.error('[Composio] connect error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/composio/callback?workspaceId=xxx&toolkit=INSTAGRAM&status=success&connected_account_id=ca_abc
// Called by Composio browser redirect — no auth header.
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, toolkit, status, connected_account_id } = req.query as Record<string, string>

  if (status !== 'success' || !connected_account_id || !workspaceId) {
    const msg = 'Conexión cancelada o fallida.'
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_error=${encodeURIComponent(msg)}`)
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      res.status(404).send('Workspace not found')
      return
    }

    const existing = (workspace.composioConnections as Record<string, any>) ?? {}
    const updated = {
      ...existing,
      [toolkit]: {
        connectedAccountId: connected_account_id,
        connectedAt: new Date().toISOString()
      }
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { composioConnections: updated }
    })

    console.log(`[Composio] ${toolkit} connected for workspace ${workspaceId}`)
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_success=${toolkit}`)
  } catch (err: any) {
    console.error('[Composio] callback error:', err.message)
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_error=${encodeURIComponent(err.message)}`)
  }
})

// GET /api/composio/status
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = (req as any).user?.workspaceId as string
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { composioConnections: true }
    })
    res.json(workspace?.composioConnections ?? {})
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/composio/disconnect?toolkit=INSTAGRAM
router.delete('/disconnect', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { toolkit } = req.query as { toolkit: string }
  const workspaceId = (req as any).user?.workspaceId as string
  const toolkitKey = toolkit?.toUpperCase()

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    const existing = (workspace?.composioConnections as Record<string, any>) ?? {}
    const { [toolkitKey]: _removed, ...rest } = existing
    await prisma.workspace.update({ where: { id: workspaceId }, data: { composioConnections: rest } })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
