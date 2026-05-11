import type { Response } from 'express'
import { getSnapshots, getFunnelSummary, aggregateChannelSnapshot } from './analytics.service'
import { prisma } from '../../lib/prisma'
import type { AuthRequest } from '../../middleware/auth'

export async function listSnapshots(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const days = req.query.days ? Number(req.query.days) : 90
    const channelId = req.query.channelId as string | undefined
    const snapshots = await getSnapshots(workspaceId!, days, channelId)
    res.json({ snapshots })
  } catch (err) {
    console.error('[Analytics] listSnapshots error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function funnelSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const days = req.query.days ? Number(req.query.days) : 90
    const summary = await getFunnelSummary(workspaceId!, days)
    res.json({ summary })
  } catch (err) {
    console.error('[Analytics] funnelSummary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function runAggregation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const workspaceId = req.user!.workspaceId
    const dateStr: string = req.body?.date ?? new Date().toISOString().slice(0, 10)

    const channels = await prisma.channel.findMany({
      where: { workspaceId },
      select: { id: true }
    })

    const results = await Promise.allSettled(
      channels.map(ch => aggregateChannelSnapshot(workspaceId!, ch.id, dateStr))
    )

    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    res.json({ date: dateStr, ok, failed })
  } catch (err) {
    console.error('[Analytics] runAggregation error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
