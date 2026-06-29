import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import { analyzeSheet, syncSheet, extractSheetId } from './sheets.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// Analyze a sheet URL → returns headers + suggested mappings
router.post('/sheets/analyze', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { url } = req.body
    if (!url) { res.status(400).json({ error: 'url requerida' }); return }
    const result = await analyzeSheet(url)
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// Create integration
router.post('/sheets', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const {
      sheetUrl, sheetId, sheetName, campaignLabel,
      fieldMappings, qualificationFields, qualificationRules,
      importFilter, targetPipelineId, targetStageId,
    } = req.body

    if (!sheetUrl || !sheetId || !sheetName || !fieldMappings || !targetPipelineId || !targetStageId) {
      res.status(400).json({ error: 'Faltan campos requeridos' }); return
    }

    const integration = await prisma.sheetIntegration.create({
      data: {
        workspaceId,
        sheetUrl,
        sheetId: sheetId ?? extractSheetId(sheetUrl),
        sheetName,
        campaignLabel,
        fieldMappings,
        qualificationFields: qualificationFields ?? null,
        qualificationRules: qualificationRules ?? null,
        importFilter: importFilter ?? 'ALL',
        targetPipelineId,
        targetStageId,
      },
      include: { pipeline: { select: { name: true } }, stage: { select: { name: true } } },
    })

    res.status(201).json({ success: true, data: integration })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// List integrations for workspace
router.get('/sheets', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const integrations = await prisma.sheetIntegration.findMany({
      where: { workspaceId },
      include: {
        pipeline: { select: { name: true } },
        stage: { select: { name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: integrations })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update integration (toggle active, change filter, edit config)
router.patch('/sheets/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { id } = req.params
    const existing = await prisma.sheetIntegration.findFirst({ where: { id, workspaceId } })
    if (!existing) { res.status(404).json({ error: 'Integración no encontrada' }); return }

    const {
      isActive, campaignLabel, fieldMappings,
      qualificationFields, qualificationRules,
      importFilter, targetPipelineId, targetStageId,
    } = req.body

    const updated = await prisma.sheetIntegration.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(campaignLabel !== undefined && { campaignLabel }),
        ...(fieldMappings !== undefined && { fieldMappings }),
        ...(qualificationFields !== undefined && { qualificationFields }),
        ...(qualificationRules !== undefined && { qualificationRules }),
        ...(importFilter !== undefined && { importFilter }),
        ...(targetPipelineId !== undefined && { targetPipelineId }),
        ...(targetStageId !== undefined && { targetStageId }),
      },
      include: { pipeline: { select: { name: true } }, stage: { select: { name: true, color: true } } },
    })

    res.json({ success: true, data: updated })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// Delete integration
router.delete('/sheets/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { id } = req.params
    const existing = await prisma.sheetIntegration.findFirst({ where: { id, workspaceId } })
    if (!existing) { res.status(404).json({ error: 'Integración no encontrada' }); return }
    await prisma.sheetIntegration.delete({ where: { id } })
    res.json({ success: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// Manual sync
router.post('/sheets/:id/sync', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.user!.workspaceId!
    const { id } = req.params
    const existing = await prisma.sheetIntegration.findFirst({ where: { id, workspaceId } })
    if (!existing) { res.status(404).json({ error: 'Integración no encontrada' }); return }
    const result = await syncSheet(id)
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
