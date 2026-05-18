import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'

export async function getKnowledgeSourceHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    
    // Fetch products and business policies for sync
    const products = await prisma.product.findMany({ where: { workspaceId } })
    const settings = await prisma.globalSetting.findUnique({ where: { workspaceId } })
    
    res.json({ products, settings })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch knowledge data' })
  }
}

export async function syncMetaKnowledgeHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { entities } = req.body // e.g., ['products', 'faq']

    // 1. Fetch data
    const products = entities.includes('products') ? await prisma.product.findMany({ where: { workspaceId } }) : []
    
    // 2. Prepare payload for Meta Graph API
    // Placeholder for actual Meta AI KB API call
    console.log(`[MetaAI] Syncing ${entities.join(', ')} for workspace ${workspaceId}`)
    
    res.status(200).json({ ok: true, synced: entities })
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' })
  }
}
