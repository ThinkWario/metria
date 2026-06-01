import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'
import { calculateConversationalROAS } from './roas.service'
import * as as from './analytics.service'

export async function getROASReportHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { campaignId } = req.query as { campaignId: string }
    
    if (!campaignId) {
        res.status(400).json({ error: 'campaignId is required' })
        return
    }
    
    const report = await calculateConversationalROAS(workspaceId, campaignId)
    res.json(report)
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate ROAS report' })
  }
}

export async function listSnapshots(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const days = parseInt(req.query.days as string) || 30
    const snapshots = await as.getSnapshots(workspaceId, days)
    res.json({ snapshots })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function funnelSummary(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const days = parseInt(req.query.days as string) || 30
    const summary = await as.getFunnelSummary(workspaceId, days)
    res.json({ summary })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function runAggregation(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { channelId, date } = req.body
    if (!channelId || !date) {
      res.status(400).json({ error: 'channelId and date are required' })
      return
    }
    const result = await as.aggregateChannelSnapshot(workspaceId, channelId, date)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
