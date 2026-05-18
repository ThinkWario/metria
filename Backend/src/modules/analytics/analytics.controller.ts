import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'
import { calculateConversationalROAS } from './roas.service'

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
