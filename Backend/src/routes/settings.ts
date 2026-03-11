import { Router } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
    getGlobalSettings,
    updateGlobalSettings,
    getIntegrations,
    updateIntegration
} from '../controllers/settingsController'
import { requireRole } from '../middleware/roleAuth'

const router = Router()

router.get('/global', requireRole(['SUPER_ADMIN', 'ADMIN', 'VIEWER']), getGlobalSettings)
router.post('/global', requireRole(['SUPER_ADMIN', 'ADMIN']), updateGlobalSettings)
router.get('/integrations', requireRole(['SUPER_ADMIN', 'ADMIN', 'VIEWER']), getIntegrations)
router.post('/integrations', requireRole(['SUPER_ADMIN', 'ADMIN']), updateIntegration)

// --- Workspace Logo ---

// GET /api/settings/logo — Get workspace logo
router.get('/logo', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId as string },
            select: { logoUrl: true },
        })
        res.json({ logoUrl: workspace?.logoUrl || null })
    } catch (error) {
        console.error('Get logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// POST /api/settings/logo — Upload workspace logo (ADMIN only, base64 data URL)
router.post('/logo', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {

        const { logoUrl } = req.body
        if (!logoUrl || typeof logoUrl !== 'string') {
            return res.status(400).json({ error: 'logoUrl is required (base64 data URL)' })
        }

        // Enforce ~2MB limit for base64 string
        if (logoUrl.length > 2_800_000) {
            return res.status(400).json({ error: 'Logo file exceeds 2MB limit' })
        }

        const workspace = await prisma.workspace.update({
            where: { id: req.user!.workspaceId as string },
            data: { logoUrl },
            select: { logoUrl: true },
        })
        res.json(workspace)
    } catch (error) {
        console.error('Upload logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// DELETE /api/settings/logo — Remove workspace logo (ADMIN only)
router.delete('/logo', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {

        await prisma.workspace.update({
            where: { id: req.user!.workspaceId as string },
            data: { logoUrl: null },
        })
        res.json({ message: 'Logo removed successfully' })
    } catch (error) {
        console.error('Delete logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router

